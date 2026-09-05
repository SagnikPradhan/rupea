module Persistence.ParserSpec (spec) where

import Data.Time
import Persistence.Parser
import Shared.Config (defaultConfiguration)
import Shared.Error
import Test.Hspec

spec :: Spec
spec = describe "Parser" $ do
    let location = ParseLocation "random.rupee" 1
        configuration = defaultConfiguration

    describe "Parse transactions" $ do
        it "parses a transaction with one posting" $ do
            let lines =
                    [ Line location "2026-08-29 Groceries",
                      Line location "\tExpenses:Food 100"
                    ]
                result =
                    [ Transaction
                        (fromGregorian 2026 8 29)
                        "Groceries"
                        [Posting "Expenses:Food" (Just 100)]
                    ]
            parseTransaction configuration lines `shouldBe` ([], result)

        it "parses a posting without an amount" $ do
            let lines =
                    [ Line location "2026-08-29 Transfer",
                      Line location "\tAssets:Bank 100",
                      Line location "\tAssets:Savings"
                    ]
                result =
                    [ Transaction
                        (fromGregorian 2026 8 29)
                        "Transfer"
                        [ Posting "Assets:Bank" (Just 100),
                          Posting "Assets:Savings" Nothing
                        ]
                    ]
            parseTransaction configuration lines `shouldBe` ([], result)

        it "reports an invalid transaction header" $ do
            let lines = [Line location "not a transaction"]
                errors = [RupeeParseInvalidTransactionHeader location]
            parseTransaction configuration lines `shouldBe` (errors, [])

        it "reports a transaction with no body" $ do
            let lines = [Line location "2026-08-29 Groceries"]
                errors = [RuppeParseMissingTransactionBody location]
            parseTransaction configuration lines `shouldBe` (errors, [])

        it "parses multiple transactions" $ do
            let lines =
                    [ Line location "2026-08-29 Groceries",
                      Line location "\tExpenses:Food 100",
                      Line location "2026-08-30 Salary",
                      Line location "\tAssets:Bank 1000"
                    ]
                result =
                    [ Transaction {
                        date = fromGregorian 2026 8 29,
                        description = "Groceries",
                        postings = [Posting "Expenses:Food" (Just 100)]
                    },
                      Transaction {
                        date = fromGregorian 2026 8 30,
                        description = "Salary",
                        postings = [Posting "Assets:Bank" (Just 1000)]
                    }
                    ]
            parseTransaction configuration lines `shouldBe` ([], result)

        it "reports an invalid posting" $ do
            let lines =
                    [ Line location "2026-08-29 Groceries",
                      Line location "\t"
                    ]
                errors = [RupeeParseInvalidPosting location]
            parseTransaction configuration lines `shouldBe` (errors, [])
