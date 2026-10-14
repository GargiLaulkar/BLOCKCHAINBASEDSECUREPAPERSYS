# Member 3 backend review request

**Branch:** `m3/BE-wrapup-verification`
**Pull request title:** `Member 3: backend BE-01..BE-13 (review request)`
**Pull request:** [GargiLaulkar/BLOCKCHAINBASEDSECUREPAPERSYS#1](https://github.com/GargiLaulkar/BLOCKCHAINBASEDSECUREPAPERSYS/pull/1) — open against `main`; remote head verified `f2c67fd5a94478816bd39536bddc444e9e748aca` on 2026-10-14.
**Review status:** Awaiting Member 2. All BE-01 through BE-13 remain **In review** until approval.

## Scope

Review Member 3's BE-01 through BE-13 work. The scope includes the backend Express/configuration and Prisma migration, SIWE authentication and chain-derived roles, exam/batch/share/audit/events/stats APIs, indexer, request security/validation/logging, OpenAPI generation/types, authorization matrix, local run/reset scripts, tests and related docs.

### Member 3 commit list

| Commit | Subject |
|---|---|
| `4c8f721bb413199466fde969a0a1895d5c6f2ac0` | BE-01 & BE-02: Scaffold backend, config validation, health route, docker-compose, and Prisma schema |
| `f739ebf8bb1af519addcd68428475d56444e7b26` | BE-03: Implement SIWE authentication, session management, and chain-derived roles |
| `00b60fc6de96446c8e1ae5eaf6857e7ec2235d0a` | BE-04: Implement exam metadata endpoints with canonical hash check |
| `ed47d384194e8bfc5eb311b23d6293893d878e3c` | BE-07: Implement event indexer, crash recovery, and 24h batch purge |
| `70e4ba0708c952ef033d57401e77ae8081de5e41` | BE-04: Filter authenticated exams by assignment and expose public summary |
| `08b7648adb6d96ead7a8e8665fbdaf8b86499b53` | BE-06: Implement encrypted share storage and holder retrieval endpoints |
| `6e0ad8dd65268aa3bcece3fda3d7f10bffa34ddf` | BE-05: add gated batch blob endpoints |
| `f33ca7ed18039e855059630b7f2ed6171acfda00` | BE-08: add indexed events and stats APIs |
| `5012d620b0f3d38998064568a15a28882f5047eb` | BE-09: add auditor leak-trace API |
| `da184653c4c15fc5c8fa212c73d210b7f4c036f1` | BE-10: secure backend with validation, rate limits, and profile hashing |
| `289b91cee344b75ea5578ea1d716ac22331f47db` | BE-11: generate OpenAPI document and typed frontend client |
| `a7c1ad082562f5b5cd2febf426cc21639d5e25c3` | BE-12: add real-chain authorization matrix suite |
| `340a96d4123a97be19c294df426abbeb63bacb85` | BE-13: orchestrate local demo stack and reset |
| `84983182c2eaceb1d6a00a4a0652531aef7a70ac` | BE-13: support local and Docker database startup |
| `b403b68934c3f01d2540c6381a0c48050e36b519` | BE-10: add backend lint tooling |
| `4f2a0a855c35559edb8650b6bf20814b98f0b8f2` | BE-07: verify indexer process restart |
| `542d4f07b606fcc56b4a5bc337581e03ea8f070b` | BE-13: record database reset guard checks |
| `c344d6fbf89ffa5a782718088077d737479c88e2` | BE-13: verify local PostgreSQL setup |

### Files changed per task

The lists below identify the Member 3 task files. Some commits also carry shared workspace changes; see the full commit list above.

| Task | Principal files |
|---|---|
| BE-01 | `backend/package.json`, `backend/tsconfig.json`, `backend/src/app.ts`, `backend/src/config.ts`, `backend/src/logger.ts`, `backend/src/routes/health.ts`, `backend/src/server.ts`, `backend/test/config.test.ts`, `backend/test/health.test.ts`, `docker-compose.yml`, root `package.json` |
| BE-02 | `backend/prisma/schema.prisma`, `backend/prisma/migrations/20261003000000_init/migration.sql`, `backend/prisma/migrations/migration_lock.toml` |
| BE-03 | `backend/src/middleware/auth.ts`, `backend/src/routes/auth.ts`, `backend/src/services/roles.ts`, `backend/test/auth.test.ts`, `backend/src/app.ts`, backend/root package manifests and lockfile |
| BE-04 | `backend/src/db.ts`, `backend/src/routes/exams.ts`, `backend/test/exams.test.ts`, `backend/src/app.ts` |
| BE-05 | `backend/src/routes/exams.ts`, `backend/test/batches.test.ts`, `backend/package.json`, `pnpm-lock.yaml` |
| BE-06 | `backend/src/routes/exams.ts`, `backend/test/exams.test.ts` |
| BE-07 | `backend/src/indexer/handlers.ts`, `backend/src/indexer/index.ts`, `backend/src/indexer/indexer.ts`, `backend/src/indexer/purge.ts`, `backend/src/indexer/state.ts`, `backend/test/indexer.test.ts`, `backend/test/indexer-process.test.ts`, `backend/test/helpers/indexer-process-worker.ts`, `scripts/test-indexer-process.mjs` |
| BE-08 | `backend/src/routes/events.ts`, `backend/src/routes/stats.ts`, `backend/test/events-stats.test.ts`, `backend/src/app.ts` |
| BE-09 | `backend/src/routes/audit.ts`, `backend/test/audit.test.ts`, `backend/src/app.ts` |
| BE-10 | `backend/eslint.config.js`, `backend/.prettierrc.json`, `backend/src/middleware/errors.ts`, `backend/src/middleware/validate-request.ts`, `backend/src/routes/profiles.ts`, security/validation changes to backend config and routes, `backend/test/security.test.ts`, `backend/test/profiles.test.ts`, `backend/test/validators.fuzz.test.ts`, `backend/scripts/generate-openapi.ts`, `.github/workflows/ci.yml`, backend/root package manifests and lockfile |
| BE-11 | `backend/scripts/generate-openapi.ts`, `docs/api/openapi.json`, `frontend/src/api/generated.ts`, `frontend/tsconfig.json` |
| BE-12 | `backend/test/authorization-matrix.test.ts`, `scripts/test-auth-matrix.mjs` |
| BE-13 | `scripts/demo-reset.mjs`, `scripts/dev-all.mjs`, `scripts/process.mjs`, `README.md`, `contracts/hardhat.config.ts`, relevant root/backend/contracts/frontend package manifests and lockfile, `docs/HANDOFF.md`, `docs/PROGRESS.md` |

## Verification evidence

Run date: **2026-10-14**.

| Command/check | Result |
|---|---|
| `corepack pnpm --filter @sigil/backend exec prisma migrate deploy --schema prisma/schema.prisma` | Passed; migration `20261003000000_init` applied. |
| Prisma introspection after migration | Passed; all 7 section 8.3 tables present: `Exam`, `Participant`, `PanelMember`, `Batch`, `EncryptedShare`, `ChainEvent`, `LeakTrace`. |
| `corepack pnpm demo:reset` | Passed on retry after starting local Hardhat; all 7 table counts were 0 and `BLOB_DIR` had 0 entries. Reset seeded no demo records. |
| `corepack pnpm dev:all` | Passed; explicitly used configured `DATABASE_URL` and skipped Docker; chain, API, and web started. DB tables remained empty. |
| `GET http://127.0.0.1:4000/api/health` | HTTP 200; existing frozen response reports chain connected on 31337. |
| `corepack pnpm lint` | Passed; existing Solhint `max-states-count` warning remains (Member 1 contract warning). |
| `corepack pnpm --filter @sigil/backend typecheck` | Passed. |
| `corepack pnpm --filter @sigil/backend test` | Passed: 52 passed, 296 skipped (the process and authorization matrix suites were invoked separately). |
| `node scripts/test-indexer-process.mjs` | Passed: 1 test. |
| `corepack pnpm test:auth-matrix` | Passed: 295 tests. |

## Secret scan triage

All reviewed matches are **SAFE**. The database/session strings are test/configuration fixtures, not the configured `backend/.env` password. The 64-hex values below are hashes, seeds, or test vectors and are not used as private keys; none was identified as a Hardhat private key. Keystore mentions are code/documentation references; there are no tracked keystore data files. The exact local `.env` password was compared in memory: no match in tracked files and no match in `git log -p origin/main..HEAD`. Secret values are intentionally omitted.

| File:line | Category | Verdict | Reason |
|---|---|---|---|
| `README.md:18` | Database URL | SAFE | Placeholder credentials; loopback host. |
| `backend/test/audit.test.ts:48-49` | Database URL; session-secret fixture | SAFE | Test-only configuration; placeholder DB credentials on localhost and fake session fixture; does not match `.env`. |
| `backend/test/auth.test.ts:18-19` | Database URL; session-secret fixture | SAFE | Test-only placeholder configuration; does not match `.env`. |
| `backend/test/authorization-matrix.test.ts:94-95` | Database URL; session-secret fixture | SAFE | Test-only placeholder configuration; does not match `.env`. |
| `backend/test/batches.test.ts:60-61` | Database URL; session-secret fixture | SAFE | Test-only placeholder configuration; does not match `.env`. |
| `backend/test/config.test.ts:12-13,41` | Database URL; session-secret fixture | SAFE | Test configuration and invalid-input fixture; does not match `.env`. |
| `backend/test/events-stats.test.ts:91-92` | Database URL; session-secret fixture | SAFE | Test-only placeholder configuration; does not match `.env`. |
| `backend/test/exams.test.ts:104-105` | Database URL; session-secret fixture | SAFE | Test-only placeholder configuration; does not match `.env`. |
| `backend/test/health.test.ts:15-16` | Database URL; session-secret fixture | SAFE | Test-only placeholder configuration; does not match `.env`. |
| `backend/test/helpers/indexer-process-worker.ts:114-115` | Database URL; session-secret fixture | SAFE | Test-only fake worker URL/credentials and session fixture; does not match `.env`. |
| `backend/test/indexer.test.ts:255-256,345-346,427-428` | Database URL; session-secret fixture | SAFE | Mock-host test fixtures and fake session values; not the configured URL. |
| `backend/test/profiles.test.ts:27-28` | Database URL; session-secret fixture | SAFE | Test-only placeholder configuration; does not match `.env`. |
| `backend/test/security.test.ts:15-16` | Database URL; session-secret fixture | SAFE | Test-only placeholder configuration; does not match `.env`. |
| `scripts/dev-all.mjs:96` | URL construction | SAFE | Code constructs a localhost URL dynamically; no credentials are embedded. |
| `backend/test/indexer.test.ts:437-438,512,527,542` | 64-hex values | SAFE | `ciphertextHash`/hash test fixtures, not private-key use. |
| `packages/core/test/core.test.ts:29` | 64-hex value | SAFE | Expected Keccak-256 test vector. |
| `packages/core/vectors/basic.json:2,62` | 64-hex values | SAFE | Explicit seed and variant-hash vectors. |
| `backend/src/logger.ts:12` | Keystore keyword | SAFE | Logger redaction key name in source. |
| `docs/backend-chapter.md:16`; `docs/PROGRESS.md:26` | Keystore keyword | SAFE | Documentation references only. |
| `packages/core/package.json:35-37`; `packages/core/README.md:11`; `packages/core/src/index.ts:5`; `packages/core/src/keystore.ts:39,58,63,67-68,76`; `packages/core/src/types.ts:40` | Keystore keyword | SAFE | Source/package/documentation references; not keystore data files. |
| `packages/core/test/core.test.ts:65,67-72`; `packages/core/test/smoke.test.ts:9,31-34,64` | Keystore keyword | SAFE | Test/source references; not keystore data files. |
| All tracked files; `git log -p origin/main..HEAD` | Exact `.env` password search | SAFE | No occurrence in tracked files or branch patch history. |
| Tracked repository files | Keystore artifact search | SAFE | No tracked `.sigilkey` or keystore data file. |

## Member 2 reviewer checklist

- [ ] No private key or signing operation exists in the backend.
- [ ] Ciphertext, shares, and cookies are never logged.
- [ ] Every endpoint validates request input with Zod.
- [ ] SIWE nonce replay and domain checks are enforced and tested.
- [ ] Roles are read from the chain.
- [ ] A holder can fetch only their own encrypted share.
- [ ] Batches remain pending until the indexer confirms the matching chain event.
- [ ] The indexer is idempotent and resumable.
- [ ] Errors use the uniform documented error shape.
- [ ] OpenAPI matches the routes; `docs/api/openapi.json` has not been changed by this review-package work.
- [ ] No dummy data was introduced.
- [ ] No secrets are committed.
- [ ] The authorization matrix covers every endpoint.

## Known limitations

- The indexer process-restart test uses a JSON persistence adapter, not PostgreSQL.
- Root lint reports the existing Solhint max-states warning in Member 1's contract.
- Member 2's peer review is pending; no Member 3 task is marked Done before approval.
- Remaining Member 3 duties: Gate 2 walking-skeleton check once Members 4 and 5 deliver the frontend, and final integration review under the section 15 review ring.

## Re-run commands

Run from repository root. `backend/.env` must exist locally and must not be printed or committed.

```powershell
corepack pnpm --filter @sigil/backend exec prisma migrate deploy --schema prisma/schema.prisma
corepack pnpm demo:reset
corepack pnpm dev:all
curl.exe --silent --show-error --max-time 10 --write-out "`nHTTP %{http_code}`n" http://127.0.0.1:4000/api/health
corepack pnpm lint
corepack pnpm --filter @sigil/backend typecheck
corepack pnpm --filter @sigil/backend test
node scripts/test-indexer-process.mjs
corepack pnpm test:auth-matrix
```

The reset and process test need a local Hardhat node. Start one, if needed, with `corepack pnpm --filter @sigil/contracts exec hardhat node` in another terminal; stop it after the checks. `dev:all` starts the API/web and may manage a chain. Stop all started processes after health verification.
