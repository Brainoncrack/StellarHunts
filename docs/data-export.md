# Personal data export

`GET /users/me/export` returns everything StellarHunts stores about the
signed-in user as one JSON document. It implements the "right of access /
portability" expectation of GDPR-style privacy policies: a user can obtain
their own records without an operator running a database query.

## Request

```http
GET /api/v1/users/me/export
Authorization: Bearer <account access token>
```

- **Authentication:** required. A standard account token (password or linked
  wallet login) must be presented; wallet-only sessions are rejected because
  they have no account record to export.
- **Rate limit:** 5 exports per hour per account. The response includes
  `Retry-After` when the limit is exceeded.
- **Caching:** `Cache-Control: no-store, private` and
  `X-Content-Type-Options: nosniff`.
- **Delivery:** the JSON body is returned as a downloadable attachment named
  `stellarshunts-data-export-<userId>-<YYYY-MM-DD>.json`.

## Payload

```json
{
  "schemaVersion": "1.0",
  "generatedAt": "2026-10-18T12:00:00.000Z",
  "user": {
    "id": "…",
    "name": "…",
    "username": "…",
    "email": "…",
    "bio": "…",
    "avatarUrl": "…",
    "walletAddress": "G…",
    "isActive": true,
    "createdAt": "…",
    "updatedAt": "…",
    "lastLoginAt": "…"
  },
  "records": {
    "progress": [ … ],
    "puzzle_completions": [ … ],
    "inventory": [ … ],
    "streaks": [ … ],
    "user_settings": [ … ],
    "wallet_sessions": [ … ]
  }
}
```

`schemaVersion` is bumped when the shape changes. New top-level keys may be
added without a bump, so consumers should ignore unknown `records` keys.

## What is included

The table list is derived from TypeORM metadata at request time: every entity
with a `userId` column is exported, and entities with a `walletAddress` (or
`address`) column are also queried for the user's linked wallet. That means a
new feature table is included automatically instead of being silently missed.

The user's own `users` row is exported explicitly. Operator-only tables
(`admins`) are never exported.

Tables with a wallet column are queried by `userId` **or** wallet address, so
records created before the address was linked still appear.

## What is redacted

Credentials are never useful in an export and are removed even when hashed:

- any column named `password`, `passwordHash`, `token`, `tokenHash`,
  `accessToken`, `refreshToken`, `apiKey`, `keyHash`, `secret`, `jti`,
  `signature`, `nonce`, or `challenge`;
- keys matching the same concepts inside JSON columns (for example token
  metadata or audit metadata), replaced with `"[redacted]"`.

Everything else is returned as stored, including IP addresses and user agents
that may appear in security metadata, because those are the user's personal
data.

## Failure behaviour

An export must not fail because one legacy table is missing a column its
entity metadata expects. Per-table failures are logged by table name (never by
row contents) and omitted from `records`; the rest of the export still
completes. An unknown or deleted user returns `404`.

## Implementation

- `backend/src/data-export/data-export.service.ts` — metadata discovery,
  scoping queries, redaction.
- `backend/src/data-export/data-export.controller.ts` — authentication, rate
  limiting, response headers.
- `backend/src/data-export/data-export.service.spec.ts` — completeness and
  redaction tests.

## Example

```bash
curl -sS -D headers.txt \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -o export.json \
  https://api.example.com/api/v1/users/me/export
```

A successful response carries headers along these lines (values illustrative):

```http
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
Content-Disposition: attachment; filename="stellarshunts-data-export-<userId>-2026-10-18.json"
Cache-Control: no-store, private
X-Content-Type-Options: nosniff
```

## Responses

| Status                         | Meaning                                                                                                                                                   |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `200`                          | Export generated; body is the JSON document described above.                                                                                              |
| `401`                          | Missing, expired or invalid access token.                                                                                                                 |
| Rejected (wallet-only session) | The session has no account record to export. Sign in with an account token instead. The exact status code is defined by the controller; confirm it there. |
| `404`                          | The user no longer exists (unknown or deleted).                                                                                                           |
| `429`                          | More than 5 exports in the past hour. Wait for the number of seconds in `Retry-After`.                                                                    |

Error bodies must not include row contents or other users' identifiers.

## Field reference: `user`

| Field                                   | Description                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------------ |
| `id`                                    | Unique account identifier. Also appears in the download filename.              |
| `name`, `username`                      | Display name and unique handle.                                                |
| `email`                                 | Account email address.                                                         |
| `bio`, `avatarUrl`                      | Profile fields set by the user.                                                |
| `walletAddress`                         | Linked Stellar public key (`G…`), if any. Public keys only; never secret keys. |
| `isActive`                              | Whether the account is currently active.                                       |
| `createdAt`, `updatedAt`, `lastLoginAt` | ISO 8601 timestamps.                                                           |

All timestamps are ISO 8601 strings in UTC. Fields that have no value are
returned as `null` rather than omitted, so consumers can rely on the key
being present for the columns listed above.

## Field reference: `records`

Each key under `records` is a table name, and each value is an array of rows
for this user. An empty array means the user has no rows in that table, not
that the table was skipped. A table that failed during export is absent
altogether (see "Failure behaviour").

