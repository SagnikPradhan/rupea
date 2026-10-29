# Files read into nodes that print back without loss

A ledger file is read into a tree of nodes, and printing the tree writes the file again with nothing lost. Every node has a `kind`, the `comments` under it and its `children`. The file's children are its entries in the order written: transactions, prices, links, notes, and failed blocks. A transaction's children are its postings. Metadata is a list of key and value pairs in the order written. `parse` reads a file's transactions, prices and links from its tree, so indexing and everything after it stay as they were.

A comment belongs to what sits right above it, as in Ledger and hledger: a comment in a transaction belongs to its header or the posting above it, even among metadata, and a comment under a P line belongs to that line. The file keeps the comments in its opening block, up to the first blank line. A comment after a blank line stands alone as a note. Only whole lines whose first mark is a semicolon are comments, indented or not. A block that does not read keeps its lines as written, with its errors. After a bad header the next transaction can't be found, so only P lines are read up to the end of the file, and the lines between them are kept as written.

Printing writes Rupea's own style. Dates take the first configured format, and times the first that holds them, so seconds are never dropped. Amounts are aligned across the file. There is one blank line between entries, except between P lines in a row, which print as one block. A comment prints right under what it belongs to, before its metadata. A posting written without an amount is printed without one. Blank lines are not kept. The first save of a hand-written file may change its spelling once. After that, printing what was printed changes nothing, and reading it gives the same tree. Format in the editor prints the tree, so the editor, imports and later the transaction form all write files the same way.

Comments are indexed with their transaction or posting, so the app can show them.

## Considered Options

- **Splice lines into the text**: a form would replace one transaction's lines and leave the rest of the file alone. It needs line ranges for every block, and it can't rewrite a transaction around comments it never read.
- **Keep every token's spelling**: a concrete syntax tree prints back byte for byte. It is a lot of code to keep whitespace and date spellings, and it is only worth it if files must never change style.
- **A comment belongs to what is below it**: it reads as an explanation of what follows, but no other plain-text accounting tool does it, so comments written for Ledger or hledger would land on the wrong posting, and a comment at the end of a transaction needs a rule to pass it on.
- **Comments belong to nothing, as in Beancount**: the simplest to read, but the app could not show a comment with its transaction, and notes would have to move into metadata.
- **A flat list of blocks with comments as their own blocks**: the order is kept, but nothing knows which posting a comment is about, so neither a form nor the index could show it.
