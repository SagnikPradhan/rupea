{-# LANGUAGE CApiFFI #-}
{-# LANGUAGE DeriveAnyClass #-}
{-# LANGUAGE DuplicateRecordFields #-}
{-# LANGUAGE ForeignFunctionInterface #-}

module Extraction.Pdf where

import Control.Exception (bracket)
import Control.Monad ((>=>))
import Data.List (sortBy)
import Data.Ord (Down (Down))
import Debug.Trace (traceShowId)
import Foreign
import Foreign.C
import Foreign.CStorable (CStorable (cAlignment, cPeek, cPoke, cSizeOf))
import GHC.Generics (Generic)

import Data.List qualified as L
import Data.Text qualified as T

data PDFDocumentStruct
type PDFDocument = Ptr PDFDocumentStruct

data PDFChar = PDFChar {
    char :: CChar,
    x1 :: CDouble,
    y1 :: CDouble,
    x2 :: CDouble,
    y2 :: CDouble
}
    deriving (CStorable, Generic, Show)

instance Storable PDFChar where
    sizeOf = cSizeOf
    alignment = cAlignment
    poke = cPoke
    peek = cPeek

data PDFPage = PDFPage {
    page :: CInt,
    chars :: Ptr PDFChar,
    charsCount :: CInt
}
    deriving (CStorable, Generic, Show)

instance Storable PDFPage where
    sizeOf = cSizeOf
    alignment = cAlignment
    poke = cPoke
    peek = cPeek

foreign import capi "pdf_wrapper.h read_pdf" readPDF_ :: CString -> CString -> IO PDFDocument
foreign import capi "pdf_wrapper.h read_pdf_page" readPDFPage_ :: PDFDocument -> CInt -> IO (Ptr PDFPage)
foreign import capi "pdf_wrapper.h close_pdf" closePDF_ :: PDFDocument -> IO ()
foreign import capi "pdf_wrapper.h close_pdf_page" closePDFPage_ :: Ptr PDFPage -> IO ()

data PDFText = PDFText {
    text :: T.Text,
    x1 :: Int,
    y1 :: Int,
    x2 :: Int,
    y2 :: Int
}
    deriving (Eq, Show)

readPDF :: String -> String -> Int -> IO [[T.Text]]
readPDF filename password pageIdx = withPDFPage filename password pageIdx main
    where
        main ptr = do
            page <- peekArray (fromIntegral $ charsCount ptr) (chars ptr)
            let charTolerance = getCharWidth page
            let wordTolerance = charTolerance
            let text = mapChars charTolerance 1 . sortBy comparePDFChar $ page
            let rows = traceShowId $ groupRows text
            pure $ columns wordTolerance (traceShowId $ columnAnchors wordTolerance rows) rows

withPDFPage :: String -> String -> Int -> (PDFPage -> IO a) -> IO a
withPDFPage filename password pageIdx f = withPDF filename password (withPage pageIdx f)
    where
        withPDF file pass f' =
            withCString file $ \file' ->
                withCString pass $ \pass' ->
                    bracket (readPDF_ file' pass') closePDF_ f'
        withPage idx f' document =
            bracket (readPDFPage_ document (fromIntegral idx)) closePDFPage_ (peek >=> f')

-- Not euclidean distance because we want to sort by lines
comparePDFChar :: PDFChar -> PDFChar -> Ordering
comparePDFChar
    PDFChar {y1 = ay1, x1 = ax1, y2 = ay2}
    PDFChar {y1 = by1, x1 = bx1, y2 = by2}
        | sameLine = compare ax1 bx1
        | otherwise = compare by1 ay1
        where
            sameLine = ay1 <= by2 && by1 <= ay2

getCharWidth :: [PDFChar] -> Int
getCharWidth chars = round $ median [realToFrac (x2 - x1) :: Double | PDFChar {x1 = x1, x2 = x2} <- chars]

mapChars :: Int -> Int -> [PDFChar] -> [PDFText]
mapChars xTolerance yTolerance chars = reverse $ L.foldl' consolidate [] (L.map toText chars)
    where
        consolidate [] curr = [curr]
        consolidate (prev : rest) curr
            | overlaps prev curr = mergeText prev curr : rest
            | otherwise = curr : prev : rest
        overlaps :: PDFText -> PDFText -> Bool
        overlaps
            PDFText {x1 = ax1, x2 = ax2, y1 = ay1, y2 = ay2}
            PDFText {x1 = bx1, x2 = bx2, y1 = by1, y2 = by2} =
                ax1 <= bx2 + xTolerance
                    && bx1 <= ax2 + xTolerance
                    && ay1 <= by2 + yTolerance
                    && by1 <= ay2 + yTolerance
        mergeText PDFText {x1 = ax1, x2 = ax2, y1 = ay1, y2 = ay2, text = at} PDFText {x1 = bx1, x2 = bx2, y1 = by1, y2 = by2, text = bt} =
            PDFText {
                x1 = min ax1 bx1,
                x2 = max ax2 bx2,
                y1 = min ay1 by1,
                y2 = max ay2 by2,
                text = T.concat [at, bt]
            }
        toInt = round . (realToFrac :: CDouble -> Double)
        toText PDFChar {char = c, x1 = x1, x2 = x2, y1 = y1, y2 = y2} =
            PDFText {
                x1 = toInt x1,
                x2 = toInt x2,
                y1 = toInt y1,
                y2 = toInt y2,
                text = T.singleton (castCCharToChar c)
            }

groupRows :: [PDFText] -> [[PDFText]]
groupRows xs = go (L.sortOn (\PDFText {y1 = y} -> y) xs)
    where
        go [] = []
        go (t : ts) =
            let (same, rest) = L.span (sameRow t) ts
             in L.sortOn (\PDFText {x1 = x} -> x) (t : same) : go rest
        sameRow PDFText {y1 = t1, y2 = t2} PDFText {y1 = u1, y2 = u2} = min t2 u2 >= max t1 u1

columnAnchors :: Int -> [[PDFText]] -> [Int]
columnAnchors tolerance text = mean'
    where
        similar' a a' = abs (a - a') < tolerance
        similar row row' =
            let matched = length $ filter (\x -> any (similar' x) row') row
                possible = min (length row) (length row')
             in matched * 100 > possible * 85
        group [] = []
        group (row : rest) = let (same, rest') = L.span (similar row) rest in (row : same) : group rest'
        starts = L.sortOn (Down . length) $ map (map (\PDFText {x1} -> x1)) text
        largest =
            let groups = group starts
                score xs = (maximum (map length xs), length xs)
                best = maximum (map score groups)
             in filter ((== best) . score) groups
        -- We mean across the corresponding columns of the largest groups
        mean' = map mean . L.transpose . map (map mean . L.transpose) $ largest

columns :: Int -> [Int] -> [[PDFText]] -> [[T.Text]]
columns tolerance anchors = map $ \row ->
    [ serialize [p | p <- row, column p == i]
    | i <- [0 .. length anchors - 1]
    ]
    where
        -- If the x2 of a PDFText is beyond the next anchor, treat it as part of the next column
        -- Otherwise, treat it as part of the current column
        column PDFText {x1, x2} =
            let idx = length (takeWhile (<= x1) anchors) - 1
                nextAnchor = if idx + 1 < length anchors then anchors !! (idx + 1) else maxBound
                left = max 0 (nextAnchor - x1)
                right = max 0 (x2 - nextAnchor)
             in if right + tolerance >= left then
                    idx + 1
                else
                    idx
        serialize = clean . T.concat . map (\PDFText {text} -> text)
        clean = T.replace "\n" " "

mean :: Integral a => [a] -> a
mean xs = sum xs `div` fromIntegral (length xs)

median :: [Double] -> Double
median xs =
    let sorted = L.sort xs
        len = length sorted
        mid = len `div` 2
     in if even len then
            (sorted !! mid + sorted !! (mid - 1)) / 2
        else
            sorted !! mid
