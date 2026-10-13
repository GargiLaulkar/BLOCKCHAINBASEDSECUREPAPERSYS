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

| Task ID | Description | Status | Notes |
|---|---|---|---|
| BE-01 | Scaffold Express, config validation, Docker Compose for PostgreSQL | Completed | Config validation & /api/health tests passing |
| BE-02 | Prisma schema and migrations (section 8.3) | Completed | Schema & initial SQL migration created |
| BE-03 | SIWE authentication, session, chain-derived roles | Completed | EIP-4361, nonce replay & domain checks tested |
| BE-04 | Exam metadata endpoints with hash verification | Completed | Filtered authenticated views, public summary variant, canonical hash check & authority verification |
| BE-05 | Batch upload, confirmation, gated download | Completed | 5 MB multipart ciphertext uploads stored as pending with server-generated paths; chain-confirmed listing, role/state gating and hash-verified downloads tested |
| BE-06 | Encrypted share endpoints | Completed | Authority PUT in Draft with envelope validation, holder-only GET /me |
| BE-07 | Indexer (backfill, live, idempotent, resumable) | Completed | Section 7.3 event decoder, idempotent derived table mutations, resumable state, 24h unconfirmed batch purge |
| BE-08 | Events and stats endpoints with pagination and filters | Completed | Public filtered event feed with stable cursor paging; authenticated indexed overview and readiness schemas; server-side share verification explicitly omitted |
| BE-09 | Audit trace endpoints | Completed | Auditor-only traces validate MatchReport JSON, verify canonical Keccak evidence hashes, recheck the chain role, and restrict reads to the owner |
| BE-10 | Security middleware, logging, uniform errors, rate limits | Completed | Strict frontend-origin CORS, Helmet, Zod request validation, differentiated auth/upload limits, sensitive-field redaction, section 11 checks; profiles hash `keccakJson({displayName, organisation})` using core RFC 8785 canonicalization |
| BE-11 | OpenAPI document and generated frontend types | Completed | Zod-derived OpenAPI 3.1, generated frontend types, and CI drift check in place |
| BE-12 | Authorisation matrix test suite | Not Started | Role matrix coverage |
| BE-13 | `dev:all` and `demo:reset` scripts | Not Started | Developer tooling & scripts |
