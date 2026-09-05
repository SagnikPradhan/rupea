module Extraction.File where

import Control.Lens ((^.))
import Data.Char (toLower)
import Data.Maybe (fromMaybe, listToMaybe)
import System.FilePath (takeExtension)

import Codec.Xlsx qualified as Xlsx
import Data.ByteString.Lazy qualified as L
import Data.Csv qualified as Csv
import Data.Map qualified as M
import Data.Text qualified as T
import Data.Vector qualified as V
import Data.Xls qualified as Xls

type Row = V.Vector T.Text
type Grid = V.Vector Row

readXlsxFile :: FilePath -> IO (Maybe Grid)
readXlsxFile file = fmap (gridFromCellMap . cellMap) . firstSheet . Xlsx.toXlsx <$> L.readFile file
    where
        cellValueToText = \case
            Xlsx.CellText v -> v
            Xlsx.CellDouble v -> T.pack (show v)
            Xlsx.CellBool v -> T.pack (show v)
            Xlsx.CellError v -> T.pack (show v)
            Xlsx.CellRich v -> T.concat $ map (^. Xlsx.richTextRunText) v
        cellToText = maybe "" cellValueToText . (^. Xlsx.cellValue)
        cellMap sheet =
            let cells = M.map cellToText (sheet ^. Xlsx.wsCells)
                (rows, cols) = foldl' (\(mr, mc) (r, c) -> (max mr r, max mc c)) (0, 0) (M.keys cells)
             in (rows, cols, cells)
        gridFromCellMap (maxRow, maxCol, cells) =
            V.generate rows $ V.generate cols . cellAt
            where
                rows = fromIntegral maxRow
                cols = fromIntegral maxCol
                cellAt r c = fromMaybe "" $ M.lookup (fromIntegral (r + 1), fromIntegral (c + 1)) cells
        firstSheet = fmap snd . listToMaybe . (^. Xlsx.xlSheets)

readXlsFile :: FilePath -> IO (Maybe Grid)
readXlsFile path = fmap toGrid' . listToMaybe <$> Xls.decodeXlsIO path
    where
        toGrid' = V.fromList . map (V.fromList . map T.pack)

readCsvFile :: FilePath -> IO (Maybe Grid)
readCsvFile file = toGrid' <$> L.readFile file
    where
        toGrid' content = case (Csv.decode Csv.NoHeader content :: Either String Grid) of
            Left _ -> Nothing
            Right rows -> Just rows

readGrid :: FilePath -> IO (Maybe Grid)
readGrid path = case map toLower (takeExtension path) of
    ".xlsx" -> readXlsxFile path
    ".xls" -> readXlsFile path
    ".csv" -> readCsvFile path
    _ -> pure Nothing
