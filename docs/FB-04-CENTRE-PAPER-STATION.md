# FB-04 Centre Paper Station: current implementation boundary

## What this build provides

- The Centre route remains protected by the existing `CENTRE` role guard.
- The existing assignment monitor continues to show only exams assigned to the connected Centre.
- A Centre paper request is checked by the backend against the on-chain Centre role, exam assignment, released state, and the configured exam time bounds.
- Generation and reprint requests are audited as sanitized application events. Reprint requests require a reason.
- Requests fail closed with `PROTECTED_PRINT_SERVICE_UNAVAILABLE`. No paper, seed, private key, share, signature, answer key, or success result is fabricated.
- Public and authenticated exam response DTOs use allowlists and omit the legacy `Exam.seed` field.
- The Holder frontend does not call the currently deployed reveal-bearing `submitShare` overload.
- The core package includes a testable verifier for each ordered batch ciphertext hash and the contract's `keccak256(abi.encodePacked(batchHashes))` bank hash.

## What this build does not provide

This is a **local demonstration of a safely blocked Centre station**, not an operational paper-generation or printing system. It does not reconstruct the exam private scalar, decrypt question batches, generate a paper artifact, validate attestor signatures, or print a copy.

The repository currently has no protected reconstruction worker, KMS/HSM integration, confidential-computing environment, production attestation service, registered Centre station keys, or local print agent. The existing Authority browser ceremony exposes the generated scalar and plaintext shares to that browser; the existing Holder browser decrypts its own share. Those workflows must be migrated before claiming the target custody boundary.

The currently compiled contract ABI still defines `submitShare(uint256,bytes32,bytes32)` with its third argument named `reveal`. The Holder UI therefore blocks share submission until a new commitment-only contract is deployed. Existing B1 attestor verification remains in the contract source and tests; this UI change does not alter or bypass those checks.

## Required before production use

1. Deploy the approved contract version with immutable seed commitments, no public reveal-derived seed path, Centre-scoped artifact authorization, validity windows, and replay protection.
2. Operate an isolated reconstruction/release worker with explicitly reviewed key custody. KMS envelope encryption alone does not provide enclave isolation or Shamir reconstruction.
3. Move key ceremony out of the Authority browser and provide a reviewed Holder-to-worker share submission path.
4. Verify all ordered ciphertext hashes and aggregate bank hash before decryption; validate the complete question bank.
5. Generate independent CSPRNG seeds and Centre variants only in the protected worker; keep the answer key separate.
6. Enroll managed Centre print stations and implement encrypted artifact delivery, device authorization, audit, duplicate prevention, and approved reprint handling.
7. Complete security review, integration tests, backup/recovery exercises, and test-network deployment before any production migration.

An authorized Centre operator can still photograph or physically copy a legitimately printed paper. Technical controls must be combined with supervised printing and physical handling procedures.
