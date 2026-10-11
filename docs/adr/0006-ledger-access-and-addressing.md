# Ledgers are addressed by a handle and reached through their storage

A ledger lives in one storage, and the user who owns that storage owns the ledger; nothing else records ownership. A **membership** grants another user the whole ledger. There are no roles yet, so a member can do everything the owner can. A ledger is addressed by its **handle**, a cute name such as `quiet-heron`, unique across all users. It appears in the URL (`/l/<handle>/…`) and names the ledger's folder in its storage. The handle never changes; the ledger's `name` is the label the UI shows, and it can be edited freely.

`withLedger({ user, handle, action })` is the only place that checks whether a user may reach a ledger: they own its storage, or they hold a membership. `withStorage({ user, action })` is the only place that opens a user's storage. The ledger to act on comes from the URL, not from anything stored on the user.

## Considered Options

- **An active ledger on the user (`users.ledger_id`)**: duplicates what memberships say, and two tabs on two ledgers can't work.
- **The ledger in the session**: still stored state, shared by every tab.
- **`/@owner/handle`, handles unique per owner**: enforcing `unique(owner, handle)` needs the owner on the ledger row, a second record of ownership beside the storage. It also puts the owner's username in every link.
- **An `owner` role on memberships**: a second record of what the storage already says.
- **Renamable handles**: the folder would have to move with the handle. That is atomic on a local disk and in Drive, but not on S3, and a crash between moving the folder and updating the row leaves them disagreeing.
- **Random ids (`k7m2x9qa`) or Notion-style `name-id` slugs**: never break, but read worse than a cute name, which never breaks either once it's fixed.

## Consequences

- Usernames are cute names too, generated without a number and renamable, since they appear in no URL and name no folder. Email addresses never leak into names.
- Cute names come from `unique-names-generator`, with word lists large enough that collisions are rare; a unique constraint and a retry handle the rest.
- An owner can't have two ledgers with the same handle, because handles are unique across all users.
- A user who wants a different handle creates a new ledger. Renaming can be built later as a deliberate move.
