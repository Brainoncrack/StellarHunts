# Puzzle Seasonal Event Contract

This standalone Soroban contract manages scheduled puzzle seasons, score
leaderboards, token-funded rank prizes, and soulbound seasonal badge NFTs.
It is intentionally outside the main `onchain/` workspace so this extension
does not change existing workspace membership.

## Contract behavior

- The admin creates an event with an inclusive start, exclusive end, reward
  token, and up to 10 rank prize amounts.
- The admin (or an authorized scoring contract) authenticates score
  submissions while the event is active. Only a participant's best
  non-negative score is retained. The sorted
  leaderboard is capped at 100 participants; equal scores are placed after
  existing entries with that score.
- Anyone may fund an event's prize pool by transferring its configured token
  into the contract. At or after the end timestamp, anyone can finalize the
  event. Finalization pays the configured prizes to available top ranks and
  mints one unique, non-transferable seasonal badge NFT for every participant.
- `get_event_status`, `get_event`, `get_leaderboard`, `get_badge`, and
  `get_badge_by_id` provide the event and badge queries.

## Build and test

From this directory, run:

```sh
cargo test
cargo build --target wasm32-unknown-unknown --release
```

The reward pool must be funded for the prizes awarded to actual leaderboard
entries before finalization. Any unused configured prizes remain in the
contract; they are not paid to an unearned rank.
