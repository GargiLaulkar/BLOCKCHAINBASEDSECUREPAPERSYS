# Member 3 handoff

## Current task

Verify BE-01, BE-02, BE-07, BE-10 and BE-13 with a local database/Hardhat chain where available; fix dev scripts, establish backend lint, add a process-level indexer restart test, update progress and preserve all frozen interfaces.

## What is done

- Added the backend architecture/report chapter at [backend-chapter.md](./backend-chapter.md), including data boundaries, SIWE, indexing, authorization, section 13 threat coverage, and limitations.
- Updated the Member 3 progress table in [PROGRESS.md](./PROGRESS.md) with status, evidence, and open verification gaps.
- Updated `dev:all` to load `backend/.env`, preserve process environment precedence, use a configured `DATABASE_URL`, and otherwise start Compose PostgreSQL and derive its host connection string from captured Compose config without printing credentials.
- Updated `demo:reset` to load backend configuration, require a loopback database, run `prisma migrate reset --force --skip-seed`, reset the local chain, clear `BLOB_DIR`, and redeploy empty.
- Added backend ESLint/Prettier config and lint/format scripts; corrected existing unused imports/variables and made root lint work when called via Corepack.
- Added an opt-in child-process kill/restart test which indexes actual Hardhat contract logs, checks complete log coverage and unique event keys, and compares Exam/Batch projections after replay. It uses a JSON-backed persistent test adapter, not PostgreSQL.
- Ran backend typecheck, backend lint, root lint, backend tests, child process test, and authorization matrix. Results and database blocker are below.

## Wrap-up files touched

- `docs/backend-chapter.md` (new)
- `docs/HANDOFF.md` (new)
- `docs/PROGRESS.md`

No runtime or frozen interface files were touched.

## BE-01..BE-13 check against “Done when”

| Task | Assessment |
|---|---|
| BE-01 | Config and health tests pass. The `dev:api` boot criterion was not verified because `dev:all` could not start PostgreSQL (Docker absent and no DATABASE_URL), so it never started the API. |
| BE-02 | Prisma schema/migration exist. Applying migrations to a clean PostgreSQL database remains unverified because no local database or Docker was available. |
| BE-03 | SIWE nonce replay, domain, signature, session and chain-derived role behavior covered by passing backend tests. |
| BE-04 | Metadata hash mismatch and authority/assignment/public-summary behavior covered by passing tests. |
| BE-05 | Pending/confirmed upload behavior, multipart/type/size checks, assignment/state gates and tampered-file download rejection covered by passing tests. |
| BE-06 | Encrypted share validation and holder-only retrieval are covered by passing tests. |
| BE-07 | The new process test passed against a local Hardhat contract: it killed the child after RPC log retrieval and before persistence, restarted from the persisted cursor, compared every expected log key, checked unique keys and confirmed Exam/Batch projections, then replayed and compared the projection. The persistent row adapter is JSON-backed; no PostgreSQL is exercised by this process test. |
| BE-08 | Filter combinations, stable pagination, invalid pagination, authenticated stats and indexed-only readiness are covered; OpenAPI response schemas are included. |
| BE-09 | Auditor-only create/read, invalid reports/hash, owner scoping and chain-role recheck are covered by passing tests. |
| BE-10 | Security/header/CORS/rate-limit/redaction/error-shape/validator tests pass. Backend lint and root recursive lint pass after adding config; Solhint emits its existing max-states warning but exits successfully. |
| BE-11 | Zod-derived OpenAPI and generated frontend types are present; prior frontend typecheck and CI drift-check configuration are recorded. |
| BE-12 | 295 real-Hardhat authorization-matrix tests passed: endpoint/actor cases plus the route-inventory guard. |
| BE-13 | Script changes and README paths are present. End-to-end startup/reset could not be verified: this environment had no configured DATABASE_URL, no PostgreSQL listener, and no Docker CLI. |

## Definition of Done gaps

- **BE-01, BE-02 and BE-13 runtime evidence:** still requires a configured local PostgreSQL instance or Docker Desktop to verify API startup, clean migrations, schema tables, full `dev:all`, health, reset emptiness and no seed data.
- **BE-07 production-database restart:** the OS child process was killed/restarted and its durable JSON row projection verified against real Hardhat logs; repeat with PostgreSQL if process restart must specifically prove real database transaction behavior.
- **Health response:** the existing `/api/health` response reports chain connectivity only. Adding a database status field would alter an interface in section 8.2, so it was not changed under the explicit frozen-interface rule. No health request could be served because `dev:all` stopped before API startup.
- **Peer review:** no PR or reviewer evidence is present in the current workspace history, so “reviewed by another member” cannot be confirmed from this checkout.