| Key                  | Typical contents                                                  |
| -------------------- | ----------------------------------------------------------------- |
| `progress`           | Level and roadmap progress.                                       |
| `puzzle_completions` | Which puzzles the user completed and when.                        |
| `inventory`          | Items, badges or NFTs associated with the account.                |
| `streaks`            | Daily/continuous play streak data.                                |
| `user_settings`      | Preferences chosen by the user.                                   |
| `wallet_sessions`    | Wallet connection sessions, with credential-like fields redacted. |

This list reflects the tables present at the time of writing. Because the
set is discovered from entity metadata, the actual keys in an export may
include more.

## Guidance for consumers

- Parse the document as UTF-8 JSON and check `schemaVersion` first.
- Ignore unknown keys under `records` and unknown fields within rows; they may be added without a version bump.
- Do not assume a fixed set of tables or a particular key order.
- Treat any value `"[redacted]"` as intentionally removed, not as data to be restored.
- Store the file securely. It contains the user's personal data, including email and, where present, IP addresses and user agents.

## Security considerations

- **Authorization is by token subject only.** The endpoint takes no user
  identifier in the path or query; it exports exactly the account identified
  by the token. This prevents one user from requesting another user's export.
- **Row scoping.** Queries are scoped by `userId` (and the user's own wallet
  address). A wallet-address match must be against the address linked to this
  account, never an address supplied by the caller.
- **Redaction applies recursively** to JSON columns, so credential-like keys
  nested inside metadata are removed too. Review the redaction list whenever
  a new credential-bearing column is added.
- **No secrets in logs.** Failures are logged by table name only, never by row
  contents or token values.
- **Rate limiting** limits repeated bulk extraction from a stolen token. Per-account
  limits should be backed by shared storage if the API runs on more than one instance.
- **No caching** (`no-store, private`) keeps exports out of shared caches and
  proxies.
- **Account-takeover note.** Because an export contains the account email and
  recent security metadata, consider sending the account owner a notification
  email when an export is generated, so an unexpected export is noticed.

## Privacy notes

- The export covers data keyed to the user (`userId`) or their linked wallet
  address. Data about the user held in tables without either column, or
  inside other users' records (for example, a referral row owned by another
  account), is not discovered automatically. Review such cases during privacy
  reviews.
- Operator-only tables are excluded by design, as noted above. If operator
  records contain personal data about users, that is a separate disclosure
  question for the privacy policy.
- On-chain data (for example, minted badges and transactions) is public and
  lives on the Stellar network, not in this database. The export can list the
  user's wallet address so they can look up their on-chain history, but it
  cannot export or erase on-chain records.
- The export is a point-in-time snapshot (`generatedAt`). Later changes do
  not alter a downloaded file.

## Adding or changing tables

Because discovery is automatic, the common case needs no export code change:

1. Give the new entity a `userId` column (and `walletAddress` or `address` if
   it is also keyed by wallet).
2. If the entity stores any credential-like value, either name the column
   using one of the redacted names above or add the new name to the redaction
   list in `data-export.service.ts`.
3. Extend `data-export.service.spec.ts` with a case showing the new table
   appears in the export and that its sensitive columns are redacted.
4. If a column is renamed or removed in a way that changes the exported shape,
   bump `schemaVersion` and note it in the changelog below.

## Testing

The spec covers completeness and redaction. Recommended additional cases:

- A user with no rows in any table returns `records` keys with empty arrays, not an error.
- A table that throws during query is omitted and the rest of the export still succeeds.
- Rows belonging to a different user are never present, including when two users share a table.
- A row matched only by wallet address (created before linking) is included for the right user and not for others.
- Nested credential-like keys inside a JSON column are replaced with `"[redacted]"`.
- The 6th export within an hour returns `429` with a `Retry-After` header.
- A wallet-only session is rejected and a deleted user returns `404`.

## Operational notes

- **Performance.** The export loads all of a user's rows into one document.
  For accounts with very large histories, watch response time and memory.
  If this becomes a problem, consider paginated queries per table or
  streaming the JSON, while keeping the same payload shape.
- **Timeouts.** Make sure the gateway or reverse proxy timeout is longer than
  the worst-case export time.
- **Monitoring.** Track export count, latency, per-table failure counts and
  `429` rate. A sustained rise in per-table failures indicates schema drift
  between entities and the database.
- **Auditing.** Record that an export occurred (account id, timestamp, request id)
  without recording the exported contents.

## Limitations

- Only data in the application database is covered. Backups, log files,
  analytics providers and any third-party processors are outside this
  endpoint and must be handled by the privacy process.
- The endpoint supports a single JSON format. CSV or other formats are not
  provided.
- There is no scheduled or emailed delivery; the user must request the export
  and download it directly.
- Deletion ("right to erasure") is a separate feature and is not implemented by this endpoint.

## Changelog

| Version | Change                                                                                                      |
| ------- | ----------------------------------------------------------------------------------------------------------- |
| `1.0`   | Initial export: user row plus all `userId`/wallet-keyed tables, credential redaction, rate limit of 5/hour. |
