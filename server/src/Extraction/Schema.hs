{-# LANGUAGE DuplicateRecordFields #-}

module Extraction.Schema where

import Control.Applicative ((<|>))
import Control.Exception (throwIO)
import Data.Aeson
import Data.Aeson.Types (Parser)
import Data.Char (toLower)
import Data.Text (Text)
import Data.Yaml (decodeFileEither)
import GHC.Generics (Generic)

-- | Generic Aeson options using lowercase constructor names.
lowercaseOptions :: Options
lowercaseOptions =
    defaultOptions {
        constructorTagModifier = map toLower,
        allNullaryToStringTag = True
    }

-- | Root extraction schema.
data Schema = Schema {
    version :: Version,
    name :: Text,
    records :: Records,
    fields :: Fields
}
    deriving (FromJSON, Generic, Show)

data Version
    = V1
    deriving (Eq, Generic, Show)

instance FromJSON Version where
    parseJSON = withText "Version" $ \case
        "v1" -> pure V1
        _ -> fail "expected v1"

data Records = Records {
    each :: Each,
    where_ :: Maybe RecordFilter
}
    deriving (Generic, Show)

instance FromJSON Records where
    parseJSON = withObject "Records" $ \o ->
        Records
            <$> o .: "each"
            <*> o .:? "where"

data Each
    = Row
    deriving (Generic, Show)

instance FromJSON Each where
    parseJSON = withText "Each" $ \case
        "row" -> pure Row
        _ -> fail "expected \"row\""

data RecordFilter = RecordFilter {
    col :: Text,
    matches :: Text
}
    deriving (FromJSON, Generic, Show)

data Fields = Fields {
    date :: Field,
    amount :: Field,
    description :: Field,
    category :: Maybe Field
}
    deriving (FromJSON, Generic, Show)

-- | Describes how to extract a field.
data Field = Field {
    from :: [Locator],
    pipe :: [Transform],
    required :: Bool
}
    deriving (FromJSON, Generic, Show)

data Locator
    = Col Text
    | Header Text
    | Text Text
    | Regex Text
    | Right' Int
    | Left' Int
    | Above Int
    | Below Int
    deriving (Generic, Show)

instance FromJSON Locator where
    parseJSON = withObject "Locator" $ \o ->
        Col <$> o .: "col"
            <|> Header <$> o .: "header"
            <|> Text <$> o .: "text"
            <|> Regex <$> o .: "regex"
            <|> Right' <$> o .: "right"
            <|> Left' <$> o .: "left"
            <|> Above <$> o .: "above"
            <|> Below <$> o .: "below"

data Replacement = Replacement {
    from :: Text,
    to :: Text
}
    deriving (FromJSON, Generic, Show)

data PureTransform
    = Trim
    | ToNumber
    | Negate
    deriving (Generic, Show)

instance FromJSON PureTransform where
    parseJSON = withText "PureTransform" $ \case
        "trim" -> pure Trim
        "number" -> pure ToNumber
        "negate" -> pure Negate
        _ -> fail "unknown transform"

data Transform
    = Pure PureTransform
    | Replace Replacement
    | Date Text
    deriving (Generic, Show)

parseTransformObject :: Object -> Parser Transform
parseTransformObject o =
    Replace <$> o .: "replace"
        <|> Date <$> o .: "date"

instance FromJSON Transform where
    parseJSON v =
        Pure <$> parseJSON v
            <|> withObject "Transform" parseTransformObject v

readSchema :: FilePath -> IO Schema
readSchema p = decodeFileEither p >>= either throwIO pure
