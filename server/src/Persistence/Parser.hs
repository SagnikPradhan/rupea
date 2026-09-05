module Persistence.Parser where

import Data.Bifunctor (Bifunctor (bimap))
import Data.Either (partitionEithers)
import Data.Text (Text)
import Data.Time (Day)
import Shared.Config
import Shared.Error

import Data.List qualified as L
import Data.Text qualified as T
import Data.Text.Read qualified as TR
import Data.Time.Format qualified as Time

data Transaction = Transaction {
    date :: Day,
    description :: Text,
    postings :: [Posting]
}
    deriving (Eq, Show)

data Posting = Posting {
    account :: Text,
    amount :: Maybe Double
}
    deriving (Eq, Show)

data Line = Line {
    location :: ParseLocation,
    content :: Text
}
    deriving (Eq, Show)

parseTransaction :: RupeeConfiguration -> [Line] -> ([RupeeError], [Transaction])
parseTransaction configuration (header : rest) =
    case parseHeader (dateFormat configuration) header of
        Right (date, description) -> (e1 ++ e2, r1 ++ r2)
            where
                result [] [] = ([RuppeParseMissingTransactionBody (location header)], [])
                result e [] = (e, [])
                result e p = (e, [Transaction date description p])
                (errors, postings, next) = parsePostings rest
                (e1, r1) = result errors postings
                (e2, r2) = parseTransaction configuration next
        Left err -> ([err], [])
parseTransaction _ _ = ([], [])

parseHeader :: Text -> Line -> Either RupeeError (Day, Text)
parseHeader dateFormat Line {location, content} = case bimap parseDate parseDescription (T.break (== ' ') content) of
    (Just date, description) | not $ T.null description -> Right (date, description)
    _ -> Left $ RupeeParseInvalidTransactionHeader location
    where
        parseDate = Time.parseTimeM True Time.defaultTimeLocale (T.unpack dateFormat) . T.unpack
        parseDescription = T.strip

parsePostings :: [Line] -> ([RupeeError], [Posting], [Line])
parsePostings v =
    let isIndented Line {content} = T.isPrefixOf "\t" content
        (current, next) = L.span isIndented v
        (errors, postings) = partitionEithers $ map parsePosting current
     in (errors, postings, next)

parsePosting :: Line -> Either RupeeError Posting
parsePosting Line {location, content} = case T.words content of
    [] -> Left $ RupeeParseInvalidPosting location
    [account] -> Right $ Posting (parseAccount [account]) Nothing
    [account, amount] -> Posting account . Just <$> parseAmount location amount
    _ -> Left $ RupeeParseInvalidPosting location
    where
        parseAccount = T.unwords
        parseAmount :: ParseLocation -> Text -> Either RupeeError Double
        parseAmount location' =
            either (const $ Left $ RupeeParseInvalidPosting location') (Right . fst)
                . TR.rational
                . T.strip
                . T.replace "₹" ""
                . T.replace "," ""
