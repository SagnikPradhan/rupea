# Statements and schemas belong to the ledger

A ledger's folder holds three trees: `ledgers/<handle>/files/` for ledger files, `statements/` for the statements imported into it, and `schemas/` for the schemas that read them. A user's storage holds only the ledgers they own. This supersedes the part of [ADR 0005](0005-storage-belongs-to-users.md) that put schemas, and statements with them, in the user's storage: a statement is evidence for a ledger, like a ledger file, and every member needs to reach it. A schema states the account it imports into, and account names belong to a ledger.

A draft cites its statement by content, not by path. Its file metadata records `checksum:`, the sha256 of the stored statement, and `original-checksum:`, the sha256 of the upload when unlocking a PDF changed it. Statements can then be renamed and moved without touching the files that cite them, which on object storage could not be done atomically. The **inbox** is derived, not a folder: the statements no ledger file in the ledger cites.

Importing is deterministic. A schema lists `match:` patterns, each words to find (`text:`), a regex (`regex:`) or a glob for the file name (`file:`), and matches when any one does. A statement is recognised only when exactly one schema matches, the ledger's schemas first and Rupee's built-in schemas only when none of the ledger's do. Zero or several matches leave the statement in the inbox, saying why. The schema's `account:` names the account, so an import asks for nothing. A built-in schema carries a default account and is copied into the ledger's `schemas/` when its first import is saved, where it can be edited like any file.

The system names what it files. A recognised statement goes to `statements/<account path>/<first date>_<last date>.<ext>` and its draft to `files/imports/<account path>/<first date>_<last date>.rupee`. A statement that is unrecognised or yields no records keeps its uploaded name. The same name with other content gets ` (2)`.

## Considered Options

- **Statements in the user's storage, members reaching them through the ledger**: what we had. A member saw the citation but not the file, and statements could not sit beside the ledger file made from them.
- **Schemas per user**: one schema served every ledger, but its account could only be right for one of them, and owner and member recognised the same statement differently. Built-in schemas cover writing a bank once.
- **Citing statements by path and rewriting citations on rename**: touches every citing file, not atomically.
- **A stable id per statement**: the database would hold what the files should.
- **Built-in schemas referenced by a ledger schema (`use: hdfc`)**: upstream fixes would reach every ledger, but it is inheritance, and debugging means reading two files.
- **Built-in schemas copied into every new ledger**: every ledger would carry every bank, and older ledgers would miss schemas added later.
- **An inbox folder**: it goes stale the moment a statement is filed without importing it.
- **Choosing a schema by best score**: the same statement could be read differently as schemas are added.

## Consequences

- Finding a statement by checksum, and listing the inbox, read a `statements` table of path and checksum per ledger. Like the posting index, it is a cache the statements folder can rebuild, never the truth.
- Uploading content the ledger already has does nothing. A locked statement unlocked in the inbox and uploaded again before it is imported shows up twice, since no file records its `original-checksum:` yet.
- A PDF is stored decrypted once its password is given, so returning to it later never asks again. The password is never stored.
- Every member imports with the ledger's schemas and sees the same recognition.
- A user with the same bank in two ledgers copies the schema, or lets the built-in one be copied into both.
- Every import is reviewed in the file editor before it is saved. Saving clean imports without review is meant to become a setting.
