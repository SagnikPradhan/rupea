# Storage belongs to users

Where schemas and statements live is superseded by [ADR 0008](0008-statements-and-schemas-belong-to-the-ledger.md). A ledger records its owner rather than its storage, per [ADR 0012](0012-services-own-their-tables.md).

A user owns one **storage**: a place the files live, such as a local directory today and a Google Drive folder later. The storage holds everything the user writes: their schemas in `schemas/` and each ledger they own in `ledgers/<handle>/`. The database only records which storage a ledger lives in and who may reach it, and it caches what is derived from the files, such as the index. The files stay the truth.

Schemas belong to the user, not to a ledger. A schema describes how a bank lays out its statements, and the person importing is the one who writes and uses it, so one schema serves every ledger they import into.

## Considered Options

- **One global storage with `ledgers/<id>/` beneath it**: what we had. It cannot reach storage the user brings, such as their own Drive, and it put schemas inside the ledger's tree, kept apart from ledger files only by their extension.
- **Ledgers inside a folder named after their owner**: makes ownership a path, so changing owner means moving every file, which is not atomic on object storage.
- **Several ledgers per storage root, or several storages per user**: neither is needed by any scenario yet. `storages.user_id` is unique, and dropping that constraint is a migration.

## Consequences

- `local` storage is `RUPEA_STORAGE_FILES/users/<user id>/`, named by uuid so renaming a user moves nothing. Paths are checked to stay inside `RUPEA_STORAGE_FILES`.
- Every user has a storage, even one who owns no ledger, since their schemas live there. It is made, `local`, the first time something opens it, so signup does not have to.
- Members of a ledger don't see its owner's schemas; they import with their own.
- Deleting a user deletes their storage row and, by cascade, their ledgers, memberships and index. Their files are never touched. A storage that can't be reached, such as a revoked Drive, keeps its cache and reports an error until the owner reconnects or deletes it.
- Drive credentials will sit on `storages` when Drive is built.
