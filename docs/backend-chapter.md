# Backend and data chapter

## Architecture and trust boundary

The backend is a TypeScript/Express service between the browser, PostgreSQL plus local blob storage, and the `ExamVault` EVM contract. The browser and `@sigil/core` perform cryptographic operations. The backend exposes REST endpoints, authenticates wallet holders with SIWE, applies global-role and per-exam authorization, stores ciphertext and metadata, verifies content hashes, and projects contract events into queryable database state. It does not sign transactions or possess a key that can decrypt the question bank.

PostgreSQL holds the `Exam`, `Participant`, `PanelMember`, `Batch`, `EncryptedShare`, `ChainEvent`, and `LeakTrace` records. Large encrypted batch blobs are stored under the configured `BLOB_DIR`; the database stores a server-generated relative blob path and the Keccak-256 digest. Indexed event records are uniquely identified by transaction hash and log index. The deployment address, deployment block, chain ID, database URL, session secret, frontend origin, and blob directory are validated from environment configuration at startup.

## Stored data and data deliberately excluded

| Location | Data held |
|---|---|
| Contract | Roles, exam configuration and state, public keys, commitments, batch hashes, release events, and other public lifecycle events |
| Backend database | Exam metadata and its on-chain hash, participant profile fields and profile hash, panel assignments, encrypted share envelopes, indexed chain events and derived state, and auditor leak-trace reports |
| Backend blob directory | Ciphertext batch bytes while pending or confirmed; unconfirmed pending batches are eligible for purge after 24 hours |
| Browser only | Plaintext question composition/decryption, holder private keys in the local encrypted keystore, passphrases, and the exam key during the browser ceremony before it is wiped |

The backend never stores passphrases, holder private keys, the exam decryption key, plaintext question-bank contents, or plaintext shares as application data. Ciphertext and encrypted shares remain opaque to it. On-chain share publication at release is public by design; the backend indexes public chain events but does not hold the key material. Display names, organisation values and exam metadata are backend data, so the backend is not entirely free of personal or identifying information.

## SIWE authentication

1. The client requests `GET /api/auth/nonce`; the server generates a fresh SIWE nonce and puts it in the session.
2. The wallet signs a SIWE message containing that nonce and the expected frontend domain.
3. The client sends the message and signature to `POST /api/auth/verify`.
4. The server validates the request schema, requires the nonce to match the session, consumes the nonce (including on mismatch), verifies the domain and signature, and normalizes the recovered Ethereum address.
5. The server queries `ExamVault.hasRole` for the address and stores the address and chain-derived roles in an httpOnly, SameSite=Lax session cookie (`Secure` in production). `GET /api/auth/me` reports that session; logout destroys it.

The browser's declared roles are not trusted. The role service uses a short in-process cache (60 seconds). Route authorization combines authentication and role checks with exam-specific assignment/state checks; sensitive flows also recheck relevant chain permissions where required. This is wallet authentication and authorization, not real-world identity proof.

## Indexer: event projection, idempotency, and resume

At startup the indexer backfills from `DEPLOY_BLOCK`, then polls the configured contract for logs on a two-second interval. It decodes events with the published contract ABI, stores each `ChainEvent` with a unique `(txHash, logIndex)` key, and applies event-specific upserts/forward state transitions to derived tables. `BatchSubmitted` confirms a pending upload only when the event identifies the stored batch hash; otherwise the event is recorded without falsely confirming the pending blob. Database event writes and their derived-table updates are grouped in a transaction.

After a block range's transaction commits, the indexer writes its last processed block to `.indexer-state.json` in `BLOB_DIR`. On restart it resumes after that block. If the chain height is lower than the saved cursor (for example after a local Hardhat reset), it resets its cursor to `DEPLOY_BLOCK`. Unique event keys and idempotent derived mutations make replay safe. Tests exercise replay and reconstruct the indexer from a persisted mid-backfill cursor. A separate BE-07 integration test launches a child process against a real local Hardhat contract, kills it after fetching backfill logs but before persistence, restarts it, compares all expected transaction/log keys, and verifies the derived Exam and Batch state remains identical after replay. That process-level test uses a JSON-backed durable database adapter; PostgreSQL behavior is covered separately by ordinary application integration when a database is available.

Reorganization handling is intentionally basic: the indexer detects a lower chain height, but does not compare a persisted last-block hash or rewind a same-height fork. The cursor file and blob storage also share the configured blob directory, so that directory must be persistent and backed up consistently with the database.

## Authorization model

Global roles are read from the contract: `ADMIN`, `AUTHORITY`, `SETTER`, `HOLDER`, `CENTRE`, and `AUDITOR`. Authentication is required for protected endpoints; role middleware denies absent roles. Individual exam permissions are further limited by the indexed/chain exam panel and lifecycle state:

