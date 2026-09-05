module Shared.Config where

import Data.Text (Text)

data RupeeConfiguration = RupeeConfiguration {
    dateFormat :: Text,
    dataDirectory :: Text
}
    deriving Show

defaultConfiguration :: RupeeConfiguration
defaultConfiguration =
    RupeeConfiguration {
        dateFormat = "%Y-%m-%d",
        dataDirectory = "data"
    }
