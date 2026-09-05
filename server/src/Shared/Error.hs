module Shared.Error where

data ParseLocation = ParseLocation !String !Int deriving Eq
instance Show ParseLocation where
    show (ParseLocation file line) = file ++ ":" ++ show line

data RupeeError
    = RupeeParseInvalidTransactionHeader !ParseLocation
    | RuppeParseMissingTransactionBody !ParseLocation
    | RupeeParseInvalidPosting !ParseLocation
    deriving (Eq, Show)