- Only the creating AUTHORITY may store exam metadata or encrypted holder shares; share storage is Draft-only.
- Only an assigned SETTER can submit multipart ciphertext while the exam is Collecting.
- A batch remains pending until its hash matches the `BatchSubmitted` event. Listings expose confirmed batches only.
- The creating AUTHORITY can list batches; assigned CENTRE and AUDITOR users can list them only at Released or later. Download requests independently recheck authorization and verify the on-disk blob digest before streaming.
- A HOLDER can retrieve only their own encrypted share for an exam to which they are assigned.
- Event reads are public. Statistics require authentication. Leak traces require AUDITOR access and are readable only by their submitting auditor; the current role is rechecked for that trace access.
- Profiles are authenticated and address-scoped. Health and the committed OpenAPI document are public.

Request bodies, query parameters and route parameters are validated with Zod-based request validation. Helmet, frontend-origin CORS, differentiated API/auth/upload rate limits, multipart size/type checks, a uniform API error envelope and Pino redaction provide additional boundary controls.

## Threat-model coverage (section 13)

| Section 13 threat row | Backend contribution | Residual boundary |
|---|---|---|
| Storage — database administrator swaps/edits ciphertext | Upload digest is recorded; a chain event must match before confirmation; download recomputes the digest before streaming. | Does not ensure availability or protect a compromised host from deleting blobs. |
| Storage — backend compromised | The service stores encrypted batches and encrypted share envelopes, not decryption keys. | An attacker can deny service, alter/delete metadata or ciphertext, or expose stored profile/metadata fields. |
| Identity — impersonation of candidates | SIWE signature verification, one-time session nonce and domain checking establish control of a wallet address. | Does not prove a candidate's real-world identity or implement the P1 roster proof/ P2 identity proof. |
| Governance — admin abuses role changes | Authorization is derived from contract roles rather than backend-controlled role claims; role registration/revocation is recorded on-chain. | The prototype still has a single admin; production governance needs a multisig and operational controls. |
| Replay — ciphertext or commitment reused across exams | The backend keys event records by chain transaction/log index and binds upload confirmation to the exam and ciphertext hash; cryptographic AAD/commitment binding is provided by the core/contract layers. | Backend deduplication is not a substitute for cryptographic exam-context binding. |
| Post-release — outsider obtains ciphertext and public shares | Batch list/download routes gate access by role, assignment and Released-or-later state, then verify the stored bytes. | Released shares are public; this relies on encrypted bank access control and a short exam window. Production should re-encrypt shares to centre-specific keys. |
| Setting — setter leaks their questions | The backend restricts submission to assigned setters and accepted batches are hash-bound to the chain. | It cannot stop an authorized setter from leaking questions they authored. |
| Release — early release attempt | Backend batch access is state-gated; actual share release timing is enforced by the contract. | The backend cannot stop t colluding holders from pooling shares off-chain. |
| Printing — centre photographs/leaks a paper | Auditor reports are validated, hash-bound and scoped to the filing auditor. | The backend tracer attributes evidence to a centre variant, not an individual, and does not prevent photography. |

These controls reduce the backend's custody and access risks; they do not make the overall system leak-proof.

Other section 13 rows are primarily controlled outside the backend: early Authority access and holder collusion rely on the browser ceremony, threshold cryptography and contract time gates; fake-share rejection and unavailable-holder recovery rely on contract commitments and the lifecycle; last-revealer bias is inherent in the commit-reveal design; and browser XSS/key theft depends on frontend/browser controls. The backend contributes by not holding decryption keys and by indexing those on-chain actions, but cannot eliminate these risks.

## Limitations and completion evidence

This implementation is a prototype for a single-node local chain. It is not a production deployment or a true time-lock: the Authority is trusted during browser-based key generation, t holders may collude off-chain, commit-reveal randomness has last-revealer bias, and a released/decrypted paper can still be photographed. The current Express session configuration does not install a production session store; its default in-memory store is not durable or horizontally scalable. Role results are cached in-process for up to 60 seconds, so revocation visibility can lag. Indexer fork handling is limited as described above.

Verification in this wrap-up: backend typecheck and ESLint passed; root recursive lint passed with one existing Solhint warning. With a local Hardhat node, the backend suite passed (52 tests; the standalone authorization matrix and opt-in process test are skipped in that invocation); the separate process restart test passed, as did the real-chain authorization matrix (295 tests). Clean-database migration and complete `dev:all`/`demo:reset` execution remain unverified because neither Docker nor a configured local PostgreSQL database was available. The health endpoint's existing interface reports chain connectivity only; no database field was added because interfaces in sections 6–9 are frozen.
