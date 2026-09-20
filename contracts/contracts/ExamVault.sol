// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title ExamVault
 * @notice Time-locked, threshold-controlled custody of examination papers on a blockchain ledger.
 * @dev Enforces participant roles, multi-phase exam state transitions, threshold cryptography commitments,
 *      and per-centre copy verification without storing plaintext questions or secrets on-chain.
 */
contract ExamVault is AccessControl {
    // --- Roles ---
    bytes32 public constant AUTHORITY_ROLE = keccak256("AUTHORITY_ROLE");
    bytes32 public constant SETTER_ROLE = keccak256("SETTER_ROLE");
    bytes32 public constant HOLDER_ROLE = keccak256("HOLDER_ROLE");
    bytes32 public constant CENTRE_ROLE = keccak256("CENTRE_ROLE");
    bytes32 public constant AUDITOR_ROLE = keccak256("AUDITOR_ROLE");

    // --- State Machine ---
    enum State {
        Draft,
        Collecting,
        Sealed,
        Released,
        Concluded,
        Cancelled
    }

    // --- Structs ---
    struct ExamConfig {
        bytes32 metaHash;
        uint64 releaseOpensAt;
        uint64 examStartsAt;
        uint64 examEndsAt;
        uint8 threshold;
        address[] holders;
        address[] setters;
        address[] centres;
        uint16[] quotas;
    }

    struct Exam {
        uint256 id;
        State state;
        address authority;
        bytes32 metaHash;
        uint64 releaseOpensAt;
        uint64 examStartsAt;
        uint64 examEndsAt;
        uint8 threshold;
        uint8 holderCount;
        bytes32 bankHash;
        bytes32 seed;
        bytes examPublicKey;
        uint16[] quotas;
        uint64 releasedAt;
        uint64 concludedAt;
        bytes32 cancellationReasonHash;
    }

    struct Batch {
        uint256 batchId;
        address setter;
        uint8 sectionId;
        bytes32 ciphertextHash;
        uint16 questionCount;
        uint16 startInSection;
        uint64 submittedAt;
    }

    // --- Custom Errors (Spec Section 7.4) ---
    error NotAssigned();
    error WrongState(State expected, State actual);
    error TooEarly(uint64 nowTime, uint64 allowedFrom);
    error TooLate(uint64 nowTime, uint64 allowedUntil);
    error InvalidTimes();
    error InvalidThreshold();
    error InvalidPanel();
    error DuplicateEntry();
    error InvalidKeyFormat();
    error InvalidShare();
    error InvalidReveal();
    error AlreadySubmitted();
    error QuotaNotMet(uint8 sectionId, uint16 have, uint16 need);
    error MissingCommitment(address holder);
    error ZeroValue();
    error HolderInLiveExam();

    // --- Additive Custom Errors ---
    error InvalidRole(uint8 role);
    error CannotGrantAdmin();
    error ExamNotFound();
    error InvalidQuotas();
    error BatchNotFound();
    error CopyMismatch();

    // --- Events (Spec Section 7.3) ---
    event ParticipantRegistered(address indexed account, uint8 indexed role, bytes32 profileHash);
    event ParticipantRevoked(address indexed account, uint8 indexed role);
    event EncryptionKeySet(address indexed holder, bytes pubKey);
    event ExamCreated(
        uint256 indexed examId,
        address indexed authority,
        bytes32 metaHash,
        uint64 releaseOpensAt,
        uint64 examStartsAt,
        uint64 examEndsAt,
        uint8 threshold,
        uint8 holderCount
    );
    event PanelAssigned(
        uint256 indexed examId,
        address[] holders,
        address[] setters,
        address[] centres
    );
    event CollectionOpened(uint256 indexed examId, bytes examPublicKey);
    event RandomnessCommitted(uint256 indexed examId, address indexed holder);
    event BatchSubmitted(
        uint256 indexed examId,
        uint256 indexed batchId,
        address indexed setter,
        uint8 sectionId,
        bytes32 ciphertextHash,
        uint16 questionCount,
        uint16 startInSection
    );
    event ExamSealed(uint256 indexed examId, bytes32 bankHash);
    event ShareSubmitted(uint256 indexed examId, address indexed holder, bytes share);
    event PaperReleased(uint256 indexed examId, bytes32 seed, uint64 releasedAt);
    event CopyRegistered(uint256 indexed examId, address indexed centre, bytes32 variantHash, uint64 registeredAt);
    event DecoyRegistered(uint256 indexed examId, bytes32 decoyHash, bytes32 channelLabel);
    event RosterPublished(uint256 indexed examId, bytes32 merkleRoot);
    event LeakReported(
        uint256 indexed examId,
        address indexed auditor,
        bytes32 evidenceHash,
        address suspectCentre,
        bytes32 matchedVariantHash
    );
    event ExamConcluded(uint256 indexed examId);
    event ExamCancelled(uint256 indexed examId, bytes32 reasonHash);

    // --- Immutables & Storage ---
    uint64 public immutable minLeadSeconds;
    uint256 private _nextExamId;

    /// @notice Registered 65-byte uncompressed P-256 public keys for key holders
    mapping(address => bytes) public encryptionKeys;

    /// @notice Number of active live exams (Draft, Collecting, Sealed) a holder is currently assigned to
    mapping(address => uint256) public liveExamCount;

    /// @dev Storage for exam records
    mapping(uint256 => Exam) internal _exams;

    /// @dev Storage for panel participants
    mapping(uint256 => address[]) internal _examHolders;
    mapping(uint256 => address[]) internal _examSetters;
    mapping(uint256 => address[]) internal _examCentres;

    /// @notice Panel membership lookups per exam
    mapping(uint256 => mapping(address => bool)) public isHolder;
    mapping(uint256 => mapping(address => bool)) public isSetter;
    mapping(uint256 => mapping(address => bool)) public isCentre;

    /// @dev Storage for batches submitted per exam
    mapping(uint256 => Batch[]) internal _examBatches;

    /// @dev Track uniqueness of batch ciphertextHash per exam
    mapping(uint256 => mapping(bytes32 => bool)) internal _examCiphertextHashes;

    /// @dev Running question count per section per exam
    mapping(uint256 => mapping(uint8 => uint16)) internal _sectionQuestionCount;

    /// @dev Holder commitments per exam
    mapping(uint256 => mapping(address => bytes32)) internal _shareCommitments;
    mapping(uint256 => mapping(address => bytes32)) internal _randomnessCommitments;

    /// @dev Share submission and reveal tracking
    mapping(uint256 => mapping(address => bool)) internal _hasSubmittedShare;
    mapping(uint256 => mapping(address => bytes32)) internal _submittedReveals;
    mapping(uint256 => uint256) internal _shareSubmissionCount;

    /// @dev Copy registration per exam per centre
    mapping(uint256 => mapping(address => bytes32)) internal _copyVariantHash;
    mapping(uint256 => mapping(address => uint64)) internal _copyRegisteredAt;
    mapping(uint256 => mapping(bytes32 => address)) internal _copyOwner;

    /// @dev Candidate roster Merkle root per exam (published once)
    mapping(uint256 => bytes32) internal _rosterRoots;

    /**
     * @notice Deploy the ExamVault contract.
     * @param _minLeadSeconds Minimum lead time required between creation and releaseOpensAt (e.g. 60s for tests/demo, 3600s for prod).
     */
    constructor(uint64 _minLeadSeconds) {
        minLeadSeconds = _minLeadSeconds;
        _nextExamId = 1;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    // --- Participant Registry (SC-02) ---

    /**
     * @notice Register a participant with an assigned role and optional profile hash.
     * @dev Only DEFAULT_ADMIN_ROLE can register participants.
     * @param account Ethereum address of the participant.
     * @param role Numeric role identifier (1=AUTHORITY, 2=SETTER, 3=HOLDER, 4=CENTRE, 5=AUDITOR).
     * @param profileHash Keccak-256 hash of participant profile metadata (or bytes32(0)).
     */
    function registerParticipant(
        address account,
        uint8 role,
        bytes32 profileHash
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (account == address(0)) revert ZeroValue();
        bytes32 roleBytes = _roleFromId(role);
        if (hasRole(roleBytes, account)) revert DuplicateEntry();

        _grantRole(roleBytes, account);
        emit ParticipantRegistered(account, role, profileHash);
    }

    /**
     * @notice Revoke a participant's role.
     * @dev Only DEFAULT_ADMIN_ROLE can revoke roles. A HOLDER cannot be revoked while assigned to a live exam.
     * @param account Ethereum address of the participant.
     * @param role Numeric role identifier (1=AUTHORITY, 2=SETTER, 3=HOLDER, 4=CENTRE, 5=AUDITOR).
     */
    function revokeParticipant(
        address account,
        uint8 role
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (account == address(0)) revert ZeroValue();
        bytes32 roleBytes = _roleFromId(role);
        if (!hasRole(roleBytes, account)) revert NotAssigned();

        if (role == 3 && liveExamCount[account] > 0) {
            revert HolderInLiveExam();
        }

        _revokeRole(roleBytes, account);
        emit ParticipantRevoked(account, role);
    }

    /**
     * @notice Register or update the holder's P-256 public encryption key.
     * @dev Key must be 65 bytes uncompressed starting with prefix 0x04. Cannot be changed while in a live exam.
     * @param pubKey The 65-byte uncompressed P-256 public key.
     */
    function setEncryptionKey(bytes calldata pubKey) external onlyRole(HOLDER_ROLE) {
        if (pubKey.length != 65 || pubKey[0] != 0x04) revert InvalidKeyFormat();
        if (liveExamCount[msg.sender] > 0) revert HolderInLiveExam();

        encryptionKeys[msg.sender] = pubKey;
        emit EncryptionKeySet(msg.sender, pubKey);
    }

    // --- Exam Creation (SC-03) ---

    /**
     * @notice Create a new exam configuration in Draft state.
     * @dev Only accounts with AUTHORITY_ROLE can create exams.
     * @param cfg Complete ExamConfig containing schedules, panel arrays, quotas, and metadata hash.
     * @return examId The newly assigned exam ID.
     */
    function createExam(ExamConfig calldata cfg) external onlyRole(AUTHORITY_ROLE) returns (uint256 examId) {
        if (cfg.metaHash == bytes32(0)) revert ZeroValue();

        // Validate schedule
        uint64 currentTime = uint64(block.timestamp);
        if (
            currentTime + minLeadSeconds > cfg.releaseOpensAt ||
            cfg.releaseOpensAt >= cfg.examStartsAt ||
            cfg.examStartsAt >= cfg.examEndsAt
        ) {
            revert InvalidTimes();
        }

        // Validate quotas (1 to 8 sections, each quota > 0)
        uint256 sectionCount = cfg.quotas.length;
        if (sectionCount == 0 || sectionCount > 8) revert InvalidQuotas();
        for (uint256 i = 0; i < sectionCount; i++) {
            if (cfg.quotas[i] == 0) revert ZeroValue();
        }

        // Validate holders (3 to 20, threshold > n/2 and <= n, each has HOLDER_ROLE, key registered, unique)
        uint256 n = cfg.holders.length;
        if (n < 3 || n > 20) revert InvalidPanel();
        if (cfg.threshold <= n / 2 || cfg.threshold > n) revert InvalidThreshold();

        for (uint256 i = 0; i < n; i++) {
            address h = cfg.holders[i];
            if (h == address(0)) revert ZeroValue();
            if (!hasRole(HOLDER_ROLE, h)) revert NotAssigned();
            if (encryptionKeys[h].length != 65) revert InvalidKeyFormat();
            for (uint256 j = i + 1; j < n; j++) {
                if (h == cfg.holders[j]) revert DuplicateEntry();
            }
        }

        // Validate setters (at least 1, each has SETTER_ROLE, unique)
        uint256 setterCount = cfg.setters.length;
        if (setterCount == 0) revert InvalidPanel();
        for (uint256 i = 0; i < setterCount; i++) {
            address s = cfg.setters[i];
            if (s == address(0)) revert ZeroValue();
            if (!hasRole(SETTER_ROLE, s)) revert NotAssigned();
            for (uint256 j = i + 1; j < setterCount; j++) {
                if (s == cfg.setters[j]) revert DuplicateEntry();
            }
        }

        // Validate centres (at least 1, each has CENTRE_ROLE, unique)
        uint256 centreCount = cfg.centres.length;
        if (centreCount == 0) revert InvalidPanel();
        for (uint256 i = 0; i < centreCount; i++) {
            address c = cfg.centres[i];
            if (c == address(0)) revert ZeroValue();
            if (!hasRole(CENTRE_ROLE, c)) revert NotAssigned();
            for (uint256 j = i + 1; j < centreCount; j++) {
                if (c == cfg.centres[j]) revert DuplicateEntry();
            }
        }

        // Assign ID and store exam
        examId = _nextExamId++;
        Exam storage exam = _exams[examId];
        exam.id = examId;
        exam.state = State.Draft;
        exam.authority = msg.sender;
        exam.metaHash = cfg.metaHash;
        exam.releaseOpensAt = cfg.releaseOpensAt;
        exam.examStartsAt = cfg.examStartsAt;
        exam.examEndsAt = cfg.examEndsAt;
        exam.threshold = cfg.threshold;
        exam.holderCount = uint8(n);
        exam.quotas = cfg.quotas;

        // Store panel arrays and lookup mappings
        _examHolders[examId] = cfg.holders;
        _examSetters[examId] = cfg.setters;
        _examCentres[examId] = cfg.centres;

        for (uint256 i = 0; i < n; i++) {
            address h = cfg.holders[i];
            isHolder[examId][h] = true;
            liveExamCount[h] += 1;
        }
        for (uint256 i = 0; i < setterCount; i++) {
            isSetter[examId][cfg.setters[i]] = true;
        }
        for (uint256 i = 0; i < centreCount; i++) {
            isCentre[examId][cfg.centres[i]] = true;
        }

        emit ExamCreated(
            examId,
            msg.sender,
            cfg.metaHash,
            cfg.releaseOpensAt,
            cfg.examStartsAt,
            cfg.examEndsAt,
            cfg.threshold,
            uint8(n)
        );

        emit PanelAssigned(examId, cfg.holders, cfg.setters, cfg.centres);
    }

    // --- Collection Phase (SC-04) ---

    /**
     * @notice Open the question collection phase by transitioning state from Draft to Collecting and setting the exam public key.
     * @dev Only the authority of the exam can open collection. Exam public key must be 65 bytes uncompressed starting with 0x04.
     * @param examId ID of the exam.
     * @param examPublicKey 65-byte uncompressed P-256 public key used to encrypt question batches.
     */
    function openCollection(uint256 examId, bytes calldata examPublicKey) external onlyRole(AUTHORITY_ROLE) {
        if (examId == 0 || examId >= _nextExamId) revert ExamNotFound();
        Exam storage exam = _exams[examId];
        if (exam.authority != msg.sender) revert NotAssigned();
        if (exam.state != State.Draft) revert WrongState(State.Draft, exam.state);
        if (examPublicKey.length != 65 || examPublicKey[0] != 0x04) revert InvalidKeyFormat();

        exam.examPublicKey = examPublicKey;
        exam.state = State.Collecting;

        emit CollectionOpened(examId, examPublicKey);
    }

    /**
     * @notice Commit holder's share commitment and randomness commitment during Collecting state.
     * @dev Only assigned panel holders can commit. Each holder can commit only once per exam.
     * @param examId ID of the exam.
     * @param shareCommitment Keccak-256 commitment of abi.encode(examId, msg.sender, share).
     * @param randomnessCommitment Keccak-256 commitment of abi.encode(examId, msg.sender, reveal).
     */
    function commitRandomness(
        uint256 examId,
        bytes32 shareCommitment,
        bytes32 randomnessCommitment
    ) external onlyRole(HOLDER_ROLE) {
        if (examId == 0 || examId >= _nextExamId) revert ExamNotFound();
        if (!isHolder[examId][msg.sender]) revert NotAssigned();

        Exam storage exam = _exams[examId];
        if (exam.state != State.Collecting) revert WrongState(State.Collecting, exam.state);
        if (shareCommitment == bytes32(0) || randomnessCommitment == bytes32(0)) revert ZeroValue();
        if (_randomnessCommitments[examId][msg.sender] != bytes32(0)) revert AlreadySubmitted();

        _shareCommitments[examId][msg.sender] = shareCommitment;
        _randomnessCommitments[examId][msg.sender] = randomnessCommitment;

        emit RandomnessCommitted(examId, msg.sender);
    }

    /**
     * @notice Submit an encrypted batch of questions for a section during Collecting state.
     * @dev Only assigned paper setters can submit batches. startInSection is calculated as the running total of questions in that section prior to this batch.
     * @param examId ID of the exam.
     * @param sectionId 0-indexed section identifier.
     * @param ciphertextHash Keccak-256 hash of the encrypted batch payload.
     * @param questionCount Number of questions contained in this batch (> 0).
     * @return batchId The assigned batch ID (1-indexed per exam).
     */
    function submitBatch(
        uint256 examId,
        uint8 sectionId,
        bytes32 ciphertextHash,
        uint16 questionCount
    ) external onlyRole(SETTER_ROLE) returns (uint256 batchId) {
        if (examId == 0 || examId >= _nextExamId) revert ExamNotFound();
        if (!isSetter[examId][msg.sender]) revert NotAssigned();

        Exam storage exam = _exams[examId];
        if (exam.state != State.Collecting) revert WrongState(State.Collecting, exam.state);
        if (ciphertextHash == bytes32(0) || questionCount == 0) revert ZeroValue();
        if (sectionId >= exam.quotas.length) revert InvalidQuotas();
        if (_examCiphertextHashes[examId][ciphertextHash]) revert DuplicateEntry();

        uint16 startInSection = _sectionQuestionCount[examId][sectionId];
        _sectionQuestionCount[examId][sectionId] = startInSection + questionCount;
        _examCiphertextHashes[examId][ciphertextHash] = true;

        batchId = _examBatches[examId].length + 1;
        _examBatches[examId].push(
            Batch({
                batchId: batchId,
                setter: msg.sender,
                sectionId: sectionId,
                ciphertextHash: ciphertextHash,
                questionCount: questionCount,
                startInSection: startInSection,
                submittedAt: uint64(block.timestamp)
            })
        );

        emit BatchSubmitted(
            examId,
            batchId,
            msg.sender,
            sectionId,
            ciphertextHash,
            questionCount,
            startInSection
        );
    }

    // --- Exam Sealing (SC-05) ---

    /**
     * @notice Seal an exam after verifying section question quotas and holder commitments.
     * @dev bankHash = keccak256(abi.encodePacked(bytes32[] of all batch ciphertext hashes in submission order)). Transitions state to Sealed.
     * @param examId ID of the exam.
     */
    function sealExam(uint256 examId) external onlyRole(AUTHORITY_ROLE) {
        if (examId == 0 || examId >= _nextExamId) revert ExamNotFound();
        Exam storage exam = _exams[examId];
        if (exam.authority != msg.sender) revert NotAssigned();
        if (exam.state != State.Collecting) revert WrongState(State.Collecting, exam.state);

        // Check every section total against its quota
        uint256 sectionCount = exam.quotas.length;
        for (uint8 i = 0; i < sectionCount; i++) {
            uint16 have = _sectionQuestionCount[examId][i];
            uint16 need = exam.quotas[i];
            if (have != need) revert QuotaNotMet(i, have, need);
        }

        // Check that every assigned holder committed randomness
        address[] storage holders = _examHolders[examId];
        uint256 holderCount = holders.length;
        for (uint256 i = 0; i < holderCount; i++) {
            address h = holders[i];
            if (_randomnessCommitments[examId][h] == bytes32(0)) {
                revert MissingCommitment(h);
            }
        }

        // Compute bankHash over all batch ciphertext hashes in submission order
        Batch[] storage batches = _examBatches[examId];
        uint256 batchCount = batches.length;
        bytes32[] memory batchHashes = new bytes32[](batchCount);
        for (uint256 i = 0; i < batchCount; i++) {
            batchHashes[i] = batches[i].ciphertextHash;
        }
        bytes32 bankHash = keccak256(abi.encodePacked(batchHashes));

        exam.bankHash = bankHash;
        exam.state = State.Sealed;

        emit ExamSealed(examId, bankHash);
    }

    // --- Threshold Release (SC-06) ---

    /**
     * @notice Submit key share and randomness reveal during the release window.
     * @dev Verifies share and reveal commitments. When threshold t submissions are reached, computes canonical seed and transitions state to Released. Plaintext shares are never stored in contract storage. Decrements liveExamCount for all assigned holders.
     * @param examId ID of the exam.
     * @param share Key share bytes.
     * @param reveal Randomness reveal bytes32.
     */
    function submitShare(
        uint256 examId,
        bytes calldata share,
        bytes32 reveal
    ) external onlyRole(HOLDER_ROLE) {
        if (examId == 0 || examId >= _nextExamId) revert ExamNotFound();
        if (!isHolder[examId][msg.sender]) revert NotAssigned();

        Exam storage exam = _exams[examId];

        // Validate time window
        uint64 nowTime = uint64(block.timestamp);
        if (nowTime < exam.releaseOpensAt) revert TooEarly(nowTime, exam.releaseOpensAt);
        if (nowTime > exam.examEndsAt) revert TooLate(nowTime, exam.examEndsAt);

        // Validate state
        if (exam.state != State.Sealed && exam.state != State.Released) {
            revert WrongState(State.Sealed, exam.state);
        }

        if (share.length == 0 || reveal == bytes32(0)) revert ZeroValue();
        if (_hasSubmittedShare[examId][msg.sender]) revert AlreadySubmitted();

        // Verify share commitment
        bytes32 computedShareCommitment = keccak256(abi.encode(examId, msg.sender, share));
        if (computedShareCommitment != _shareCommitments[examId][msg.sender]) revert InvalidShare();

        // Verify randomness reveal
        bytes32 computedRandomnessCommitment = keccak256(abi.encode(examId, msg.sender, reveal));
        if (computedRandomnessCommitment != _randomnessCommitments[examId][msg.sender]) revert InvalidReveal();

        _hasSubmittedShare[examId][msg.sender] = true;
        _submittedReveals[examId][msg.sender] = reveal;
        _shareSubmissionCount[examId] += 1;

        emit ShareSubmitted(examId, msg.sender, share);

        // Transition to Released state at exactly the threshold t-th submission
        if (exam.state == State.Sealed && _shareSubmissionCount[examId] == exam.threshold) {
            address[] storage holders = _examHolders[examId];
            bytes32[] memory reveals = new bytes32[](exam.threshold);
            uint256 idx = 0;
            for (uint256 i = 0; i < holders.length; i++) {
                address h = holders[i];
                if (_hasSubmittedShare[examId][h]) {
                    reveals[idx] = _submittedReveals[examId][h];
                    idx++;
                    if (idx == exam.threshold) break;
                }
            }

            bytes32 seed = keccak256(abi.encode(examId, reveals));
            exam.seed = seed;
            exam.releasedAt = nowTime;
            exam.state = State.Released;

            // Decrement liveExamCount exactly once per holder when leaving live state
            for (uint256 i = 0; i < holders.length; i++) {
                liveExamCount[holders[i]] -= 1;
            }

            emit PaperReleased(examId, seed, nowTime);
        }
    }

    // --- Post-Release Phase (SC-07) ---

    /**
     * @notice Register an exam centre's copy variant hash after paper release.
     * @dev Only assigned panel centres can register during Released state before examEndsAt. One registration per centre per exam.
     * @param examId ID of the exam.
     * @param variantHash Keccak-256 hash of the centre's paper variant.
     */
    function registerCopy(uint256 examId, bytes32 variantHash) external onlyRole(CENTRE_ROLE) {
        if (examId == 0 || examId >= _nextExamId) revert ExamNotFound();
        if (!isCentre[examId][msg.sender]) revert NotAssigned();

        Exam storage exam = _exams[examId];
        if (exam.state != State.Released) revert WrongState(State.Released, exam.state);

        uint64 nowTime = uint64(block.timestamp);
        if (nowTime > exam.examEndsAt) revert TooLate(nowTime, exam.examEndsAt);

        if (variantHash == bytes32(0)) revert ZeroValue();
        if (_copyRegisteredAt[examId][msg.sender] != 0) revert AlreadySubmitted();
        if (_copyOwner[examId][variantHash] != address(0)) revert DuplicateEntry();

        _copyRegisteredAt[examId][msg.sender] = nowTime;
        _copyVariantHash[examId][msg.sender] = variantHash;
        _copyOwner[examId][variantHash] = msg.sender;

        emit CopyRegistered(examId, msg.sender, variantHash, nowTime);
    }

    /**
     * @notice Register a decoy hash and channel label (P1 feature).
     * @dev Only the exam authority can register decoys while exam is in Sealed or Released state.
     * @param examId ID of the exam.
     * @param decoyHash Keccak-256 hash of the decoy content.
     * @param channelLabel Label identifying the distribution channel.
     */
    function registerDecoy(uint256 examId, bytes32 decoyHash, bytes32 channelLabel) external onlyRole(AUTHORITY_ROLE) {
        if (examId == 0 || examId >= _nextExamId) revert ExamNotFound();
        Exam storage exam = _exams[examId];
        if (exam.authority != msg.sender) revert NotAssigned();
        if (exam.state != State.Sealed && exam.state != State.Released) revert WrongState(State.Sealed, exam.state);
        if (decoyHash == bytes32(0)) revert ZeroValue();

        emit DecoyRegistered(examId, decoyHash, channelLabel);
    }

    /**
     * @notice Publish candidate roster Merkle root (P1 feature).
     * @dev Only the exam authority can publish roster while exam is in Draft, Collecting, or Sealed state. Can only be set once.
     * @param examId ID of the exam.
     * @param merkleRoot Merkle root of the candidate roster.
     */
    function publishRoster(uint256 examId, bytes32 merkleRoot) external onlyRole(AUTHORITY_ROLE) {
        if (examId == 0 || examId >= _nextExamId) revert ExamNotFound();
        Exam storage exam = _exams[examId];
        if (exam.authority != msg.sender) revert NotAssigned();
        if (
            exam.state != State.Draft &&
            exam.state != State.Collecting &&
            exam.state != State.Sealed
        ) {
            revert WrongState(State.Draft, exam.state);
        }
        if (merkleRoot == bytes32(0)) revert ZeroValue();
        if (_rosterRoots[examId] != bytes32(0)) revert AlreadySubmitted();

        _rosterRoots[examId] = merkleRoot;

        emit RosterPublished(examId, merkleRoot);
    }

    /**
     * @notice Report a suspected leak with evidence linking to a centre's variant.
     * @dev Only accounts with AUDITOR_ROLE can report leaks. Exam must be in Released, Concluded, or Cancelled state.
     * @param examId ID of the exam.
     * @param evidenceHash Keccak-256 hash of the evidence payload.
     * @param suspectCentre Address of the suspected exam centre (or address(0) for unattributed leaks).
     * @param matchedVariantHash Hash of the matched variant from the suspect centre.
     */
    function reportLeak(
        uint256 examId,
        bytes32 evidenceHash,
        address suspectCentre,
        bytes32 matchedVariantHash
    ) external onlyRole(AUDITOR_ROLE) {
        if (examId == 0 || examId >= _nextExamId) revert ExamNotFound();
        Exam storage exam = _exams[examId];
        if (
            exam.state != State.Released &&
            exam.state != State.Concluded &&
            exam.state != State.Cancelled
        ) {
            revert WrongState(State.Released, exam.state);
        }
        if (evidenceHash == bytes32(0)) revert ZeroValue();

        if (suspectCentre != address(0)) {
            if (!isCentre[examId][suspectCentre]) revert NotAssigned();
            if (
                _copyRegisteredAt[examId][suspectCentre] == 0 ||
                _copyVariantHash[examId][suspectCentre] != matchedVariantHash ||
                matchedVariantHash == bytes32(0)
            ) {
                revert CopyMismatch();
            }
        } else {
            if (matchedVariantHash == bytes32(0)) revert ZeroValue();
        }

        emit LeakReported(examId, msg.sender, evidenceHash, suspectCentre, matchedVariantHash);
    }

    /**
     * @notice Conclude an exam after the exam window has ended.
     * @dev Only the exam authority can conclude. Must be after examEndsAt. State must be Released.
     * @param examId ID of the exam.
     */
    function concludeExam(uint256 examId) external onlyRole(AUTHORITY_ROLE) {
        if (examId == 0 || examId >= _nextExamId) revert ExamNotFound();
        Exam storage exam = _exams[examId];
        if (exam.authority != msg.sender) revert NotAssigned();
        if (exam.state != State.Released) revert WrongState(State.Released, exam.state);

        uint64 nowTime = uint64(block.timestamp);
        if (nowTime <= exam.examEndsAt) revert TooEarly(nowTime, exam.examEndsAt + 1);

        exam.state = State.Concluded;
        exam.concludedAt = nowTime;

        emit ExamConcluded(examId);
    }

    /**
     * @notice Cancel an exam.
     * @dev Only the exam authority can cancel. Allowed from any state except Cancelled.
     *      Decrements liveExamCount for holders if cancelled from a live state (Draft, Collecting, Sealed).
     * @param examId ID of the exam.
     * @param reasonHash Keccak-256 hash of the cancellation reason (must not be zero).
     */
    function cancelExam(uint256 examId, bytes32 reasonHash) external onlyRole(AUTHORITY_ROLE) {
        if (examId == 0 || examId >= _nextExamId) revert ExamNotFound();
        Exam storage exam = _exams[examId];
        if (exam.authority != msg.sender) revert NotAssigned();
        if (exam.state == State.Cancelled) revert WrongState(State.Draft, exam.state);
        if (reasonHash == bytes32(0)) revert ZeroValue();

        // If exam was in a live state, decrement liveExamCount for all holders
        if (
            exam.state == State.Draft ||
            exam.state == State.Collecting ||
            exam.state == State.Sealed
        ) {
            address[] storage holders = _examHolders[examId];
            uint256 holderCount = holders.length;
            for (uint256 i = 0; i < holderCount; i++) {
                liveExamCount[holders[i]] -= 1;
            }
        }

        exam.state = State.Cancelled;
        exam.cancellationReasonHash = reasonHash;

        emit ExamCancelled(examId, reasonHash);
    }

    // --- SC-08 TODO ---
    // cross-language test vectors for paper selection and seed derivation, pending Member 2's frozen vectors.

    // --- View Functions ---

    /**
     * @notice Get the next exam ID to be assigned.
     * @return The ID that will be used for the next created exam.
     */
    function nextExamId() external view returns (uint256) {
        return _nextExamId;
    }

    /**
     * @notice Retrieve the exam record for an exam ID.
     * @param examId The ID of the exam.
     * @return The Exam struct.
     */
    function getExam(uint256 examId) external view returns (Exam memory) {
        if (examId == 0 || examId >= _nextExamId) revert ExamNotFound();
        return _exams[examId];
    }

    /**
     * @notice Retrieve panel participant addresses for an exam.
     * @param examId The ID of the exam.
     * @return holders Array of assigned key holder addresses.
     * @return setters Array of assigned paper setter addresses.
     * @return centres Array of assigned exam centre addresses.
     */
    function getPanel(
        uint256 examId
    ) external view returns (address[] memory holders, address[] memory setters, address[] memory centres) {
        if (examId == 0 || examId >= _nextExamId) revert ExamNotFound();
        return (_examHolders[examId], _examSetters[examId], _examCentres[examId]);
    }

    /**
     * @notice Retrieve all submitted batches for an exam.
     * @param examId The ID of the exam.
     * @return Array of Batch structs.
     */
    function getBatches(uint256 examId) external view returns (Batch[] memory) {
        if (examId == 0 || examId >= _nextExamId) revert ExamNotFound();
        return _examBatches[examId];
    }

    /**
     * @notice Retrieve a specific batch by 1-indexed batch ID.
     * @param examId The ID of the exam.
     * @param batchId 1-indexed batch ID.
     * @return The Batch struct.
     */
    function getBatch(uint256 examId, uint256 batchId) external view returns (Batch memory) {
        if (examId == 0 || examId >= _nextExamId) revert ExamNotFound();
        if (batchId == 0 || batchId > _examBatches[examId].length) revert BatchNotFound();
        return _examBatches[examId][batchId - 1];
    }

    /**
     * @notice Retrieve total question count submitted for a section in an exam.
     * @param examId The ID of the exam.
     * @param sectionId 0-indexed section identifier.
     * @return Running total of questions submitted for that section.
     */
    function getSectionQuestionCount(uint256 examId, uint8 sectionId) external view returns (uint16) {
        if (examId == 0 || examId >= _nextExamId) revert ExamNotFound();
        return _sectionQuestionCount[examId][sectionId];
    }

    /**
     * @notice Retrieve holder's share commitment for an exam.
     * @param examId The ID of the exam.
     * @param holder Address of the holder.
     * @return The share commitment bytes32.
     */
    function getShareCommitment(uint256 examId, address holder) external view returns (bytes32) {
        if (examId == 0 || examId >= _nextExamId) revert ExamNotFound();
        return _shareCommitments[examId][holder];
    }

    /**
     * @notice Retrieve holder's randomness commitment for an exam.
     * @param examId The ID of the exam.
     * @param holder Address of the holder.
     * @return The randomness commitment bytes32.
     */
    function getRandomnessCommitment(uint256 examId, address holder) external view returns (bytes32) {
        if (examId == 0 || examId >= _nextExamId) revert ExamNotFound();
        return _randomnessCommitments[examId][holder];
    }

    /**
     * @notice Check whether a holder has submitted their share for an exam.
     * @param examId The ID of the exam.
     * @param holder Address of the holder.
     * @return True if submitted, false otherwise.
     */
    function hasSubmittedShare(uint256 examId, address holder) external view returns (bool) {
        if (examId == 0 || examId >= _nextExamId) revert ExamNotFound();
        return _hasSubmittedShare[examId][holder];
    }

    /**
     * @notice Retrieve total number of shares submitted for an exam.
     * @param examId The ID of the exam.
     * @return Count of submitted shares.
     */
    function getShareSubmissionCount(uint256 examId) external view returns (uint256) {
        if (examId == 0 || examId >= _nextExamId) revert ExamNotFound();
        return _shareSubmissionCount[examId];
    }

    /**
     * @notice Retrieve a centre's registered copy data for an exam.
     * @param examId The ID of the exam.
     * @param centre Address of the exam centre.
     * @return variantHash The registered variant hash.
     * @return registeredAt Timestamp when the copy was registered.
     */
    function getCopy(uint256 examId, address centre) external view returns (bytes32 variantHash, uint64 registeredAt) {
        if (examId == 0 || examId >= _nextExamId) revert ExamNotFound();
        return (_copyVariantHash[examId][centre], _copyRegisteredAt[examId][centre]);
    }

    /**
     * @notice Retrieve the centre address that registered a specific copy variant hash.
     * @param examId The ID of the exam.
     * @param variantHash Keccak-256 hash of the variant.
     * @return Address of the centre that registered the variant (or address(0) if unregistered).
     */
    function getCopyOwner(uint256 examId, bytes32 variantHash) external view returns (address) {
        if (examId == 0 || examId >= _nextExamId) revert ExamNotFound();
        return _copyOwner[examId][variantHash];
    }

    /**
     * @notice Retrieve candidate roster Merkle root for an exam.
     * @param examId The ID of the exam.
     * @return Merkle root of the roster (or bytes32(0) if not published).
     */
    function getRosterRoot(uint256 examId) external view returns (bytes32) {
        if (examId == 0 || examId >= _nextExamId) revert ExamNotFound();
        return _rosterRoots[examId];
    }

    /**
     * @notice Retrieve the current question totals for all sections in an exam.
     * @param examId The ID of the exam.
     * @return totals Array of question counts per section.
     */
    function getSectionTotals(uint256 examId) external view returns (uint16[] memory totals) {
        if (examId == 0 || examId >= _nextExamId) revert ExamNotFound();
        Exam storage exam = _exams[examId];
        uint256 sectionCount = exam.quotas.length;
        totals = new uint16[](sectionCount);
        for (uint8 i = 0; i < sectionCount; i++) {
            totals[i] = _sectionQuestionCount[examId][i];
        }
    }

    /**
     * @notice Check whether a holder has committed randomness for an exam.
     * @param examId The ID of the exam.
     * @param holder Address of the holder.
     * @return True if committed, false otherwise.
     */
    function hasCommittedRandomness(uint256 examId, address holder) external view returns (bool) {
        if (examId == 0 || examId >= _nextExamId) revert ExamNotFound();
        return _randomnessCommitments[examId][holder] != bytes32(0);
    }

    // --- Internal Helpers ---

    /**
     * @dev Map uint8 role ID to keccak256 role identifier bytes32.
     * @param role Numeric role ID.
     * @return Role hash.
     */
    function _roleFromId(uint8 role) internal pure returns (bytes32) {
        if (role == 1) return AUTHORITY_ROLE;
        if (role == 2) return SETTER_ROLE;
        if (role == 3) return HOLDER_ROLE;
        if (role == 4) return CENTRE_ROLE;
        if (role == 5) return AUDITOR_ROLE;
        if (role == 0) revert CannotGrantAdmin();
        revert InvalidRole(role);
    }
}
