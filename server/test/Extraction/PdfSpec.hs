{-# LANGUAGE DuplicateRecordFields #-}

module Extraction.PdfSpec (spec) where

import Data.Text (Text)
import Extraction.File (Grid, Row)
import Extraction.Pdf
import Extraction.Runtime
import Foreign.C (castCharToCChar)
import Test.Hspec

import Data.HashMap.Strict qualified as HM
import Extraction.Schema qualified as Schema

spec :: Spec
spec = describe "PDF" $ do
    describe "Group text into rows" $ do
        it "groups text with overlapping vertical bounds"
            $ do
                groupRows
                    [ createText "a" 0 0 10 10,
                      createText "b" 20 2 30 12,
                      createText "c" 40 20 50 30
                    ]
                    `shouldBe` [ [createText "a" 0 0 10 10, createText "b" 20 2 30 12],
                                 [createText "c" 40 20 50 30]
                               ]

        it "groups text regardless of input order"
            $ do
                groupRows
                    [ createText "b" 20 2 30 12,
                      createText "c" 40 20 50 30,
                      createText "a" 0 0 10 10
                    ]
                `shouldBe` [ [createText "a" 0 0 10 10, createText "b" 20 2 30 12],
                             [createText "c" 40 20 50 30]
                           ]

        it "keeps touching vertical bounds in the same row"
            $ do
                groupRows
                    [ createText "a" 0 0 10 10,
                      createText "b" 20 10 30 20
                    ]
                `shouldBe` [ [createText "a" 0 0 10 10, createText "b" 20 10 30 20]
                           ]

        it "separates non-overlapping vertical bounds"
            $ do
                groupRows
                    [ createText "a" 0 0 10 10,
                      createText "b" 20 11 30 20
                    ]
                `shouldBe` [ [createText "a" 0 0 10 10],
                             [createText "b" 20 11 30 20]
                           ]

        it "preserves left-to-right order within rows"
            $ do
                groupRows
                    [ createText "c" 40 0 50 10,
                      createText "a" 0 0 10 10,
                      createText "b" 20 0 30 10
                    ]
                `shouldBe` [   [ createText "a" 0 0 10 10,
                                 createText "b" 20 0 30 10,
                                 createText "c" 40 0 50 10
                               ]
                           ]

    describe "Map chars to text" $ do
        it "merges adjacent characters"
            $ do
                mapChars
                    1
                    1
                    [ createChar 'a' 0 0 5 10,
                      createChar 'b' 6 0 11 10
                    ]
                `shouldBe` [createText "ab" 0 0 11 10]

        it "merges overlapping characters"
            $ do
                mapChars
                    1
                    1
                    [ createChar 'a' 0 0 10 10,
                      createChar 'b' 8 0 18 10
                    ]
                `shouldBe` [createText "ab" 0 0 18 10]

        it "does not merge characters separated by a large gap"
            $ do
                mapChars
                    1
                    1
                    [ createChar 'a' 0 0 5 10,
                      createChar 'b' 100 0 105 10
                    ]
                `shouldBe` [ createText "a" 0 0 5 10,
                             createText "b" 100 0 105 10
                           ]

        it "does not merge characters on different rows"
            $ do
                mapChars
                    1
                    1
                    [ createChar 'a' 0 0 5 10,
                      createChar 'b' 6 20 11 30
                    ]
                `shouldBe` [ createText "a" 0 0 5 10,
                             createText "b" 6 20 11 30
                           ]

        it "merges a sequence of characters"
            $ do
                mapChars
                    1
                    1
                    [ createChar 'a' 0 0 5 10,
                      createChar 'b' 6 0 11 10,
                      createChar 'c' 12 0 17 10
                    ]
                `shouldBe` [createText "abc" 0 0 17 10]

        it "preserves separate words"
            $ do
                mapChars
                    1
                    1
                    [ createChar 'a' 0 0 5 10,
                      createChar 'b' 6 0 11 10,
                      createChar 'c' 50 0 55 10
                    ]
                `shouldBe` [ createText "ab" 0 0 11 10,
                             createText "c" 50 0 55 10
                           ]

createText :: Text -> Int -> Int -> Int -> Int -> PDFText
createText t x1' y1' x2' y2' =
    PDFText {
        x1 = x1',
        y1 = y1',
        x2 = x2',
        y2 = y2',
        text = t
    }

createChar :: Char -> Int -> Int -> Int -> Int -> PDFChar
createChar c x1 y1 x2 y2 =
    PDFChar {
        char = castCharToCChar c,
        x1 = fromIntegral x1,
        y1 = fromIntegral y1,
        x2 = fromIntegral x2,
        y2 = fromIntegral y2
    }
