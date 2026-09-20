# Contract Spec Changes and Additive Items

This document tracks all additive items, state transitions, views, and design choices for smart contracts, as per Agent Rule 4.

## Additive Items & Assumptions for SC-01 to SC-03

1. **Role Definitions (`uint8`):**
   - Role 1: `AUTHORITY_ROLE` (`keccak256("AUTHORITY_ROLE")`)
   - Role 2: `SETTER_ROLE` (`keccak256("SETTER_ROLE")`)
   - Role 3: `HOLDER_ROLE` (`keccak256("HOLDER_ROLE")`)
   - Role 4: `CENTRE_ROLE` (`keccak256("CENTRE_ROLE")`)
   - Role 5: `AUDITOR_ROLE` (`keccak256("AUDITOR_ROLE")`)
   - `ADMIN` is `DEFAULT_ADMIN_ROLE` (`0x00`), held by the deployer and cannot be granted through `registerParticipant`.

2. **Constructor:**
   - Accepts `uint64 minLeadSeconds` (stored in immutable variable `minLeadSeconds`).

3. **Storage:**
   - `encryptionKeys`: `mapping(address => bytes)` stores each holder's registered 65-byte uncompressed P-256 public key.
   - `liveExamCount`: `mapping(address => uint256)` tracks per-holder active live exam assignments (`Draft`, `Collecting`, `Sealed`) for `HolderInLiveExam` checks on `revokeParticipant` and `setEncryptionKey`.

4. **Additive Errors & Views:**
   - `ExamNotFound()` custom error for invalid `examId` queries.
   - `InvalidRole(uint8 role)` custom error when an unrecognized role byte is provided to `registerParticipant` / `revokeParticipant`.
   - `CannotGrantAdmin()` custom error if role 0 / admin is attempted via `registerParticipant`.
   - `InvalidQuotas()` custom error if quotas array length is 0 or > 8, or if any quota is 0.
   - `nextExamId()` view returning the next `examId` (starts from 1).
   - `getExam(uint256 examId)` view returning the `Exam` struct data.
   - `getPanel(uint256 examId)` view returning `(address[] memory holders, address[] memory setters, address[] memory centres)`.

## Additive Items & Encodings for SC-04, SC-05, and SC-06

1. **Function Signatures:**
   - `openCollection(uint256 examId, bytes calldata examPublicKey) external`
     * Caller must have `AUTHORITY_ROLE` and be `exam.authority`.
     * State must be `Draft`.
     * `examPublicKey` must be 65 bytes starting with `0x04`.
     * Transitions state to `Collecting`. Emits `CollectionOpened`.
   - `commitRandomness(uint256 examId, bytes32 shareCommitment, bytes32 randomnessCommitment) external`
     * Caller must be an assigned panel holder (`isHolder[examId][msg.sender]`).
     * State must be `Collecting`.
     * Emits `RandomnessCommitted(examId, msg.sender)`.
   - `submitBatch(uint256 examId, uint8 sectionId, bytes32 ciphertextHash, uint16 questionCount) external returns (uint256 batchId)`
     * Caller must be an assigned panel setter (`isSetter[examId][msg.sender]`).
     * State must be `Collecting`.
     * `startInSection` is recorded as the running total of questions in that section prior to this batch.
     * Duplicate `ciphertextHash` within the same exam reverts with `DuplicateEntry()`.
     * Emits `BatchSubmitted(examId, batchId, msg.sender, sectionId, ciphertextHash, questionCount, startInSection)`.
   - `sealExam(uint256 examId) external`
     * Caller must have `AUTHORITY_ROLE` and be `exam.authority`.
     * State must be `Collecting`.
     * Verifies `_sectionQuestionCount[examId][i] == exam.quotas[i]` for all sections (reverts `QuotaNotMet(i, have, need)` otherwise).
     * Verifies all assigned holders committed randomness (reverts `MissingCommitment(holder)` if missing).
     * Transitions state to `Sealed`. Emits `ExamSealed(examId, bankHash)`.
   - `submitShare(uint256 examId, bytes calldata share, bytes32 reveal) external`
     * Caller must be an assigned panel holder (`isHolder[examId][msg.sender]`).
     * State must be `Sealed` or `Released`.
     * Time must satisfy `releaseOpensAt <= block.timestamp <= examEndsAt`.
     * Verifies share and randomness commitments.
     * When submissions reach `threshold`, computes canonical seed, decrements `liveExamCount` for all panel holders, and transitions state to `Released`. Plaintext shares are emitted in `ShareSubmitted` events only (never stored on-chain).

