#!/bin/sh
ignored=UseTitleCase,MassNouns,SplitWords,LongSentences,OxfordComma,ExpandTimeShorthands,ExpandMemoryShorthands,OrthographicConsistency,SentenceCapitalization,CompoundNouns,DisjointPrefixes,PhrasalVerbAsCompoundNoun,RoadMap,MergeWords,Dashes,Spaces,NumericRangeEnDash,EllipsisLength,WrongNegative,NotIn,SinceDuration,ByOnesOwn,AnA,QuantifierNumeralConflict,SingleBe,AwaitFor,ThatThan,ItsContraction,OneOfTheSingular,MissingTo,MissingPreposition,ExpandMinimum,ExpandConfiguration

[ $# -eq 0 ] && set -- $(git ls-files '*.ts' '*.js' '*.md' ':!drizzle' ':!.agents' ':!.claude' ':!packages/site/src/content/manual/glossary.md')

exec harper-cli lint --quiet --format compact --dialect british --user-dict-path lint/dictionary.txt --ignore "$ignored" "$@"
