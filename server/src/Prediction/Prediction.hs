module Prediction.Prediction where

import Data.Text (Text)

data RupeeCategory
    = Asset
    | Liability
    | Income
    | Expense
    | Equity

predictAccount :: Text -> (RupeeCategory, Text, Text)
predictAccount _ = (Asset, "", "")