Backend typecheck, lint, current backend tests, process-restart test, and authorization matrix passed. No reset was performed because the script refused safely before destructive operations without DATABASE_URL. Interface files and `docs/api/openapi.json` were not changed. Database-dependent acceptance criteria remain explicitly unverified.

## Implementation scope reviewed

- `backend/` implementation and tests for BE-01..BE-13 (completed in the prior task commits recorded in Git history and `PROGRESS.md`)
- Current wrap-up documentation files listed above

## What remains

1. Start PostgreSQL on `localhost:5432`, configure `DATABASE_URL` in `backend/.env` or the environment (without printing it), and retry migration/reset/full-stack checks.
2. Confirm all seven section 8.3 database tables, that reset empties the database and blob directory, and that startup seeds no business/demo rows.
3. Resolve the frozen-interface conflict if health must report database connectivity; otherwise query the database separately and leave `/api/health` as-is.
4. Obtain and record another member's review.

## Commands to run

From the repository root:

```powershell
corepack pnpm --filter @sigil/backend typecheck
corepack pnpm lint
corepack pnpm --filter @sigil/backend test
node scripts/test-indexer-process.mjs
corepack pnpm test:auth-matrix
corepack pnpm --filter @sigil/backend openapi:check
corepack pnpm dev:all
corepack pnpm demo:reset
```

`backend test` uses the local Hardhat JSON-RPC node at `127.0.0.1:8545` for indexer tests. `test:indexer-process` also requires the local chain and runs the real child-process restart test. `test:auth-matrix` starts its own isolated local Hardhat node. `dev:all` uses `DATABASE_URL` if configured; otherwise it requires Docker. `demo:reset` requires `DATABASE_URL` to point to `localhost` or `127.0.0.1` and a local Hardhat chain.

## Failing tests and their errors

- `DATABASE_URL` detection: absent in the environment and backend/.env. PostgreSQL TCP check: `127.0.0.1:5432` unavailable. Docker CLI: unavailable.
- Prisma migration attempt failed with Prisma `P1012`: `Environment variable not found: DATABASE_URL.`
- `corepack pnpm demo:reset` failed safely: `Refusing to reset: DATABASE_URL must be configured in the environment or backend/.env and point to a local PostgreSQL database.`
- `corepack pnpm dev:all` started a local chain and deployed `ExamVault`, selected Docker fallback, then failed: `'docker' is not recognized as an internal or external command`; API/web were not started.
- `GET http://127.0.0.1:4000/api/health` failed: `Unable to connect to the remote server`.
- `corepack pnpm --filter @sigil/backend typecheck`: passed.
- `corepack pnpm --filter @sigil/backend lint`: passed.
- `corepack pnpm lint`: passed; existing Solhint warning `Contract has 22 states declarations but allowed no more than 15`.
- `corepack pnpm --filter @sigil/backend test`: passed, 52 passed; authorization matrix and opt-in process test skipped in that run.
- `corepack pnpm --filter @sigil/backend test:indexer-process`: passed, 1 test.
- `corepack pnpm test:auth-matrix`: passed, 295 tests.

## Open questions

- Who will provide the required Member 2 review of Member 3 work?
- Should `/api/health` gain a database connectivity field? This would conflict with the instruction not to change interfaces in sections 6–9; no interface change was made.

## Decisions made and why

- The final-report chapter is a separate `docs/backend-chapter.md` so the report assembler can incorporate it without editing frozen API or contract interfaces.
- Docker fallback reads resolved Compose service settings in memory to form the host connection URL; it does not print the Compose configuration or database credentials.
- Reset requires a loopback PostgreSQL host and local Hardhat chain ID 31337, runs Prisma with `--skip-seed`, and does not proceed if DATABASE_URL is absent or remote.
- Verification claims distinguish passing local-chain tests from unverified PostgreSQL operations; no database/reset success is claimed.
- No API, contract or OpenAPI interface was changed.