2. **Exact Canonical Encodings (Member 2 Specification):**

   - **Share Commitment:**
     $$\text{shareCommitment} = \text{keccak256}(\text{abi.encode}(\text{uint256 } \text{examId}, \text{address } \text{holder}, \text{bytes } \text{share}))$$
     * Solidity: `keccak256(abi.encode(examId, msg.sender, share))`
     * Ethers.js / TypeScript: `ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["uint256", "address", "bytes"], [examId, holderAddress, shareBytes]))`

   - **Randomness Commitment:**
     $$\text{randomnessCommitment} = \text{keccak256}(\text{abi.encode}(\text{uint256 } \text{examId}, \text{address } \text{holder}, \text{bytes32 } \text{reveal}))$$
     * Solidity: `keccak256(abi.encode(examId, msg.sender, reveal))`
     * Ethers.js / TypeScript: `ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["uint256", "address", "bytes32"], [examId, holderAddress, revealBytes32]))`

   - **Bank Hash (`bankHash`):**
     $$\text{bankHash} = \text{keccak256}(\text{abi.encodePacked}(\text{bytes32[] } \text{batchHashes}))$$
     where `batchHashes` is the array of `ciphertextHash` for all submitted batches in submission order.
     * Solidity: `keccak256(abi.encodePacked(batchHashes))`
     * Ethers.js / TypeScript: `ethers.keccak256(ethers.solidityPacked(["bytes32[]"], [batchHashes]))` or `ethers.keccak256(ethers.concat(batchHashes))`

   - **Release Seed (`seed`):**
     $$\text{seed} = \text{keccak256}(\text{abi.encode}(\text{uint256 } \text{examId}, \text{bytes32[] } \text{reveals}))$$
     where `reveals` contains exactly the `t` reveals from the holders who submitted their shares to reach the threshold, ordered strictly by each holder's original index in the panel `holders` array (`_examHolders[examId]`).
     * Solidity: `keccak256(abi.encode(examId, reveals))`
     * Ethers.js / TypeScript: `ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["uint256", "bytes32[]"], [examId, revealsArray]))`

3. **Additive Views and Errors:**
   - `BatchNotFound()` custom error for out-of-range batch queries.
   - `getBatches(uint256 examId)`: returns `Batch[] memory` of all batches in exam.
   - `getBatch(uint256 examId, uint256 batchId)`: returns `Batch memory` for 1-indexed `batchId`.
   - `getSectionQuestionCount(uint256 examId, uint8 sectionId)`: returns `uint16` total question count in section.
   - `getShareCommitment(uint256 examId, address holder)`: returns `bytes32` share commitment.
   - `getRandomnessCommitment(uint256 examId, address holder)`: returns `bytes32` randomness commitment.
   - `hasSubmittedShare(uint256 examId, address holder)`: returns `bool` whether holder has submitted their share.
   - `getShareSubmissionCount(uint256 examId)`: returns `uint256` total shares submitted for exam.

## Additive Items & Rules for SC-07, SC-08, SC-09, SC-10

1. **`cancelExam(uint256 examId, bytes32 reasonHash)`:**
   - Allowed from **any** state except `Cancelled` (i.e. allowed from `Draft`, `Collecting`, `Sealed`, `Released`, and `Concluded`).
   - Reverts with `ZeroValue()` if `reasonHash == bytes32(0)`.
   - Reverts with `NotAssigned()` if caller is not `exam.authority`.
   - **`liveExamCount` Rule**: If the exam was in a live state (`Draft`, `Collecting`, `Sealed`), decrements `liveExamCount` for each holder in the exam's panel. If cancelled from `Released` or `Concluded`, `liveExamCount` is not decremented again (it was already decremented at threshold release).

