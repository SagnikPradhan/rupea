module Extraction.Runtime where

import Control.Applicative ((<|>))
import Data.Bifunctor (second)
import Data.Char (chr, ord)
import Data.Functor ((<&>))
import Data.Scientific (Scientific)
import Data.Text (Text)
import Data.Time (Day)
import Extraction.File (Grid, Row)

import Data.HashMap.Strict qualified as HM
import Data.Text qualified as T
import Data.Text.Read qualified as TR
import Data.Time qualified as Time
import Data.Vector qualified as V
import Extraction.Schema qualified as Schema
import Text.Regex.Pcre2 qualified as RE

type HeaderMap = HM.HashMap Text Int
data ExtractionContext = ExtractionContext {
    csvHeaders :: HeaderMap,
    canonicalHeaders :: HeaderMap
}
    deriving Show

resolveHeader :: Text -> ExtractionContext -> Maybe Int
resolveHeader col ctx =
    HM.lookup col (csvHeaders ctx) <|> HM.lookup col (canonicalHeaders ctx)

matchesRow :: Schema.RecordFilter -> ExtractionContext -> Row -> Bool
matchesRow filter_ ctx r =
    maybe False (RE.matches $ Schema.matches filter_) $ do
        idx <- resolveHeader (Schema.col filter_) ctx
        r V.!? idx

filterRows :: Schema.Records -> ExtractionContext -> Grid -> Grid
filterRows r ctx = maybe id (\filter_ -> V.filter (matchesRow filter_ ctx)) (Schema.where_ r)

data RuntimeTransformValue = TextValue Text | NumberValue Scientific | DateValue Day
    deriving Show

transformValue :: Schema.Transform -> RuntimeTransformValue -> RuntimeTransformValue
transformValue (Schema.Pure Schema.Trim) (TextValue t) = TextValue (T.strip t)
transformValue (Schema.Pure Schema.Trim) v = v
transformValue (Schema.Pure Schema.ToNumber) (TextValue t) = v'
    where
        t' = T.strip $ T.replace "₹" "" $ T.replace "," "" $ T.replace "INR" "" t
        v' = either (const (TextValue t)) (NumberValue . fst) (TR.rational t')
transformValue (Schema.Pure Schema.ToNumber) v = v
transformValue (Schema.Pure Schema.Negate) (NumberValue n) = NumberValue (negate n)
transformValue (Schema.Pure Schema.Negate) v = v
transformValue (Schema.Replace Schema.Replacement {from, to}) (TextValue t) = TextValue (T.replace from to t)
transformValue (Schema.Replace _) v = v
transformValue (Schema.Date f) (TextValue t) = v'
    where
        d' = Time.parseTimeM True Time.defaultTimeLocale (T.unpack f) (T.unpack t)
        v' = maybe (TextValue t) DateValue d'
transformValue (Schema.Date _) v = v

fromRight :: a -> Either b a -> a
fromRight _ (Right a) = a
fromRight d _ = d

type CellLocation = (Maybe Int, Int)
data ExtractionLocatorContext = LocatorContext {
    grid :: Grid,
    location :: CellLocation,
    ctx :: ExtractionContext
}

moveRow :: (Int -> Int) -> ExtractionLocatorContext -> ExtractionLocatorContext
moveRow f c = c {location = second f (location c)}
moveCol :: (Maybe Int -> Int) -> ExtractionLocatorContext -> ExtractionLocatorContext
moveCol f c = c {location = (Just $ f (fst (location c)), snd (location c))}
setColFromCtx :: (ExtractionContext -> Maybe Int) -> ExtractionLocatorContext -> ExtractionLocatorContext
setColFromCtx f c = c {location = (f (ctx c), snd (location c))}
setColFromSearch :: (Text -> Bool) -> ExtractionLocatorContext -> ExtractionLocatorContext
setColFromSearch f c = c {location = (V.findIndex f $ grid c V.! rowIdx, rowIdx)}
    where
        rowIdx = snd (location c)

resolveLocator :: Schema.Locator -> ExtractionLocatorContext -> ExtractionLocatorContext
resolveLocator (Schema.Right' n) = moveCol $ maybe n (+ n)
resolveLocator (Schema.Left' n) = moveCol $ maybe (-n) (\x -> x - n)
resolveLocator (Schema.Above n) = moveRow (\r -> r - n)
resolveLocator (Schema.Below n) = moveRow (+ n)
resolveLocator (Schema.Col n) = setColFromCtx $ \ctx -> HM.lookup n (canonicalHeaders ctx)
resolveLocator (Schema.Header n) = setColFromCtx $ \ctx -> HM.lookup n (csvHeaders ctx)
resolveLocator (Schema.Text t) = setColFromSearch (== t)
resolveLocator (Schema.Regex r) = setColFromSearch $ RE.matches r

createCanoncialHeaders :: Int -> HeaderMap
createCanoncialHeaders n = HM.fromList [(name i, i) | i <- [0 .. n - 1]]
    where
        char x = T.singleton $ chr (ord 'A' + x)
        go x | x < 0 = []
        go x = let (q, r) = (x `divMod` 26) in char r : go (q - 1)
        name = T.reverse . T.concat . go

prepareGrid :: Schema.Schema -> Extraction.File.Grid -> (ExtractionContext, Extraction.File.Grid)
prepareGrid schema grid = (ctx, grid')
    where
        csvHeaders = HM.fromList $ zip (V.toList $ V.head grid) [0 ..]
        ctx = ExtractionContext {csvHeaders = csvHeaders, canonicalHeaders = createCanoncialHeaders $ max 26 (HM.size csvHeaders)}
        grid' = filterRows (Schema.records schema) ctx (V.drop 1 grid)

data ParsedRecord = ParsedRecord {
    amount :: Maybe RuntimeTransformValue,
    date :: Maybe RuntimeTransformValue,
    description :: Maybe RuntimeTransformValue,
    category :: Maybe RuntimeTransformValue
}
    deriving Show

extractField :: Schema.Field -> ExtractionContext -> Int -> Extraction.File.Grid -> Maybe RuntimeTransformValue
extractField Schema.Field {from, pipe} ctx idx grid = value <&> \v -> foldl' (flip transformValue) (TextValue v) pipe
    where
        ctx' = LocatorContext {grid, ctx, location = (Nothing, idx)}
        (col, row) = location $ foldl' (flip resolveLocator) ctx' from
        value = col >>= \c -> grid V.!? row >>= (V.!? c)

extractRows :: Schema.Schema -> ExtractionContext -> Extraction.File.Grid -> V.Vector ParsedRecord
extractRows schema ctx grid = V.imap extract grid
    where
        fields = Schema.fields schema
        extract row _ =
            ParsedRecord {
                amount = extractField (Schema.amount fields) ctx row grid,
                date = extractField (Schema.date fields) ctx row grid,
                description = extractField (Schema.description fields) ctx row grid,
                category = Schema.category fields >>= \f -> extractField f ctx row grid
            }
