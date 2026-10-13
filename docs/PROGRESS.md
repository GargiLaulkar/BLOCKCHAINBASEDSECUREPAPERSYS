# Smart Contracts Progress (Member 1)

| Task ID | Description | Status | Tests |
|---|---|---|---|
| SC-01 | Hardhat + TypeScript project scaffolding in `contracts/` with OpenZeppelin v5, TypeChain, hardhat-network-helpers, solidity-coverage, solhint, pnpm workspace root | Completed | 50 passing (100% coverage) |
| SC-02 | `ExamVault.sol` AccessControl, participant registry, encryption keys, custom errors, events | Completed | 50 passing (100% coverage) |
| SC-03 | `createExam`, Exam and Batch structs, panel validation, custom errors, events, views | Completed | 50 passing (100% coverage) |
| SC-04 | `openCollection`, `commitRandomness`, `submitBatch` — collection phase with running `startInSection`, duplicate ciphertextHash rejection | Completed | 90 passing |
| SC-05 | `sealExam` — quota verification, holder commitment checks, `bankHash` computation from batch hashes in submission order | Completed | 90 passing |
| SC-06 | `submitShare` — threshold release with time-window checks, share/reveal commitment verification, canonical seed computation, state invariance | Completed | 90 passing |
| SC-07 | `registerCopy`, `publishRoster`, `registerDecoy`, `reportLeak`, `concludeExam`, `cancelExam`, views (`getCopyOwner`, `getRosterRoot`, `getCopy`, `getBatches`, `getSectionTotals`, `hasSubmittedShare`, `hasCommittedRandomness`), and `liveExamCount` lifecycle management | Completed | 146 passing (100% stmt/line/fn, 96.93% branch) |
| SC-08 | Cross-language test vectors for paper selection and seed derivation | Skipped (Documented TODO) | Pending Member 2's frozen vectors |
| SC-09 | Deployment script (`deploy.ts`), network deployment artifacts (`contracts/deployments/{network}.json`), exported ABI/artifacts, and `@sigil/contracts-types` package with README | Completed | Verified export & deployment |
| SC-10 | Hardhat demo tasks: `demo:bootstrap-roles` (idempotent role assignment, address printing) and `demo:advance-time` (restricted to local development networks) | Completed | Tested on Hardhat EVM |
| INT-01 | GitHub Actions CI (`.github/workflows/ci.yml`), contract coverage threshold enforcement script (`check-coverage.ts`), artifact upload | Completed | Verified local lint, typecheck, tests, coverage check |
| INT-03 | Generated contract specification (`gen-contract-spec.ts` -> `docs/contract-spec.md`), comprehensive threat model with real test evidence (`docs/threat-model.md`) | Completed | Verified drift check & spec generation |

## Cryptography & Core Package Progress (Member 2)

| Task ID | Description | Status | Notes |
|---|---|---|---|
| CR-01 | Scaffold package `@sigil/core`, Vitest, exports map | Completed | Builds for browser and Node |
| CR-02 | Canonical JSON (`canonicalize`) and `keccakJson` helpers | Completed | Known-answer tests pass |
| CR-03 | Envelope encryption and decryption with AAD | Completed | Tamper tests pass |
| CR-04 | Shamir wrapper, share commitments, combine and key-match check | Completed | All t-of-n combinations tested |
| CR-05 | Holder keystore (PBKDF2, AES-GCM) and deterministic reveal | Completed | Passphrase and reveal tested |
| CR-06 | Ceremony function | Completed | Private key wiped |
| CR-07 | Paper selection, variants, variant hash, set code, answer key | Completed | Determinism and vectors |
| CR-08 | `zod` schemas for questions, batches, meta, variants, API payloads | Completed | Schema validation |
| CR-09 | Leak matcher and synthetic test suite | Completed | Token 3-gram & Kendall tau matching |
| CR-10 | Encrypted local draft helper for setters (P1) | Completed | Round-trip tested |
| CR-11 | Performance and browser-compatibility checks | Completed | Met <1s target |
| CR-12 | Crypto review of usage | Completed | Reviewed |

## Backend & Data Progress (Member 3)

| Task ID | Owner | Status | PR link | Notes |
|---|---|---|---|---|
| BE-01 | Member 3 | In review | — | Express/config and health tests exist, but `dev:all` could not reach the API: localhost:5432 refused connections, `DATABASE_URL` was absent from env/backend/.env, and Docker CLI was unavailable. |
| BE-02 | Member 3 | In review | — | Prisma schema/migration exist. Clean migration/table verification could not run: Prisma P1012 reports `Environment variable not found: DATABASE_URL.` |
| BE-03 | Member 3 | In review | — | EIP-4361 SIWE, one-time nonce, domain/signature checks, session and chain-derived role tests pass; peer review is not evidenced in this checkout. |
| BE-04 | Member 3 | In review | — | Filtered authenticated views, public summary, canonical metadata hash check and creator-authority checks are implemented and tested; peer review is not evidenced in this checkout. |
| BE-05 | Member 3 | In review | — | 5 MB multipart ciphertext uploads remain pending until a matching chain event; assignment/state checks and hash-verified gated downloads are tested; peer review is not evidenced. |
| BE-06 | Member 3 | In review | — | Draft-only authority share storage validates envelopes; holders can fetch only their own encrypted share; peer review is not evidenced. |
| BE-07 | Member 3 | In review | — | Added and passed a child-process kill/restart test against a real local Hardhat contract; it checked complete event coverage, unique event keys, `Exam.state`, `Batch.status`, and stable replay. Its durable test-row adapter is JSON-backed rather than PostgreSQL; peer review remains unconfirmed. |
| BE-08 | Member 3 | In review | — | Public filtered event feed has stable cursor paging; authenticated indexed overview/readiness schemas omit server-unknowable share verification. Tests pass; peer review is not evidenced. |
| BE-09 | Member 3 | In review | — | Auditor-only trace creation/read validates MatchReport, canonical evidence hash and trace ownership; tests pass; peer review is not evidenced. |
| BE-10 | Member 3 | In review | — | Added backend ESLint/Prettier config and lint/format scripts; `corepack pnpm lint` passes (Solhint reports its existing max-states warning). Backend security/validator tests pass; peer review remains unconfirmed. |
| BE-11 | Member 3 | In review | — | Zod-derived OpenAPI, served document, generated frontend types and CI drift check are implemented; prior frontend typecheck passed; peer review is not evidenced. |
| BE-12 | Member 3 | In review | — | 295 real-chain authorization-matrix tests passed in this wrap-up (294 endpoint/actor cases plus route inventory); peer review is not evidenced. |
| BE-13 | Member 3 | In review | — | Scripts now load backend/.env without overriding environment values, prefer configured DATABASE_URL, derive a Docker connection from Compose config when unset without printing credentials, and reject non-loopback reset databases. Actual reset/startup remains unverified: no local DB or Docker is available. |

Current verification: backend typecheck passed; backend lint passed; root `corepack pnpm lint` passed (one existing Solhint warning); backend tests passed (52 passed; chain authorization and opt-in process integration suites skipped in that invocation); `node scripts/test-indexer-process.mjs` passed (1 test) against local Hardhat; `corepack pnpm test:auth-matrix` passed (295 tests). Local database checks failed/blocked because no DATABASE_URL, no PostgreSQL listener and no Docker CLI. Tasks stay In review where runtime/DoD evidence is missing. See [HANDOFF.md](./HANDOFF.md).
