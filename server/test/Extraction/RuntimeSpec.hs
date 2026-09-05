module Extraction.RuntimeSpec (spec) where

import Extraction.File (Grid, Row)
import Extraction.Runtime
import Test.Hspec

import Data.HashMap.Strict qualified as HM
import Extraction.Schema qualified as Schema

spec :: Spec
spec = describe "Runtime" $ do
    describe "Resolve header" $ do
        let context =
                ExtractionContext {
                    csvHeaders = HM.fromList [("Description", 0), ("Amount", 1)],
                    canonicalHeaders = HM.fromList [("Desc", 0)]
                }

        it "resolves a CSV header"
            $ resolveHeader "Description" context
                `shouldBe` Just 0

        it "resolves a canonical header"
            $ resolveHeader "Desc" context
                `shouldBe` Just 0

        it "returns Nothing for an unknown header"
            $ resolveHeader "Missing" context
                `shouldBe` Nothing

    describe "Match row" $ do
        let context =
                ExtractionContext {
                    csvHeaders = HM.fromList [("Description", 0)],
                    canonicalHeaders = HM.empty
                }

            row :: Row
            row = ["Salary"]

            filter_ =
                Schema.RecordFilter {
                    Schema.col = "Description",
                    Schema.matches = "^Salary$"
                }

        it "matches a matching row"
            $ matchesRow filter_ context row
                `shouldBe` True

        it "does not match a different row"
            $ matchesRow filter_ context ["Coffee"]
                `shouldBe` False

        it "returns False when the column does not exist"
            $ matchesRow
                (filter_ {Schema.col = "Missing"})
                context
                row
                `shouldBe` False

    describe "Filter rows" $ do
        let context =
                ExtractionContext {
                    csvHeaders = HM.fromList [("Description", 0)],
                    canonicalHeaders = HM.empty
                }

            csv :: Grid
            csv =
                [ ["Salary"],
                  ["Coffee"]
                ]

            filter_ =
                Schema.RecordFilter {
                    Schema.col = "Description",
                    Schema.matches = "^Salary$"
                }

        it "filters matching rows"
            $ filterRows
                ( Schema.Records {
                    Schema.where_ = Just filter_,
                    Schema.each = Schema.Row
                }
                )
                context
                csv
                `shouldBe` [["Salary"]]

        it "returns the input unchanged when no filter is configured"
            $ filterRows
                ( Schema.Records {
                    Schema.where_ = Nothing,
                    Schema.each = Schema.Row
                }
                )
                context
                csv
                `shouldBe` csv
