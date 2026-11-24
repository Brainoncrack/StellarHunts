# Puzzle Time Lock

The admin stores encrypted puzzle content and its reveal timestamp. The
contract only returns that payload through its reveal methods once the ledger
timestamp reaches the schedule; `reveal_batch` skips puzzles whose time has
not arrived and emits one `puzzle_revealed` event for each first reveal.
Because Soroban contract storage is public, puzzle payloads must be encrypted
before they are submitted.

Run tests with:

```sh
cargo test --manifest-path stellar-extensions/onchain/puzzle_time_lock/Cargo.toml
```