2. **`reportLeak(uint256 examId, bytes32 evidenceHash, address suspectCentre, bytes32 matchedVariantHash)`:**
   - Caller must have `AUDITOR_ROLE`.
   - Allowed in `Released`, `Concluded`, or `Cancelled` state (reverts `WrongState(State.Released, exam.state)` otherwise).
   - Reverts with `ZeroValue()` if `evidenceHash == bytes32(0)` (or if `suspectCentre == address(0)` and `matchedVariantHash == bytes32(0)`).
   - If `suspectCentre != address(0)`:
     - Reverts with `NotAssigned()` if `suspectCentre` is not assigned to the exam panel (`!isCentre[examId][suspectCentre]`).
     - Reverts with additive custom error `CopyMismatch()` if `suspectCentre` has not registered a copy (`_copyRegisteredAt == 0`), or if `_copyVariantHash[examId][suspectCentre] != matchedVariantHash`, or if `matchedVariantHash == bytes32(0)`.
   - If `suspectCentre == address(0)`, allows reporting unattributed leaks with non-zero `evidenceHash` and non-zero `matchedVariantHash`.

3. **`registerCopy(uint256 examId, bytes32 variantHash)`:**
   - Caller must have `CENTRE_ROLE` and be an assigned centre in the exam panel (`isCentre[examId][msg.sender]`).
   - Allowed strictly in `Released` state with `block.timestamp <= examEndsAt` (no lower bound check against `examStartsAt`).
   - Reverts with `ZeroValue()` if `variantHash == bytes32(0)`.
   - Reverts with `AlreadySubmitted()` if the caller centre has already registered (`_copyRegisteredAt[examId][msg.sender] != 0`).
   - Reverts with `DuplicateEntry()` if the `variantHash` was already registered by another centre (`_copyOwner[examId][variantHash] != address(0)`).
   - Stores `_copyOwner[examId][variantHash] = msg.sender`, `_copyRegisteredAt`, and `_copyVariantHash`.

4. **`publishRoster(uint256 examId, bytes32 merkleRoot)`:**
   - Caller must have `AUTHORITY_ROLE` and be `exam.authority`.
   - Allowed in `Draft`, `Collecting`, or `Sealed` state.
   - Reverts with `ZeroValue()` if `merkleRoot == bytes32(0)`.
   - Can only be set once per exam; reverts with `AlreadySubmitted()` if already set (`_rosterRoots[examId] != bytes32(0)`).

5. **`registerDecoy(uint256 examId, bytes32 decoyHash, bytes32 channelLabel)`:**
   - Caller must have `AUTHORITY_ROLE` and be `exam.authority`.
   - Allowed in `Sealed` or `Released` state.
   - Reverts with `ZeroValue()` if `decoyHash == bytes32(0)`.

6. **`concludeExam(uint256 examId)`:**
   - Caller must have `AUTHORITY_ROLE` and be `exam.authority`.
   - State must be `Released`.
   - Must be called strictly after `examEndsAt` (`block.timestamp > examEndsAt`).
   - Does **not** decrement `liveExamCount` (already decremented during threshold release in `submitShare`).

7. **Additive Views for SC-07:**
   - `getCopyOwner(uint256 examId, bytes32 variantHash)`: returns `address` of the centre that registered that variant hash (or `address(0)`).
   - `getRosterRoot(uint256 examId)`: returns `bytes32` candidate roster Merkle root (or `bytes32(0)`).
   - `getCopy(uint256 examId, address centre)`: returns `(bytes32 variantHash, uint64 registeredAt)`.
   - `getSectionTotals(uint256 examId)`: returns `uint16[] memory` array of question counts across all sections.
   - `hasCommittedRandomness(uint256 examId, address holder)`: returns `bool`.

8. **SC-08 TODO:**
   - Cross-language test vectors for paper selection and seed derivation, pending Member 2's frozen vectors.

9. **Deployment & Types Package (SC-09):**
   - Script `contracts/scripts/deploy.ts` writes deployment metadata (`address`, `blockNumber`, `chainId`, `minLeadSeconds`, `deployedAt`) into `contracts/deployments/{network}.json`.
   - Exports contract ABI and TypeChain typings into `@sigil/contracts-types` (`packages/contracts-types`).

10. **Hardhat Tasks (SC-10):**
    - `demo:bootstrap-roles`: Assigns roles from local accounts to all 5 roles idempotently without setting encryption keys. Prints all assigned addresses.
    - `demo:advance-time`: Advances EVM time on local development networks (`hardhat`, `localhost`, chainId 31337) and strictly refuses non-local networks.
