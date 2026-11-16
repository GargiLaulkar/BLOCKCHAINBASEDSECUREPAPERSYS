# FB-08 Evidence PDF, Decoy Manager, and Roster Proof

## Implemented features and routes

- `/auditor/evidence-report` — Auditor-only PDF reports for indexed `LeakReported` events.
- `/auditor/decoys` — Auditor read-only decoy monitoring; an on-chain Authority may register a decoy content hash through the real `registerDecoy` contract method.
- `/auditor/roster-proof` — Auditor view comparing the on-chain Holder panel and status getters with indexed event references.

The Auditor dashboard and role navigation link to the evidence report, decoy monitor, and roster proof. Authority navigation links to the decoy manager because the current contract restricts `registerDecoy` to `AUTHORITY_ROLE`.

## Data sources

- Indexed records come from the existing `GET /api/events` endpoint and `ChainEvent` data. The feature pages use the existing cursor API; they do not add an indexer or backend endpoint.
- Roster assignments and ceremony statuses are read from the configured ExamVault contract using its existing `getExam`, `getPanel`, `getRandomnessCommitment`, `hasCommittedRandomness`, `getShareCommitment`, `hasSubmittedShare`, and `getRosterRoot` functions.
- No DB schema, backend route, contract, or ABI changes were needed.

## Evidence PDF contents and limitations

The downloadable file is a real, uncompressed PDF (`%PDF-1.4`), generated locally without an added PDF dependency. It includes exam ID, generation time, indexed event time, Auditor wallet, evidence hash, matched variant hash, suspected Centre, transaction hash, block number, source, and verification disclaimer. It does not include the evidence description, original file, question paper, seed, key, or share material.

The source `LeakReported` event is indexed from the configured contract address. The report identifies that provenance but does not independently re-fetch the transaction receipt. The contract records an evidence hash, not the underlying evidence. A hash can support integrity comparison; it does not prove the evidence is authentic or that the allegation is true. Protected evidence file storage and private evidence download are not implemented.

## Decoy capabilities and limitations

The contract supports `registerDecoy(uint256,bytes32,bytes32)` and emits `DecoyRegistered(examId,decoyHash,channelLabel)`. The Authority form accepts a local PDF, computes its Keccak-256 hash in the browser, drops the file reference, and submits only the exam ID, content hash, and bytes32 channel label. The receipt must succeed and contain the expected event before the UI reports confirmation. The monitor displays actual indexed `DecoyRegistered` events.

There is no decoy paper generator, private content store, distribution ledger, or on-chain getter for decoy registrations. Registration proves only that the hash and label were recorded. It does not prove the decoy was created, distributed, received, or leaked. The selected decoy file is never uploaded or retained by this feature.

## Roster proof methodology and limitations

The page loads assigned Holders from `getPanel` and reads each Holder's commitment/submission status from contract getters. When an indexed `ShareSubmitted` event exists, its share commitment is compared with the on-chain `getShareCommitment` result. The on-chain roster root is compared with an indexed `RosterPublished` event when available. The CSV export contains only the panel, threshold, public commitment hashes, statuses, and event references.

The contract exposes a roster root but this application has no candidate roster source or Merkle inclusion-proof workflow; the page cannot prove an individual candidate's inclusion. Commitment hashes do not prove Shamir share validity. A submitted share status does not prove protected reconstruction or complete release authorization. Raw shares and private material are never read or displayed.

## Authorization and security

Evidence and roster routes require an authenticated Auditor role through the existing application shell and page guard. Decoy monitoring accepts Auditor or Authority roles; registration additionally checks the connected wallet's on-chain Authority role. The shared indexed-events API remains public for the existing Public Verifier; these pages display only the fields required for their views and do not expose raw payloads.

## Local demonstration

1. Start the existing backend and frontend and connect a wallet to the configured local chain.
2. Sign in as an Auditor and open the Auditor dashboard. Use the links for **Evidence PDF reports**, **Decoy monitor**, and **Roster proof**.
3. Evidence reports appear only after the existing indexer records a `LeakReported` event. Download a PDF and inspect its PDF header and disclaimer.
4. For decoy registration, sign in with an Authority wallet, select an exam, hash a PDF locally, add a short channel label, and confirm the actual wallet transaction. The list updates when the configured indexer catches up.
5. Select an exam in Roster proof to compare on-chain panel/status getters and indexed event references. Export the public status summary as CSV.

## Future dependencies

Protected evidence upload/retrieval requires an access-controlled evidence store and backend authorization. Decoy generation and proof of distribution require a secure paper generation/distribution workflow. Candidate inclusion verification requires a canonical roster source plus a Merkle proof generation/verification path. The current Centre Paper Station does not provide production paper generation or managed printing, so FB-08 does not claim those capabilities.
