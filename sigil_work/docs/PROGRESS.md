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

# Cryptography / Core Package Progress (Member 2)

| Task ID | Description | Status | Tests |
|---|---|---|---|
| CR-01 | Scaffolded `packages/core` (`@sigil/core`): strict TypeScript, ESM/NodeNext, Vitest, subpath exports map for every module in spec section 9 (`canonical`, `envelope`, `ceremony`, `shares`, `keystore`, `batch`, `paper`, `matcher`, `schemas`), plus a barrel `.` export. Every frozen function signature from section 9 exists as a typed stub that throws `"<fn>: not implemented yet (CR-0X)"` rather than returning dummy data. `decryptBatch`'s exact parameters are not frozen in the doc ("..."); stub assumes it mirrors `decryptEnvelope` — flagged in `src/batch.ts` for review, not treated as settled. | Completed | 4 passing (Vitest); `tsc --noEmit` clean; `tsc` Node/ESM build verified by importing `dist/index.js` and a subpath (`dist/canonical.js`) directly; esbuild browser-target bundle (`verify:browser`) succeeds with no Node-only built-ins pulled in |

## Member 2 Cryptography / Core Package Progress

| Task ID | Description | Status | Verification |
|---|---|---|---|
| CR-01 | Core package scaffold | Completed in supplied scaffold | 4 scaffold tests documented in supplied progress |
| CR-02 | Canonical JSON and Keccak helpers | Implemented | Final workspace verification required |
| CR-03 | Envelope encryption/decryption with AAD | Implemented | Final workspace verification required |
| CR-04 | Shamir, share commitments and key-match check | Implemented | Final workspace verification required |
| CR-05 | PBKDF2/AES-GCM holder keystore and deterministic reveal | Implemented | Final workspace verification required |
| CR-06 | Exam key ceremony | Implemented | Final workspace verification required |
| CR-07 | Paper selection, variants, hashes, set code and answer key | Implemented | Final workspace verification required; vector included |
| CR-08 | Zod schemas | Implemented | Final workspace verification required |
| CR-09 | Leak matcher and synthetic tests | Implemented | Final workspace verification required |
| CR-10 | Encrypted local draft helper | Implemented | Final workspace verification required |
| CR-11 | Performance/browser compatibility | Implemented checks | Final workspace verification required |
| CR-12 | Crypto review | Written source-level review | Integration review remains with consuming members |

**Verification note:** the packaging environment could not reach the npm registry, so dependencies could not be installed here. The source and tests are included, but the final `pnpm test`, `pnpm typecheck`, `pnpm build`, and `pnpm verify:browser` commands must be run in the user's project workspace before merge.
