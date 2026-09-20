import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { ExamVault } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("ExamVault (SC-01 to SC-06)", () => {
  let examVault: ExamVault;
  let admin: SignerWithAddress;
  let authority: SignerWithAddress;
  let authority2: SignerWithAddress;
  let setter1: SignerWithAddress;
  let setter2: SignerWithAddress;
  let setter3: SignerWithAddress;
  let holder1: SignerWithAddress;
  let holder2: SignerWithAddress;
  let holder3: SignerWithAddress;
  let holder4: SignerWithAddress;
  let holder5: SignerWithAddress;
  let centre1: SignerWithAddress;
  let centre2: SignerWithAddress;
  let auditor: SignerWithAddress;
  let stranger: SignerWithAddress;

  const minLeadSeconds = 60n;
  const validP256PubKey = ethers.hexlify(
    ethers.concat([
      new Uint8Array([0x04]),
      ethers.randomBytes(32),
      ethers.randomBytes(32),
    ])
  );

  // Role IDs
  const ROLE_AUTHORITY = 1;
  const ROLE_SETTER = 2;
  const ROLE_HOLDER = 3;
  const ROLE_CENTRE = 4;
  const ROLE_AUDITOR = 5;

  // Helper to compute commitments
  function computeShareCommitment(examId: bigint | number, holderAddress: string, share: Uint8Array | string): string {
    const shareBytes = typeof share === "string" ? ethers.getBytes(share) : share;
    return ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "address", "bytes"],
        [examId, holderAddress, shareBytes]
      )
    );
  }

  function computeRandomnessCommitment(examId: bigint | number, holderAddress: string, reveal: string): string {
    return ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "address", "bytes32"],
        [examId, holderAddress, reveal]
      )
    );
  }

  function computeReleaseSeed(examId: bigint | number, revealsInPanelOrder: string[]): string {
    return ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "bytes32[]"],
        [examId, revealsInPanelOrder]
      )
    );
  }

  function computeBankHash(batchHashesInSubmissionOrder: string[]): string {
    return ethers.keccak256(ethers.solidityPacked(["bytes32[]"], [batchHashesInSubmissionOrder]));
  }

  beforeEach(async () => {
    [
      admin,
      authority,
      authority2,
      setter1,
      setter2,
      setter3,
      holder1,
      holder2,
      holder3,
      holder4,
      holder5,
      centre1,
      centre2,
      auditor,
      stranger,
    ] = await ethers.getSigners();

    const ExamVaultFactory = await ethers.getContractFactory("ExamVault");
    examVault = await ExamVaultFactory.deploy(minLeadSeconds);
  });

  describe("Deployment & Configuration (SC-01)", () => {
    it("should set deployer as DEFAULT_ADMIN_ROLE", async () => {
      const defaultAdminRole = await examVault.DEFAULT_ADMIN_ROLE();
      expect(await examVault.hasRole(defaultAdminRole, admin.address)).to.be.true;
      expect(await examVault.hasRole(defaultAdminRole, stranger.address)).to.be.false;
    });

    it("should store immutable minLeadSeconds", async () => {
      expect(await examVault.minLeadSeconds()).to.equal(minLeadSeconds);
    });

    it("should initialize nextExamId to 1", async () => {
      expect(await examVault.nextExamId()).to.equal(1n);
    });
  });

  describe("Participant Registry (SC-02)", () => {
    it("should allow admin to register participants across all 5 roles", async () => {
      const profileHash = ethers.keccak256(ethers.toUtf8Bytes("profile1"));

      await expect(
        examVault.connect(admin).registerParticipant(authority.address, ROLE_AUTHORITY, profileHash)
      )
        .to.emit(examVault, "ParticipantRegistered")
        .withArgs(authority.address, ROLE_AUTHORITY, profileHash);

      await expect(
        examVault.connect(admin).registerParticipant(setter1.address, ROLE_SETTER, ethers.ZeroHash)
      )
        .to.emit(examVault, "ParticipantRegistered")
        .withArgs(setter1.address, ROLE_SETTER, ethers.ZeroHash);

      await expect(
        examVault.connect(admin).registerParticipant(holder1.address, ROLE_HOLDER, ethers.ZeroHash)
      )
        .to.emit(examVault, "ParticipantRegistered")
        .withArgs(holder1.address, ROLE_HOLDER, ethers.ZeroHash);

      await expect(
        examVault.connect(admin).registerParticipant(centre1.address, ROLE_CENTRE, ethers.ZeroHash)
      )
        .to.emit(examVault, "ParticipantRegistered")
        .withArgs(centre1.address, ROLE_CENTRE, ethers.ZeroHash);

      await expect(
        examVault.connect(admin).registerParticipant(auditor.address, ROLE_AUDITOR, ethers.ZeroHash)
      )
        .to.emit(examVault, "ParticipantRegistered")
        .withArgs(auditor.address, ROLE_AUDITOR, ethers.ZeroHash);

      expect(await examVault.hasRole(await examVault.AUTHORITY_ROLE(), authority.address)).to.be.true;
      expect(await examVault.hasRole(await examVault.SETTER_ROLE(), setter1.address)).to.be.true;
      expect(await examVault.hasRole(await examVault.HOLDER_ROLE(), holder1.address)).to.be.true;
      expect(await examVault.hasRole(await examVault.CENTRE_ROLE(), centre1.address)).to.be.true;
      expect(await examVault.hasRole(await examVault.AUDITOR_ROLE(), auditor.address)).to.be.true;
    });

    it("should revert if non-admin attempts to register a participant", async () => {
      await expect(
        examVault.connect(stranger).registerParticipant(stranger.address, ROLE_AUTHORITY, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(examVault, "AccessControlUnauthorizedAccount");
    });

    it("should revert if registering zero address", async () => {
      await expect(
        examVault.connect(admin).registerParticipant(ethers.ZeroAddress, ROLE_AUTHORITY, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(examVault, "ZeroValue");
    });

    it("should revert if registering role 0 (CannotGrantAdmin)", async () => {
      await expect(
        examVault.connect(admin).registerParticipant(authority.address, 0, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(examVault, "CannotGrantAdmin");
    });

    it("should revert if registering invalid role (> 5)", async () => {
      await expect(
        examVault.connect(admin).registerParticipant(authority.address, 6, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(examVault, "InvalidRole").withArgs(6);
    });

    it("should revert DuplicateEntry if participant already holds the role", async () => {
      await examVault.connect(admin).registerParticipant(authority.address, ROLE_AUTHORITY, ethers.ZeroHash);
      await expect(
        examVault.connect(admin).registerParticipant(authority.address, ROLE_AUTHORITY, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(examVault, "DuplicateEntry");
    });

    it("should allow admin to revoke a participant role", async () => {
      await examVault.connect(admin).registerParticipant(setter1.address, ROLE_SETTER, ethers.ZeroHash);
      expect(await examVault.hasRole(await examVault.SETTER_ROLE(), setter1.address)).to.be.true;

      await expect(examVault.connect(admin).revokeParticipant(setter1.address, ROLE_SETTER))
        .to.emit(examVault, "ParticipantRevoked")
        .withArgs(setter1.address, ROLE_SETTER);

      expect(await examVault.hasRole(await examVault.SETTER_ROLE(), setter1.address)).to.be.false;
    });

    it("should revert if revoking role that is not assigned", async () => {
      await expect(
        examVault.connect(admin).revokeParticipant(stranger.address, ROLE_SETTER)
      ).to.be.revertedWithCustomError(examVault, "NotAssigned");
    });

    it("should revert if revoking zero address", async () => {
      await expect(
        examVault.connect(admin).revokeParticipant(ethers.ZeroAddress, ROLE_SETTER)
      ).to.be.revertedWithCustomError(examVault, "ZeroValue");
    });

    it("should revert if revoking role 0 or invalid role", async () => {
      await expect(
        examVault.connect(admin).revokeParticipant(admin.address, 0)
      ).to.be.revertedWithCustomError(examVault, "CannotGrantAdmin");

      await expect(
        examVault.connect(admin).revokeParticipant(admin.address, 7)
      ).to.be.revertedWithCustomError(examVault, "InvalidRole").withArgs(7);
    });

    it("should revert if non-admin attempts to revoke a participant", async () => {
      await examVault.connect(admin).registerParticipant(setter1.address, ROLE_SETTER, ethers.ZeroHash);
      await expect(
        examVault.connect(stranger).revokeParticipant(setter1.address, ROLE_SETTER)
      ).to.be.revertedWithCustomError(examVault, "AccessControlUnauthorizedAccount");
    });
  });

  describe("Holder Encryption Keys (SC-02)", () => {
    beforeEach(async () => {
      await examVault.connect(admin).registerParticipant(holder1.address, ROLE_HOLDER, ethers.ZeroHash);
    });

    it("should allow registered HOLDER to set a valid 65-byte uncompressed P-256 public key", async () => {
      await expect(examVault.connect(holder1).setEncryptionKey(validP256PubKey))
        .to.emit(examVault, "EncryptionKeySet")
        .withArgs(holder1.address, validP256PubKey);

      expect(await examVault.encryptionKeys(holder1.address)).to.equal(validP256PubKey);
    });

    it("should allow updating key when holder has no live exam assignments", async () => {
      await examVault.connect(holder1).setEncryptionKey(validP256PubKey);
      const newKey = ethers.hexlify(
        ethers.concat([new Uint8Array([0x04]), ethers.randomBytes(32), ethers.randomBytes(32)])
      );
      await expect(examVault.connect(holder1).setEncryptionKey(newKey))
        .to.emit(examVault, "EncryptionKeySet")
        .withArgs(holder1.address, newKey);

      expect(await examVault.encryptionKeys(holder1.address)).to.equal(newKey);
    });

    it("should revert if non-HOLDER attempts to set encryption key", async () => {
      await expect(
        examVault.connect(stranger).setEncryptionKey(validP256PubKey)
      ).to.be.revertedWithCustomError(examVault, "AccessControlUnauthorizedAccount");
    });

    it("should revert InvalidKeyFormat if key length is not 65 bytes", async () => {
      const shortKey = ethers.randomBytes(32);
      await expect(
        examVault.connect(holder1).setEncryptionKey(shortKey)
      ).to.be.revertedWithCustomError(examVault, "InvalidKeyFormat");

      const key64 = ethers.concat([new Uint8Array([0x04]), ethers.randomBytes(63)]);
      await expect(
        examVault.connect(holder1).setEncryptionKey(key64)
      ).to.be.revertedWithCustomError(examVault, "InvalidKeyFormat");

      const key66 = ethers.concat([new Uint8Array([0x04]), ethers.randomBytes(65)]);
      await expect(
        examVault.connect(holder1).setEncryptionKey(key66)
      ).to.be.revertedWithCustomError(examVault, "InvalidKeyFormat");
    });

    it("should revert InvalidKeyFormat if first byte is not 0x04", async () => {
      const invalidPrefixKey = ethers.concat([
        new Uint8Array([0x02]),
        ethers.randomBytes(32),
        ethers.randomBytes(32),
      ]);
      await expect(
        examVault.connect(holder1).setEncryptionKey(invalidPrefixKey)
      ).to.be.revertedWithCustomError(examVault, "InvalidKeyFormat");
    });
  });

  describe("Exam Creation (SC-03)", () => {
    let baseConfig: ExamVault.ExamConfigStruct;

    beforeEach(async () => {
      // Register roles
      await examVault.connect(admin).registerParticipant(authority.address, ROLE_AUTHORITY, ethers.ZeroHash);
      await examVault.connect(admin).registerParticipant(setter1.address, ROLE_SETTER, ethers.ZeroHash);
      await examVault.connect(admin).registerParticipant(setter2.address, ROLE_SETTER, ethers.ZeroHash);

      await examVault.connect(admin).registerParticipant(holder1.address, ROLE_HOLDER, ethers.ZeroHash);
      await examVault.connect(admin).registerParticipant(holder2.address, ROLE_HOLDER, ethers.ZeroHash);
      await examVault.connect(admin).registerParticipant(holder3.address, ROLE_HOLDER, ethers.ZeroHash);
      await examVault.connect(admin).registerParticipant(holder4.address, ROLE_HOLDER, ethers.ZeroHash);
      await examVault.connect(admin).registerParticipant(holder5.address, ROLE_HOLDER, ethers.ZeroHash);

      await examVault.connect(admin).registerParticipant(centre1.address, ROLE_CENTRE, ethers.ZeroHash);
      await examVault.connect(admin).registerParticipant(centre2.address, ROLE_CENTRE, ethers.ZeroHash);

      // Set encryption keys for holders
      await examVault.connect(holder1).setEncryptionKey(validP256PubKey);
      await examVault.connect(holder2).setEncryptionKey(validP256PubKey);
      await examVault.connect(holder3).setEncryptionKey(validP256PubKey);
      await examVault.connect(holder4).setEncryptionKey(validP256PubKey);
      await examVault.connect(holder5).setEncryptionKey(validP256PubKey);

      const latestTime = BigInt(await time.latest());
      const releaseOpensAt = latestTime + minLeadSeconds + 100n;
      const examStartsAt = releaseOpensAt + 3600n;
      const examEndsAt = examStartsAt + 7200n;

      baseConfig = {
        metaHash: ethers.keccak256(ethers.toUtf8Bytes("exam-metadata-canonical")),
        releaseOpensAt,
        examStartsAt,
        examEndsAt,
        threshold: 2,
        holders: [holder1.address, holder2.address, holder3.address],
        setters: [setter1.address, setter2.address],
        centres: [centre1.address, centre2.address],
        quotas: [45, 45, 45, 45],
      };
    });

    it("should successfully create an exam in Draft state with valid parameters", async () => {
      await expect(examVault.connect(authority).createExam(baseConfig))
        .to.emit(examVault, "ExamCreated")
        .withArgs(
          1n,
          authority.address,
          baseConfig.metaHash,
          baseConfig.releaseOpensAt,
          baseConfig.examStartsAt,
          baseConfig.examEndsAt,
          baseConfig.threshold,
          3
        )
        .and.to.emit(examVault, "PanelAssigned")
        .withArgs(1n, baseConfig.holders, baseConfig.setters, baseConfig.centres);

      expect(await examVault.nextExamId()).to.equal(2n);

      const exam = await examVault.getExam(1n);
      expect(exam.id).to.equal(1n);
      expect(exam.state).to.equal(0); // State.Draft
      expect(exam.authority).to.equal(authority.address);
      expect(exam.metaHash).to.equal(baseConfig.metaHash);
      expect(exam.releaseOpensAt).to.equal(baseConfig.releaseOpensAt);
      expect(exam.examStartsAt).to.equal(baseConfig.examStartsAt);
      expect(exam.examEndsAt).to.equal(baseConfig.examEndsAt);
      expect(exam.threshold).to.equal(baseConfig.threshold);
      expect(exam.holderCount).to.equal(3);
      expect(exam.bankHash).to.equal(ethers.ZeroHash);
      expect(exam.seed).to.equal(ethers.ZeroHash);
      expect(exam.quotas.map(Number)).to.deep.equal([45, 45, 45, 45]);

      const [panelHolders, panelSetters, panelCentres] = await examVault.getPanel(1n);
      expect(panelHolders).to.deep.equal([holder1.address, holder2.address, holder3.address]);
      expect(panelSetters).to.deep.equal([setter1.address, setter2.address]);
      expect(panelCentres).to.deep.equal([centre1.address, centre2.address]);

      // Check panel lookups
      expect(await examVault.isHolder(1n, holder1.address)).to.be.true;
      expect(await examVault.isHolder(1n, holder4.address)).to.be.false;
      expect(await examVault.isSetter(1n, setter1.address)).to.be.true;
      expect(await examVault.isSetter(1n, stranger.address)).to.be.false;
      expect(await examVault.isCentre(1n, centre1.address)).to.be.true;
      expect(await examVault.isCentre(1n, stranger.address)).to.be.false;

      // Check liveExamCount increments
      expect(await examVault.liveExamCount(holder1.address)).to.equal(1n);
      expect(await examVault.liveExamCount(holder2.address)).to.equal(1n);
      expect(await examVault.liveExamCount(holder3.address)).to.equal(1n);
      expect(await examVault.liveExamCount(holder4.address)).to.equal(0n);
    });

    it("should prevent holder from revoking or changing key while in a live exam", async () => {
      await examVault.connect(authority).createExam(baseConfig);

      // Try to change encryption key
      const newKey = ethers.hexlify(
        ethers.concat([new Uint8Array([0x04]), ethers.randomBytes(32), ethers.randomBytes(32)])
      );
      await expect(
        examVault.connect(holder1).setEncryptionKey(newKey)
      ).to.be.revertedWithCustomError(examVault, "HolderInLiveExam");

      // Try to revoke holder
      await expect(
        examVault.connect(admin).revokeParticipant(holder1.address, ROLE_HOLDER)
      ).to.be.revertedWithCustomError(examVault, "HolderInLiveExam");
    });

    it("should revert if caller does not have AUTHORITY_ROLE", async () => {
      await expect(
        examVault.connect(stranger).createExam(baseConfig)
      ).to.be.revertedWithCustomError(examVault, "AccessControlUnauthorizedAccount");
    });

    it("should revert ZeroValue if metaHash is zero", async () => {
      const cfg = { ...baseConfig, metaHash: ethers.ZeroHash };
      await expect(examVault.connect(authority).createExam(cfg)).to.be.revertedWithCustomError(
        examVault,
        "ZeroValue"
      );
    });

    describe("Time validations", () => {
      it("should revert InvalidTimes if releaseOpensAt < block.timestamp + minLeadSeconds", async () => {
        const latestTime = BigInt(await time.latest());
        const cfg = {
          ...baseConfig,
          releaseOpensAt: latestTime + minLeadSeconds - 1n,
          examStartsAt: latestTime + minLeadSeconds + 100n,
          examEndsAt: latestTime + minLeadSeconds + 200n,
        };
        await expect(examVault.connect(authority).createExam(cfg)).to.be.revertedWithCustomError(
          examVault,
          "InvalidTimes"
        );
      });

      it("should accept releaseOpensAt == block.timestamp + minLeadSeconds (exact boundary)", async () => {
        const latestTime = BigInt(await time.latest());
        const nextBlockTime = latestTime + 10n;
        await time.setNextBlockTimestamp(nextBlockTime);

        const cfg = {
          ...baseConfig,
          releaseOpensAt: nextBlockTime + minLeadSeconds,
          examStartsAt: nextBlockTime + minLeadSeconds + 3600n,
          examEndsAt: nextBlockTime + minLeadSeconds + 7200n,
        };
        await expect(examVault.connect(authority).createExam(cfg)).to.emit(examVault, "ExamCreated");
      });

      it("should revert InvalidTimes if examStartsAt <= releaseOpensAt", async () => {
        const cfgEqual = {
          ...baseConfig,
          examStartsAt: baseConfig.releaseOpensAt,
        };
        await expect(examVault.connect(authority).createExam(cfgEqual)).to.be.revertedWithCustomError(
          examVault,
          "InvalidTimes"
        );

        const cfgLess = {
          ...baseConfig,
          examStartsAt: (baseConfig.releaseOpensAt as bigint) - 1n,
        };
        await expect(examVault.connect(authority).createExam(cfgLess)).to.be.revertedWithCustomError(
          examVault,
          "InvalidTimes"
        );
      });

      it("should revert InvalidTimes if examEndsAt <= examStartsAt", async () => {
        const cfgEqual = {
          ...baseConfig,
          examEndsAt: baseConfig.examStartsAt,
        };
        await expect(examVault.connect(authority).createExam(cfgEqual)).to.be.revertedWithCustomError(
          examVault,
          "InvalidTimes"
        );

        const cfgLess = {
          ...baseConfig,
          examEndsAt: (baseConfig.examStartsAt as bigint) - 1n,
        };
        await expect(examVault.connect(authority).createExam(cfgLess)).to.be.revertedWithCustomError(
          examVault,
          "InvalidTimes"
        );
      });
    });

    describe("Quotas validations", () => {
      it("should revert InvalidQuotas if quotas is empty", async () => {
        const cfg = { ...baseConfig, quotas: [] };
        await expect(examVault.connect(authority).createExam(cfg)).to.be.revertedWithCustomError(
          examVault,
          "InvalidQuotas"
        );
      });

      it("should revert InvalidQuotas if quotas length > 8", async () => {
        const cfg = { ...baseConfig, quotas: [10, 10, 10, 10, 10, 10, 10, 10, 10] };
        await expect(examVault.connect(authority).createExam(cfg)).to.be.revertedWithCustomError(
          examVault,
          "InvalidQuotas"
        );
      });

      it("should accept quotas length between 1 and 8", async () => {
        const cfg1 = { ...baseConfig, quotas: [50] };
        await expect(examVault.connect(authority).createExam(cfg1)).to.emit(examVault, "ExamCreated");

        const cfg8 = { ...baseConfig, quotas: [10, 20, 30, 40, 50, 60, 70, 80] };
        await expect(examVault.connect(authority).createExam(cfg8)).to.emit(examVault, "ExamCreated");
      });

      it("should revert ZeroValue if any quota is 0", async () => {
        const cfg = { ...baseConfig, quotas: [45, 0, 45] };
        await expect(examVault.connect(authority).createExam(cfg)).to.be.revertedWithCustomError(
          examVault,
          "ZeroValue"
        );
      });
    });

    describe("Threshold & Panel validations", () => {
      it("should revert InvalidPanel if holders count < 3", async () => {
        const cfg = {
          ...baseConfig,
          holders: [holder1.address, holder2.address],
          threshold: 2,
        };
        await expect(examVault.connect(authority).createExam(cfg)).to.be.revertedWithCustomError(
          examVault,
          "InvalidPanel"
        );
      });

      it("should revert InvalidPanel if holders count > 20", async () => {
        const wallets = Array.from({ length: 21 }, () => ethers.Wallet.createRandom().address);
        const cfg = {
          ...baseConfig,
          holders: wallets,
          threshold: 11,
        };
        await expect(examVault.connect(authority).createExam(cfg)).to.be.revertedWithCustomError(
          examVault,
          "InvalidPanel"
        );
      });

      it("threshold boundary cases: n=3", async () => {
        const cfgT1 = { ...baseConfig, holders: [holder1.address, holder2.address, holder3.address], threshold: 1 };
        await expect(examVault.connect(authority).createExam(cfgT1)).to.be.revertedWithCustomError(
          examVault,
          "InvalidThreshold"
        );

        const cfgT2 = { ...baseConfig, holders: [holder1.address, holder2.address, holder3.address], threshold: 2 };
        await expect(examVault.connect(authority).createExam(cfgT2)).to.emit(examVault, "ExamCreated");

        const cfgT3 = { ...baseConfig, holders: [holder1.address, holder2.address, holder3.address], threshold: 3 };
        await expect(examVault.connect(authority).createExam(cfgT3)).to.emit(examVault, "ExamCreated");

        const cfgT4 = { ...baseConfig, holders: [holder1.address, holder2.address, holder3.address], threshold: 4 };
        await expect(examVault.connect(authority).createExam(cfgT4)).to.be.revertedWithCustomError(
          examVault,
          "InvalidThreshold"
        );
      });

      it("threshold boundary cases: n=4", async () => {
        const cfgT2 = {
          ...baseConfig,
          holders: [holder1.address, holder2.address, holder3.address, holder4.address],
          threshold: 2,
        };
        await expect(examVault.connect(authority).createExam(cfgT2)).to.be.revertedWithCustomError(
          examVault,
          "InvalidThreshold"
        );

        const cfgT3 = {
          ...baseConfig,
          holders: [holder1.address, holder2.address, holder3.address, holder4.address],
          threshold: 3,
        };
        await expect(examVault.connect(authority).createExam(cfgT3)).to.emit(examVault, "ExamCreated");

        const cfgT4 = {
          ...baseConfig,
          holders: [holder1.address, holder2.address, holder3.address, holder4.address],
          threshold: 4,
        };
        await expect(examVault.connect(authority).createExam(cfgT4)).to.emit(examVault, "ExamCreated");
      });

      it("threshold boundary cases: n=5", async () => {
        const cfgT2 = {
          ...baseConfig,
          holders: [holder1.address, holder2.address, holder3.address, holder4.address, holder5.address],
          threshold: 2,
        };
        await expect(examVault.connect(authority).createExam(cfgT2)).to.be.revertedWithCustomError(
          examVault,
          "InvalidThreshold"
        );

        const cfgT3 = {
          ...baseConfig,
          holders: [holder1.address, holder2.address, holder3.address, holder4.address, holder5.address],
          threshold: 3,
        };
        await expect(examVault.connect(authority).createExam(cfgT3)).to.emit(examVault, "ExamCreated");
      });

      it("should revert ZeroValue if holder address is zero", async () => {
        const cfg = {
          ...baseConfig,
          holders: [holder1.address, ethers.ZeroAddress, holder3.address],
        };
        await expect(examVault.connect(authority).createExam(cfg)).to.be.revertedWithCustomError(
          examVault,
          "ZeroValue"
        );
      });

      it("should revert NotAssigned if holder lacks HOLDER_ROLE", async () => {
        const cfg = {
          ...baseConfig,
          holders: [holder1.address, stranger.address, holder3.address],
        };
        await expect(examVault.connect(authority).createExam(cfg)).to.be.revertedWithCustomError(
          examVault,
          "NotAssigned"
        );
      });

      it("should revert InvalidKeyFormat if holder does not have encryption key set", async () => {
        const freshHolder = stranger;
        await examVault.connect(admin).registerParticipant(freshHolder.address, ROLE_HOLDER, ethers.ZeroHash);

        const cfg = {
          ...baseConfig,
          holders: [holder1.address, freshHolder.address, holder3.address],
        };
        await expect(examVault.connect(authority).createExam(cfg)).to.be.revertedWithCustomError(
          examVault,
          "InvalidKeyFormat"
        );
      });

      it("should revert DuplicateEntry if duplicate holder in panel", async () => {
        const cfg = {
          ...baseConfig,
          holders: [holder1.address, holder2.address, holder1.address],
        };
        await expect(examVault.connect(authority).createExam(cfg)).to.be.revertedWithCustomError(
          examVault,
          "DuplicateEntry"
        );
      });

      it("should revert InvalidPanel if setters array is empty", async () => {
        const cfg = { ...baseConfig, setters: [] };
        await expect(examVault.connect(authority).createExam(cfg)).to.be.revertedWithCustomError(
          examVault,
          "InvalidPanel"
        );
      });

      it("should revert ZeroValue if setter address is zero", async () => {
        const cfg = { ...baseConfig, setters: [ethers.ZeroAddress] };
        await expect(examVault.connect(authority).createExam(cfg)).to.be.revertedWithCustomError(
          examVault,
          "ZeroValue"
        );
      });

      it("should revert NotAssigned if setter lacks SETTER_ROLE", async () => {
        const cfg = { ...baseConfig, setters: [stranger.address] };
        await expect(examVault.connect(authority).createExam(cfg)).to.be.revertedWithCustomError(
          examVault,
          "NotAssigned"
        );
      });

      it("should revert DuplicateEntry if duplicate setter in panel", async () => {
        const cfg = { ...baseConfig, setters: [setter1.address, setter1.address] };
        await expect(examVault.connect(authority).createExam(cfg)).to.be.revertedWithCustomError(
          examVault,
          "DuplicateEntry"
        );
      });

      it("should revert InvalidPanel if centres array is empty", async () => {
        const cfg = { ...baseConfig, centres: [] };
        await expect(examVault.connect(authority).createExam(cfg)).to.be.revertedWithCustomError(
          examVault,
          "InvalidPanel"
        );
      });

      it("should revert ZeroValue if centre address is zero", async () => {
        const cfg = { ...baseConfig, centres: [ethers.ZeroAddress] };
        await expect(examVault.connect(authority).createExam(cfg)).to.be.revertedWithCustomError(
          examVault,
          "ZeroValue"
        );
      });

      it("should revert NotAssigned if centre lacks CENTRE_ROLE", async () => {
        const cfg = { ...baseConfig, centres: [stranger.address] };
        await expect(examVault.connect(authority).createExam(cfg)).to.be.revertedWithCustomError(
          examVault,
          "NotAssigned"
        );
      });

      it("should revert DuplicateEntry if duplicate centre in panel", async () => {
        const cfg = { ...baseConfig, centres: [centre1.address, centre1.address] };
        await expect(examVault.connect(authority).createExam(cfg)).to.be.revertedWithCustomError(
          examVault,
          "DuplicateEntry"
        );
      });
    });
  });

  describe("Collection Phase (SC-04)", () => {
    const examId = 1n;
    let baseConfig: ExamVault.ExamConfigStruct;

    beforeEach(async () => {
      await examVault.connect(admin).registerParticipant(authority.address, ROLE_AUTHORITY, ethers.ZeroHash);
      await examVault.connect(admin).registerParticipant(authority2.address, ROLE_AUTHORITY, ethers.ZeroHash);
      await examVault.connect(admin).registerParticipant(setter1.address, ROLE_SETTER, ethers.ZeroHash);
      await examVault.connect(admin).registerParticipant(setter2.address, ROLE_SETTER, ethers.ZeroHash);
      await examVault.connect(admin).registerParticipant(setter3.address, ROLE_SETTER, ethers.ZeroHash);

      await examVault.connect(admin).registerParticipant(holder1.address, ROLE_HOLDER, ethers.ZeroHash);
      await examVault.connect(admin).registerParticipant(holder2.address, ROLE_HOLDER, ethers.ZeroHash);
      await examVault.connect(admin).registerParticipant(holder3.address, ROLE_HOLDER, ethers.ZeroHash);

      await examVault.connect(admin).registerParticipant(centre1.address, ROLE_CENTRE, ethers.ZeroHash);

      await examVault.connect(holder1).setEncryptionKey(validP256PubKey);
      await examVault.connect(holder2).setEncryptionKey(validP256PubKey);
      await examVault.connect(holder3).setEncryptionKey(validP256PubKey);

      const latestTime = BigInt(await time.latest());
      const releaseOpensAt = latestTime + minLeadSeconds + 100n;
      const examStartsAt = releaseOpensAt + 3600n;
      const examEndsAt = examStartsAt + 7200n;

      baseConfig = {
        metaHash: ethers.keccak256(ethers.toUtf8Bytes("exam-metadata")),
        releaseOpensAt,
        examStartsAt,
        examEndsAt,
        threshold: 2,
        holders: [holder1.address, holder2.address, holder3.address],
        setters: [setter1.address, setter2.address],
        centres: [centre1.address],
        quotas: [2, 3], // Section 0: 2 questions, Section 1: 3 questions
      };

      await examVault.connect(authority).createExam(baseConfig);
    });

    describe("openCollection", () => {
      it("should revert ExamNotFound for invalid examId", async () => {
        await expect(
          examVault.connect(authority).openCollection(999n, validP256PubKey)
        ).to.be.revertedWithCustomError(examVault, "ExamNotFound");
      });

      it("should revert if caller does not have AUTHORITY_ROLE", async () => {
        await expect(
          examVault.connect(stranger).openCollection(examId, validP256PubKey)
        ).to.be.revertedWithCustomError(examVault, "AccessControlUnauthorizedAccount");
      });

      it("should revert NotAssigned if caller has AUTHORITY_ROLE but is not the creator/authority of this exam", async () => {
        await expect(
          examVault.connect(authority2).openCollection(examId, validP256PubKey)
        ).to.be.revertedWithCustomError(examVault, "NotAssigned");
      });

      it("should revert InvalidKeyFormat if examPublicKey is invalid", async () => {
        // Short key
        await expect(
          examVault.connect(authority).openCollection(examId, ethers.randomBytes(32))
        ).to.be.revertedWithCustomError(examVault, "InvalidKeyFormat");

        // Wrong prefix
        const invalidPrefix = ethers.concat([new Uint8Array([0x03]), ethers.randomBytes(64)]);
        await expect(
          examVault.connect(authority).openCollection(examId, invalidPrefix)
        ).to.be.revertedWithCustomError(examVault, "InvalidKeyFormat");
      });

      it("should successfully open collection and transition state from Draft to Collecting", async () => {
        await expect(examVault.connect(authority).openCollection(examId, validP256PubKey))
          .to.emit(examVault, "CollectionOpened")
          .withArgs(examId, validP256PubKey);

        const exam = await examVault.getExam(examId);
        expect(exam.state).to.equal(1); // State.Collecting
        expect(exam.examPublicKey).to.equal(validP256PubKey);
      });

      it("should revert WrongState if openCollection is called again when not in Draft state", async () => {
        await examVault.connect(authority).openCollection(examId, validP256PubKey);

        await expect(
          examVault.connect(authority).openCollection(examId, validP256PubKey)
        ).to.be.revertedWithCustomError(examVault, "WrongState").withArgs(0, 1);
      });
    });

    describe("commitRandomness", () => {
      const share1 = ethers.toUtf8Bytes("share-holder-1");
      const reveal1 = ethers.keccak256(ethers.toUtf8Bytes("randomness-reveal-1"));
      let shareCommitment1: string;
      let randomnessCommitment1: string;

      beforeEach(async () => {
        shareCommitment1 = computeShareCommitment(examId, holder1.address, share1);
        randomnessCommitment1 = computeRandomnessCommitment(examId, holder1.address, reveal1);
      });

      it("should revert ExamNotFound for invalid examId", async () => {
        await expect(
          examVault.connect(holder1).commitRandomness(999n, shareCommitment1, randomnessCommitment1)
        ).to.be.revertedWithCustomError(examVault, "ExamNotFound");
      });

      it("should revert NotAssigned if caller lacks HOLDER_ROLE or is not an assigned holder", async () => {
        await expect(
          examVault.connect(stranger).commitRandomness(examId, shareCommitment1, randomnessCommitment1)
        ).to.be.revertedWithCustomError(examVault, "AccessControlUnauthorizedAccount");

        // Register a holder not in this panel
        await examVault.connect(admin).registerParticipant(holder4.address, ROLE_HOLDER, ethers.ZeroHash);
        await examVault.connect(holder4).setEncryptionKey(validP256PubKey);
        await expect(
          examVault.connect(holder4).commitRandomness(examId, shareCommitment1, randomnessCommitment1)
        ).to.be.revertedWithCustomError(examVault, "NotAssigned");
      });

      it("should revert WrongState if exam is not in Collecting state", async () => {
        // State is Draft
        await expect(
          examVault.connect(holder1).commitRandomness(examId, shareCommitment1, randomnessCommitment1)
        ).to.be.revertedWithCustomError(examVault, "WrongState").withArgs(1, 0);
      });

      it("should revert ZeroValue if any commitment is zero", async () => {
        await examVault.connect(authority).openCollection(examId, validP256PubKey);

        await expect(
          examVault.connect(holder1).commitRandomness(examId, ethers.ZeroHash, randomnessCommitment1)
        ).to.be.revertedWithCustomError(examVault, "ZeroValue");

        await expect(
          examVault.connect(holder1).commitRandomness(examId, shareCommitment1, ethers.ZeroHash)
        ).to.be.revertedWithCustomError(examVault, "ZeroValue");
      });

      it("should successfully record commitments and emit RandomnessCommitted", async () => {
        await examVault.connect(authority).openCollection(examId, validP256PubKey);

        await expect(
          examVault.connect(holder1).commitRandomness(examId, shareCommitment1, randomnessCommitment1)
        )
          .to.emit(examVault, "RandomnessCommitted")
          .withArgs(examId, holder1.address);

        expect(await examVault.getShareCommitment(examId, holder1.address)).to.equal(shareCommitment1);
        expect(await examVault.getRandomnessCommitment(examId, holder1.address)).to.equal(randomnessCommitment1);
      });

      it("should revert AlreadySubmitted if holder commits twice in the same exam", async () => {
        await examVault.connect(authority).openCollection(examId, validP256PubKey);
        await examVault.connect(holder1).commitRandomness(examId, shareCommitment1, randomnessCommitment1);

        await expect(
          examVault.connect(holder1).commitRandomness(examId, shareCommitment1, randomnessCommitment1)
        ).to.be.revertedWithCustomError(examVault, "AlreadySubmitted");
      });
    });

    describe("submitBatch", () => {
      const hashBatch1 = ethers.keccak256(ethers.toUtf8Bytes("ciphertext-batch-1"));
      const hashBatch2 = ethers.keccak256(ethers.toUtf8Bytes("ciphertext-batch-2"));
      const hashBatch3 = ethers.keccak256(ethers.toUtf8Bytes("ciphertext-batch-3"));

      it("should revert ExamNotFound for invalid examId", async () => {
        await expect(
          examVault.connect(setter1).submitBatch(999n, 0, hashBatch1, 1)
        ).to.be.revertedWithCustomError(examVault, "ExamNotFound");
      });

      it("should revert NotAssigned if caller lacks SETTER_ROLE or is not an assigned setter", async () => {
        await expect(
          examVault.connect(stranger).submitBatch(examId, 0, hashBatch1, 1)
        ).to.be.revertedWithCustomError(examVault, "AccessControlUnauthorizedAccount");

        // setter3 has SETTER_ROLE but was not assigned to panel of examId
        await expect(
          examVault.connect(setter3).submitBatch(examId, 0, hashBatch1, 1)
        ).to.be.revertedWithCustomError(examVault, "NotAssigned");
      });

      it("should revert WrongState if exam is not in Collecting state", async () => {
        await expect(
          examVault.connect(setter1).submitBatch(examId, 0, hashBatch1, 1)
        ).to.be.revertedWithCustomError(examVault, "WrongState").withArgs(1, 0);
      });

      it("should revert ZeroValue if ciphertextHash is zero or questionCount is zero", async () => {
        await examVault.connect(authority).openCollection(examId, validP256PubKey);

        await expect(
          examVault.connect(setter1).submitBatch(examId, 0, ethers.ZeroHash, 1)
        ).to.be.revertedWithCustomError(examVault, "ZeroValue");

        await expect(
          examVault.connect(setter1).submitBatch(examId, 0, hashBatch1, 0)
        ).to.be.revertedWithCustomError(examVault, "ZeroValue");
      });

      it("should revert InvalidQuotas if sectionId is out of bounds", async () => {
        await examVault.connect(authority).openCollection(examId, validP256PubKey);

        // quotas length is 2, so valid sectionIds are 0, 1. sectionId 2 is out of range.
        await expect(
          examVault.connect(setter1).submitBatch(examId, 2, hashBatch1, 1)
        ).to.be.revertedWithCustomError(examVault, "InvalidQuotas");
      });

      it("should successfully submit batches, compute running startInSection, and emit BatchSubmitted", async () => {
        await examVault.connect(authority).openCollection(examId, validP256PubKey);

        // Batch 1: Section 0, 1 question -> startInSection = 0
        await expect(examVault.connect(setter1).submitBatch(examId, 0, hashBatch1, 1))
          .to.emit(examVault, "BatchSubmitted")
          .withArgs(examId, 1n, setter1.address, 0, hashBatch1, 1, 0);

        expect(await examVault.getSectionQuestionCount(examId, 0)).to.equal(1);

        // Batch 2: Section 0, 1 question -> startInSection = 1
        await expect(examVault.connect(setter2).submitBatch(examId, 0, hashBatch2, 1))
          .to.emit(examVault, "BatchSubmitted")
          .withArgs(examId, 2n, setter2.address, 0, hashBatch2, 1, 1);

        expect(await examVault.getSectionQuestionCount(examId, 0)).to.equal(2);

        // Batch 3: Section 1, 3 questions -> startInSection = 0
        await expect(examVault.connect(setter1).submitBatch(examId, 1, hashBatch3, 3))
          .to.emit(examVault, "BatchSubmitted")
          .withArgs(examId, 3n, setter1.address, 1, hashBatch3, 3, 0);

        expect(await examVault.getSectionQuestionCount(examId, 1)).to.equal(3);

        const batches = await examVault.getBatches(examId);
        expect(batches.length).to.equal(3);
        expect(batches[0].batchId).to.equal(1n);
        expect(batches[0].startInSection).to.equal(0);
        expect(batches[1].batchId).to.equal(2n);
        expect(batches[1].startInSection).to.equal(1);
        expect(batches[2].batchId).to.equal(3n);
        expect(batches[2].startInSection).to.equal(0);

        const singleBatch = await examVault.getBatch(examId, 2n);
        expect(singleBatch.batchId).to.equal(2n);
        expect(singleBatch.setter).to.equal(setter2.address);
        expect(singleBatch.ciphertextHash).to.equal(hashBatch2);
      });

      it("should revert DuplicateEntry if repeated ciphertextHash is submitted within the same exam", async () => {
        await examVault.connect(authority).openCollection(examId, validP256PubKey);
        await examVault.connect(setter1).submitBatch(examId, 0, hashBatch1, 1);

        await expect(
          examVault.connect(setter2).submitBatch(examId, 0, hashBatch1, 1)
        ).to.be.revertedWithCustomError(examVault, "DuplicateEntry");
      });

      it("getBatch reverts BatchNotFound for invalid batchId", async () => {
        await examVault.connect(authority).openCollection(examId, validP256PubKey);
        await expect(examVault.getBatch(examId, 0n)).to.be.revertedWithCustomError(examVault, "BatchNotFound");
        await expect(examVault.getBatch(examId, 1n)).to.be.revertedWithCustomError(examVault, "BatchNotFound");
      });
    });
  });

  describe("Exam Sealing (SC-05)", () => {
    const examId = 1n;
    let baseConfig: ExamVault.ExamConfigStruct;

    const share1 = ethers.toUtf8Bytes("share-1");
    const share2 = ethers.toUtf8Bytes("share-2");
    const share3 = ethers.toUtf8Bytes("share-3");

    const reveal1 = ethers.keccak256(ethers.toUtf8Bytes("reveal-1"));
    const reveal2 = ethers.keccak256(ethers.toUtf8Bytes("reveal-2"));
    const reveal3 = ethers.keccak256(ethers.toUtf8Bytes("reveal-3"));

    const hashB1 = ethers.keccak256(ethers.toUtf8Bytes("batch-payload-1"));
    const hashB2 = ethers.keccak256(ethers.toUtf8Bytes("batch-payload-2"));
    const hashB3 = ethers.keccak256(ethers.toUtf8Bytes("batch-payload-3"));

    beforeEach(async () => {
      await examVault.connect(admin).registerParticipant(authority.address, ROLE_AUTHORITY, ethers.ZeroHash);
      await examVault.connect(admin).registerParticipant(authority2.address, ROLE_AUTHORITY, ethers.ZeroHash);
      await examVault.connect(admin).registerParticipant(setter1.address, ROLE_SETTER, ethers.ZeroHash);
      await examVault.connect(admin).registerParticipant(setter2.address, ROLE_SETTER, ethers.ZeroHash);

      await examVault.connect(admin).registerParticipant(holder1.address, ROLE_HOLDER, ethers.ZeroHash);
      await examVault.connect(admin).registerParticipant(holder2.address, ROLE_HOLDER, ethers.ZeroHash);
      await examVault.connect(admin).registerParticipant(holder3.address, ROLE_HOLDER, ethers.ZeroHash);

      await examVault.connect(admin).registerParticipant(centre1.address, ROLE_CENTRE, ethers.ZeroHash);

      await examVault.connect(holder1).setEncryptionKey(validP256PubKey);
      await examVault.connect(holder2).setEncryptionKey(validP256PubKey);
      await examVault.connect(holder3).setEncryptionKey(validP256PubKey);

      const latestTime = BigInt(await time.latest());
      const releaseOpensAt = latestTime + minLeadSeconds + 100n;
      const examStartsAt = releaseOpensAt + 3600n;
      const examEndsAt = examStartsAt + 7200n;

      baseConfig = {
        metaHash: ethers.keccak256(ethers.toUtf8Bytes("exam-metadata")),
        releaseOpensAt,
        examStartsAt,
        examEndsAt,
        threshold: 2,
        holders: [holder1.address, holder2.address, holder3.address],
        setters: [setter1.address, setter2.address],
        centres: [centre1.address],
        quotas: [2, 3], // Section 0: 2 questions, Section 1: 3 questions
      };

      await examVault.connect(authority).createExam(baseConfig);
    });

    it("should revert ExamNotFound for invalid examId", async () => {
      await expect(examVault.connect(authority).sealExam(999n)).to.be.revertedWithCustomError(
        examVault,
        "ExamNotFound"
      );
    });

    it("should revert if caller does not have AUTHORITY_ROLE", async () => {
      await expect(examVault.connect(stranger).sealExam(examId)).to.be.revertedWithCustomError(
        examVault,
        "AccessControlUnauthorizedAccount"
      );
    });

    it("should revert NotAssigned if caller has AUTHORITY_ROLE but is not the creator of this exam", async () => {
      await expect(examVault.connect(authority2).sealExam(examId)).to.be.revertedWithCustomError(
        examVault,
        "NotAssigned"
      );
    });

    it("should revert WrongState if exam is not in Collecting state", async () => {
      // In Draft state
      await expect(examVault.connect(authority).sealExam(examId)).to.be.revertedWithCustomError(
        examVault,
        "WrongState"
      ).withArgs(1, 0);
    });

    it("should revert QuotaNotMet if section question total is less than quota", async () => {
      await examVault.connect(authority).openCollection(examId, validP256PubKey);

      // Submit 1 question to Section 0 (need 2)
      await examVault.connect(setter1).submitBatch(examId, 0, hashB1, 1);

      // Commit randomness for all 3 holders
      await examVault.connect(holder1).commitRandomness(examId, computeShareCommitment(examId, holder1.address, share1), computeRandomnessCommitment(examId, holder1.address, reveal1));
      await examVault.connect(holder2).commitRandomness(examId, computeShareCommitment(examId, holder2.address, share2), computeRandomnessCommitment(examId, holder2.address, reveal2));
      await examVault.connect(holder3).commitRandomness(examId, computeShareCommitment(examId, holder3.address, share3), computeRandomnessCommitment(examId, holder3.address, reveal3));

      await expect(examVault.connect(authority).sealExam(examId))
        .to.be.revertedWithCustomError(examVault, "QuotaNotMet")
        .withArgs(0, 1, 2);
    });

    it("should revert QuotaNotMet if section question total exceeds quota", async () => {
      await examVault.connect(authority).openCollection(examId, validP256PubKey);

      // Submit 3 questions to Section 0 (need 2)
      await examVault.connect(setter1).submitBatch(examId, 0, hashB1, 3);
      await examVault.connect(setter1).submitBatch(examId, 1, hashB2, 3);

      await examVault.connect(holder1).commitRandomness(examId, computeShareCommitment(examId, holder1.address, share1), computeRandomnessCommitment(examId, holder1.address, reveal1));
      await examVault.connect(holder2).commitRandomness(examId, computeShareCommitment(examId, holder2.address, share2), computeRandomnessCommitment(examId, holder2.address, reveal2));
      await examVault.connect(holder3).commitRandomness(examId, computeShareCommitment(examId, holder3.address, share3), computeRandomnessCommitment(examId, holder3.address, reveal3));

      await expect(examVault.connect(authority).sealExam(examId))
        .to.be.revertedWithCustomError(examVault, "QuotaNotMet")
        .withArgs(0, 3, 2);
    });

    it("should revert MissingCommitment if any assigned holder did not commit randomness", async () => {
      await examVault.connect(authority).openCollection(examId, validP256PubKey);

      // Quotas satisfied: Sec 0: 2, Sec 1: 3
      await examVault.connect(setter1).submitBatch(examId, 0, hashB1, 2);
      await examVault.connect(setter1).submitBatch(examId, 1, hashB2, 3);

      // Only holders 1 & 2 commit; holder3 does not
      await examVault.connect(holder1).commitRandomness(examId, computeShareCommitment(examId, holder1.address, share1), computeRandomnessCommitment(examId, holder1.address, reveal1));
      await examVault.connect(holder2).commitRandomness(examId, computeShareCommitment(examId, holder2.address, share2), computeRandomnessCommitment(examId, holder2.address, reveal2));

      await expect(examVault.connect(authority).sealExam(examId))
        .to.be.revertedWithCustomError(examVault, "MissingCommitment")
        .withArgs(holder3.address);
    });

    it("should successfully seal exam, compute exact bankHash, transition state to Sealed, and emit ExamSealed", async () => {
      await examVault.connect(authority).openCollection(examId, validP256PubKey);

      // Section 0: batch 1 (1 q), batch 2 (1 q) -> total 2
      await examVault.connect(setter1).submitBatch(examId, 0, hashB1, 1);
      await examVault.connect(setter2).submitBatch(examId, 0, hashB2, 1);

      // Section 1: batch 3 (3 q) -> total 3
      await examVault.connect(setter1).submitBatch(examId, 1, hashB3, 3);

      // All 3 holders commit
      await examVault.connect(holder1).commitRandomness(examId, computeShareCommitment(examId, holder1.address, share1), computeRandomnessCommitment(examId, holder1.address, reveal1));
      await examVault.connect(holder2).commitRandomness(examId, computeShareCommitment(examId, holder2.address, share2), computeRandomnessCommitment(examId, holder2.address, reveal2));
      await examVault.connect(holder3).commitRandomness(examId, computeShareCommitment(examId, holder3.address, share3), computeRandomnessCommitment(examId, holder3.address, reveal3));

      const expectedBankHash = computeBankHash([hashB1, hashB2, hashB3]);

      await expect(examVault.connect(authority).sealExam(examId))
        .to.emit(examVault, "ExamSealed")
        .withArgs(examId, expectedBankHash);

      const exam = await examVault.getExam(examId);
      expect(exam.state).to.equal(2); // State.Sealed
      expect(exam.bankHash).to.equal(expectedBankHash);
    });
  });

  describe("Threshold Release & Submit Share (SC-06)", () => {
    const examId = 1n;
    let baseConfig: ExamVault.ExamConfigStruct;

    const share1 = ethers.toUtf8Bytes("shamir-share-p256-1");
    const share2 = ethers.toUtf8Bytes("shamir-share-p256-2");
    const share3 = ethers.toUtf8Bytes("shamir-share-p256-3");

    const reveal1 = ethers.keccak256(ethers.toUtf8Bytes("entropy-reveal-1"));
    const reveal2 = ethers.keccak256(ethers.toUtf8Bytes("entropy-reveal-2"));
    const reveal3 = ethers.keccak256(ethers.toUtf8Bytes("entropy-reveal-3"));

    const hashB1 = ethers.keccak256(ethers.toUtf8Bytes("batch-1"));

    let releaseOpensAt: bigint;
    let examStartsAt: bigint;
    let examEndsAt: bigint;

    beforeEach(async () => {
      await examVault.connect(admin).registerParticipant(authority.address, ROLE_AUTHORITY, ethers.ZeroHash);
      await examVault.connect(admin).registerParticipant(setter1.address, ROLE_SETTER, ethers.ZeroHash);

      await examVault.connect(admin).registerParticipant(holder1.address, ROLE_HOLDER, ethers.ZeroHash);
      await examVault.connect(admin).registerParticipant(holder2.address, ROLE_HOLDER, ethers.ZeroHash);
      await examVault.connect(admin).registerParticipant(holder3.address, ROLE_HOLDER, ethers.ZeroHash);
      await examVault.connect(admin).registerParticipant(holder4.address, ROLE_HOLDER, ethers.ZeroHash);

      await examVault.connect(admin).registerParticipant(centre1.address, ROLE_CENTRE, ethers.ZeroHash);

      await examVault.connect(holder1).setEncryptionKey(validP256PubKey);
      await examVault.connect(holder2).setEncryptionKey(validP256PubKey);
      await examVault.connect(holder3).setEncryptionKey(validP256PubKey);
      await examVault.connect(holder4).setEncryptionKey(validP256PubKey);

      const latestTime = BigInt(await time.latest());
      releaseOpensAt = latestTime + minLeadSeconds + 1000n;
      examStartsAt = releaseOpensAt + 3600n;
      examEndsAt = examStartsAt + 7200n;

      baseConfig = {
        metaHash: ethers.keccak256(ethers.toUtf8Bytes("canonical-meta")),
        releaseOpensAt,
        examStartsAt,
        examEndsAt,
        threshold: 2, // t = 2 out of n = 3
        holders: [holder1.address, holder2.address, holder3.address],
        setters: [setter1.address],
        centres: [centre1.address],
        quotas: [1],
      };

      // Create -> Open -> Submit batches & commitments -> Seal
      await examVault.connect(authority).createExam(baseConfig);
      await examVault.connect(authority).openCollection(examId, validP256PubKey);
      await examVault.connect(setter1).submitBatch(examId, 0, hashB1, 1);

      await examVault.connect(holder1).commitRandomness(examId, computeShareCommitment(examId, holder1.address, share1), computeRandomnessCommitment(examId, holder1.address, reveal1));
      await examVault.connect(holder2).commitRandomness(examId, computeShareCommitment(examId, holder2.address, share2), computeRandomnessCommitment(examId, holder2.address, reveal2));
      await examVault.connect(holder3).commitRandomness(examId, computeShareCommitment(examId, holder3.address, share3), computeRandomnessCommitment(examId, holder3.address, reveal3));

      await examVault.connect(authority).sealExam(examId);
    });

    describe("Access control & panel validations", () => {
      it("should revert ExamNotFound for non-existent examId", async () => {
        await time.setNextBlockTimestamp(releaseOpensAt);
        await expect(
          examVault.connect(holder1).submitShare(999n, share1, reveal1)
        ).to.be.revertedWithCustomError(examVault, "ExamNotFound");
      });

      it("should revert NotAssigned if caller lacks HOLDER_ROLE or is not an assigned holder in this exam", async () => {
        await time.setNextBlockTimestamp(releaseOpensAt);

        // Stranger without HOLDER_ROLE
        await expect(
          examVault.connect(stranger).submitShare(examId, share1, reveal1)
        ).to.be.revertedWithCustomError(examVault, "AccessControlUnauthorizedAccount");

        // Registered HOLDER not in panel (holder4)
        await expect(
          examVault.connect(holder4).submitShare(examId, share1, reveal1)
        ).to.be.revertedWithCustomError(examVault, "NotAssigned");
      });
    });

    describe("Time boundary validations (1 second before and after each boundary)", () => {
      it("should revert TooEarly exactly 1 second before releaseOpensAt", async () => {
        const tooEarlyTime = releaseOpensAt - 1n;
        await time.setNextBlockTimestamp(tooEarlyTime);

        await expect(
          examVault.connect(holder1).submitShare(examId, share1, reveal1)
        ).to.be.revertedWithCustomError(examVault, "TooEarly").withArgs(tooEarlyTime, releaseOpensAt);
      });

      it("should accept submission exactly at releaseOpensAt (start boundary)", async () => {
        await time.setNextBlockTimestamp(releaseOpensAt);

        await expect(examVault.connect(holder1).submitShare(examId, share1, reveal1))
          .to.emit(examVault, "ShareSubmitted")
          .withArgs(examId, holder1.address, share1);

        expect(await examVault.hasSubmittedShare(examId, holder1.address)).to.be.true;
      });

      it("should accept submission exactly at examEndsAt (end boundary)", async () => {
        await time.setNextBlockTimestamp(examEndsAt);

        await expect(examVault.connect(holder1).submitShare(examId, share1, reveal1))
          .to.emit(examVault, "ShareSubmitted")
          .withArgs(examId, holder1.address, share1);

        expect(await examVault.hasSubmittedShare(examId, holder1.address)).to.be.true;
      });

      it("should revert TooLate exactly 1 second after examEndsAt", async () => {
        const tooLateTime = examEndsAt + 1n;
        await time.setNextBlockTimestamp(tooLateTime);

        await expect(
          examVault.connect(holder1).submitShare(examId, share1, reveal1)
        ).to.be.revertedWithCustomError(examVault, "TooLate").withArgs(tooLateTime, examEndsAt);
      });
    });

    describe("State validations", () => {
      it("should revert WrongState if exam is in Draft state", async () => {
        const cfgDraft = { ...baseConfig };
        await examVault.connect(authority).createExam(cfgDraft);
        const draftExamId = 2n;

        await time.setNextBlockTimestamp(releaseOpensAt);
        await expect(
          examVault.connect(holder1).submitShare(draftExamId, share1, reveal1)
        ).to.be.revertedWithCustomError(examVault, "WrongState").withArgs(2, 0); // Expected Sealed(2), actual Draft(0)
      });

      it("should revert WrongState if exam is in Collecting state", async () => {
        const cfgCol = { ...baseConfig };
        await examVault.connect(authority).createExam(cfgCol);
        const colExamId = 2n;
        await examVault.connect(authority).openCollection(colExamId, validP256PubKey);

        await time.setNextBlockTimestamp(releaseOpensAt);
        await expect(
          examVault.connect(holder1).submitShare(colExamId, share1, reveal1)
        ).to.be.revertedWithCustomError(examVault, "WrongState").withArgs(2, 1); // Expected Sealed(2), actual Collecting(1)
      });
    });

    describe("Payload and Commitment validations", () => {
      beforeEach(async () => {
        await time.setNextBlockTimestamp(releaseOpensAt);
      });

      it("should revert ZeroValue if share is empty or reveal is zero", async () => {
        await expect(
          examVault.connect(holder1).submitShare(examId, "0x", reveal1)
        ).to.be.revertedWithCustomError(examVault, "ZeroValue");

        await expect(
          examVault.connect(holder1).submitShare(examId, share1, ethers.ZeroHash)
        ).to.be.revertedWithCustomError(examVault, "ZeroValue");
      });

      it("should revert InvalidShare if wrong share bytes are submitted", async () => {
        const wrongShare = ethers.toUtf8Bytes("tampered-share");
        await expect(
          examVault.connect(holder1).submitShare(examId, wrongShare, reveal1)
        ).to.be.revertedWithCustomError(examVault, "InvalidShare");
      });

      it("should revert InvalidReveal if wrong reveal bytes32 is submitted", async () => {
        const wrongReveal = ethers.keccak256(ethers.toUtf8Bytes("wrong-reveal"));
        await expect(
          examVault.connect(holder1).submitShare(examId, share1, wrongReveal)
        ).to.be.revertedWithCustomError(examVault, "InvalidReveal");
      });

      it("should revert AlreadySubmitted on duplicate submission by the same holder", async () => {
        await examVault.connect(holder1).submitShare(examId, share1, reveal1);

        await expect(
          examVault.connect(holder1).submitShare(examId, share1, reveal1)
        ).to.be.revertedWithCustomError(examVault, "AlreadySubmitted");
      });
    });

    describe("Threshold Release State Transitions and Seed Calculation", () => {
      it("state changes to Released exactly at the t-th submission and computes exact canonical seed", async () => {
        await time.setNextBlockTimestamp(releaseOpensAt);

        // Before submissions: State is Sealed, seed is 0x0
        let exam = await examVault.getExam(examId);
        expect(exam.state).to.equal(2); // State.Sealed
        expect(exam.seed).to.equal(ethers.ZeroHash);
        expect(exam.releasedAt).to.equal(0n);
        expect(await examVault.getShareSubmissionCount(examId)).to.equal(0n);

        // 1st submission: holder2 submits first (threshold is 2)
        await expect(examVault.connect(holder2).submitShare(examId, share2, reveal2))
          .to.emit(examVault, "ShareSubmitted")
          .withArgs(examId, holder2.address, share2)
          .and.not.to.emit(examVault, "PaperReleased");

        exam = await examVault.getExam(examId);
        expect(exam.state).to.equal(2); // Still Sealed
        expect(exam.seed).to.equal(ethers.ZeroHash);
        expect(exam.releasedAt).to.equal(0n);
        expect(await examVault.getShareSubmissionCount(examId)).to.equal(1n);

        // 2nd submission: holder1 submits (t-th submission reaching threshold 2)
        // Holders in panel order are [holder1, holder2, holder3].
        // The two submitters are holder1 and holder2.
        // In panel order, holder1 is index 0 and holder2 is index 1.
        // Therefore reveals array must be [reveal1, reveal2].
        const expectedSeed = computeReleaseSeed(examId, [reveal1, reveal2]);
        const releaseTimestamp = releaseOpensAt + 100n;
        await time.setNextBlockTimestamp(releaseTimestamp);

        await expect(examVault.connect(holder1).submitShare(examId, share1, reveal1))
          .to.emit(examVault, "ShareSubmitted")
          .withArgs(examId, holder1.address, share1)
          .and.to.emit(examVault, "PaperReleased")
          .withArgs(examId, expectedSeed, releaseTimestamp);

        exam = await examVault.getExam(examId);
        expect(exam.state).to.equal(3); // State.Released
        expect(exam.seed).to.equal(expectedSeed);
        expect(exam.releasedAt).to.equal(releaseTimestamp);
        expect(await examVault.getShareSubmissionCount(examId)).to.equal(2n);
      });
    });

    describe("Property: Seed and State Invariance Post-Release", () => {
      it("seed and releasedAt never change when additional (t+1)th holders submit or across multiple blocks", async () => {
        await time.setNextBlockTimestamp(releaseOpensAt);

        // Submit holder1 and holder2 to reach threshold 2
        await examVault.connect(holder1).submitShare(examId, share1, reveal1);

        const releaseTimestamp = releaseOpensAt + 50n;
        await time.setNextBlockTimestamp(releaseTimestamp);
        await examVault.connect(holder2).submitShare(examId, share2, reveal2);

        const initialExam = await examVault.getExam(examId);
        const canonicalSeed = initialExam.seed;
        expect(initialExam.state).to.equal(3); // Released
        expect(canonicalSeed).to.not.equal(ethers.ZeroHash);
        expect(initialExam.releasedAt).to.equal(releaseTimestamp);

        // 3rd holder (holder3, t+1) submits their share post-release within time window
        const laterTimestamp = releaseTimestamp + 200n;
        await time.setNextBlockTimestamp(laterTimestamp);

        await expect(examVault.connect(holder3).submitShare(examId, share3, reveal3))
          .to.emit(examVault, "ShareSubmitted")
          .withArgs(examId, holder3.address, share3)
          .and.not.to.emit(examVault, "PaperReleased");

        const postExam = await examVault.getExam(examId);
        expect(postExam.state).to.equal(3); // Released
        expect(postExam.seed).to.equal(canonicalSeed); // Invariant!
        expect(postExam.releasedAt).to.equal(releaseTimestamp); // Invariant!
        expect(await examVault.getShareSubmissionCount(examId)).to.equal(3n);
        expect(await examVault.hasSubmittedShare(examId, holder3.address)).to.be.true;

        // Advance time significantly within exam window and verify reads remain 100% constant
        await time.increase(1000);
        const finalExam = await examVault.getExam(examId);
        expect(finalExam.seed).to.equal(canonicalSeed);
        expect(finalExam.releasedAt).to.equal(releaseTimestamp);
        expect(finalExam.state).to.equal(3);
      });
    });
  });

  describe("SC-07: Post-Release, Maintenance & Lifecycle", () => {
    const examId = 1n;
    let baseConfig: ExamVault.ExamConfigStruct;

    let releaseOpensAt: bigint;
    let examStartsAt: bigint;
    let examEndsAt: bigint;

    const share1 = ethers.toUtf8Bytes("share-1");
    const share2 = ethers.toUtf8Bytes("share-2");
    const share3 = ethers.toUtf8Bytes("share-3");

    const reveal1 = ethers.keccak256(ethers.toUtf8Bytes("reveal-1"));
    const reveal2 = ethers.keccak256(ethers.toUtf8Bytes("reveal-2"));
    const reveal3 = ethers.keccak256(ethers.toUtf8Bytes("reveal-3"));

    const hashB1 = ethers.keccak256(ethers.toUtf8Bytes("batch-payload-1"));
    const hashB2 = ethers.keccak256(ethers.toUtf8Bytes("batch-payload-2"));

    const variantHash1 = ethers.keccak256(ethers.toUtf8Bytes("variant-centre-1"));
    const variantHash2 = ethers.keccak256(ethers.toUtf8Bytes("variant-centre-2"));
    const rosterRoot = ethers.keccak256(ethers.toUtf8Bytes("merkle-roster-root"));
    const decoyHash = ethers.keccak256(ethers.toUtf8Bytes("decoy-hash-1"));
    const channelLabel = ethers.encodeBytes32String("channel-telegram");
    const reasonHash = ethers.keccak256(ethers.toUtf8Bytes("emergency-weather"));
    const evidenceHash = ethers.keccak256(ethers.toUtf8Bytes("leak-evidence-photos"));

    beforeEach(async () => {
      await examVault.connect(admin).registerParticipant(authority.address, ROLE_AUTHORITY, ethers.ZeroHash);
      await examVault.connect(admin).registerParticipant(authority2.address, ROLE_AUTHORITY, ethers.ZeroHash);
      await examVault.connect(admin).registerParticipant(setter1.address, ROLE_SETTER, ethers.ZeroHash);
      await examVault.connect(admin).registerParticipant(setter2.address, ROLE_SETTER, ethers.ZeroHash);

      await examVault.connect(admin).registerParticipant(holder1.address, ROLE_HOLDER, ethers.ZeroHash);
      await examVault.connect(admin).registerParticipant(holder2.address, ROLE_HOLDER, ethers.ZeroHash);
      await examVault.connect(admin).registerParticipant(holder3.address, ROLE_HOLDER, ethers.ZeroHash);

      await examVault.connect(admin).registerParticipant(centre1.address, ROLE_CENTRE, ethers.ZeroHash);
      await examVault.connect(admin).registerParticipant(centre2.address, ROLE_CENTRE, ethers.ZeroHash);

      await examVault.connect(admin).registerParticipant(auditor.address, ROLE_AUDITOR, ethers.ZeroHash);

      await examVault.connect(holder1).setEncryptionKey(validP256PubKey);
      await examVault.connect(holder2).setEncryptionKey(validP256PubKey);
      await examVault.connect(holder3).setEncryptionKey(validP256PubKey);

      const latestTime = BigInt(await time.latest());
      releaseOpensAt = latestTime + minLeadSeconds + 100n;
      examStartsAt = releaseOpensAt + 3600n;
      examEndsAt = examStartsAt + 7200n;

      baseConfig = {
        metaHash: ethers.keccak256(ethers.toUtf8Bytes("exam-metadata")),
        releaseOpensAt,
        examStartsAt,
        examEndsAt,
        threshold: 2,
        holders: [holder1.address, holder2.address, holder3.address],
        setters: [setter1.address],
        centres: [centre1.address, centre2.address],
        quotas: [1, 1],
      };

      await examVault.connect(authority).createExam(baseConfig);
    });

    // Helper to advance exam to Sealed state
    async function advanceToSealed() {
      await examVault.connect(authority).openCollection(examId, validP256PubKey);
      await examVault.connect(holder1).commitRandomness(examId, computeShareCommitment(examId, holder1.address, share1), computeRandomnessCommitment(examId, holder1.address, reveal1));
      await examVault.connect(holder2).commitRandomness(examId, computeShareCommitment(examId, holder2.address, share2), computeRandomnessCommitment(examId, holder2.address, reveal2));
      await examVault.connect(holder3).commitRandomness(examId, computeShareCommitment(examId, holder3.address, share3), computeRandomnessCommitment(examId, holder3.address, reveal3));
      await examVault.connect(setter1).submitBatch(examId, 0, hashB1, 1);
      await examVault.connect(setter1).submitBatch(examId, 1, hashB2, 1);
      await examVault.connect(authority).sealExam(examId);
    }

    // Helper to advance exam to Released state
    async function advanceToReleased() {
      await advanceToSealed();
      await time.setNextBlockTimestamp(releaseOpensAt);
      await examVault.connect(holder1).submitShare(examId, share1, reveal1);
      await examVault.connect(holder2).submitShare(examId, share2, reveal2);
    }

    describe("publishRoster", () => {
      it("should revert ExamNotFound for invalid exam ID", async () => {
        await expect(examVault.connect(authority).publishRoster(999n, rosterRoot)).to.be.revertedWithCustomError(
          examVault,
          "ExamNotFound"
        );
      });

      it("should revert if caller does not have AUTHORITY_ROLE", async () => {
        await expect(examVault.connect(stranger).publishRoster(examId, rosterRoot)).to.be.revertedWithCustomError(
          examVault,
          "AccessControlUnauthorizedAccount"
        );
      });

      it("should revert NotAssigned if caller is a different authority", async () => {
        await expect(examVault.connect(authority2).publishRoster(examId, rosterRoot)).to.be.revertedWithCustomError(
          examVault,
          "NotAssigned"
        );
      });

      it("should succeed in Draft state", async () => {
        await expect(examVault.connect(authority).publishRoster(examId, rosterRoot))
          .to.emit(examVault, "RosterPublished")
          .withArgs(examId, rosterRoot);

        expect(await examVault.getRosterRoot(examId)).to.equal(rosterRoot);
      });

      it("should succeed in Collecting state", async () => {
        await examVault.connect(authority).openCollection(examId, validP256PubKey);
        await expect(examVault.connect(authority).publishRoster(examId, rosterRoot))
          .to.emit(examVault, "RosterPublished")
          .withArgs(examId, rosterRoot);

        expect(await examVault.getRosterRoot(examId)).to.equal(rosterRoot);
      });

      it("should succeed in Sealed state", async () => {
        await advanceToSealed();
        await expect(examVault.connect(authority).publishRoster(examId, rosterRoot))
          .to.emit(examVault, "RosterPublished")
          .withArgs(examId, rosterRoot);

        expect(await examVault.getRosterRoot(examId)).to.equal(rosterRoot);
      });

      it("should revert ZeroValue if merkleRoot is 0", async () => {
        await expect(examVault.connect(authority).publishRoster(examId, ethers.ZeroHash)).to.be.revertedWithCustomError(
          examVault,
          "ZeroValue"
        );
      });

      it("should revert AlreadySubmitted if published more than once", async () => {
        await examVault.connect(authority).publishRoster(examId, rosterRoot);
        await expect(examVault.connect(authority).publishRoster(examId, rosterRoot)).to.be.revertedWithCustomError(
          examVault,
          "AlreadySubmitted"
        );
      });

      it("should revert WrongState if exam is in Released state", async () => {
        await advanceToReleased();
        await expect(examVault.connect(authority).publishRoster(examId, rosterRoot)).to.be.revertedWithCustomError(
          examVault,
          "WrongState"
        ).withArgs(0, 3);
      });
    });

    describe("registerDecoy", () => {
      it("should revert ExamNotFound for invalid exam ID", async () => {
        await expect(examVault.connect(authority).registerDecoy(999n, decoyHash, channelLabel)).to.be.revertedWithCustomError(
          examVault,
          "ExamNotFound"
        );
      });

      it("should revert if caller does not have AUTHORITY_ROLE", async () => {
        await expect(examVault.connect(stranger).registerDecoy(examId, decoyHash, channelLabel)).to.be.revertedWithCustomError(
          examVault,
          "AccessControlUnauthorizedAccount"
        );
      });

      it("should revert NotAssigned if caller is a different authority", async () => {
        await expect(examVault.connect(authority2).registerDecoy(examId, decoyHash, channelLabel)).to.be.revertedWithCustomError(
          examVault,
          "NotAssigned"
        );
      });

      it("should revert WrongState if exam is in Draft or Collecting state", async () => {
        await expect(examVault.connect(authority).registerDecoy(examId, decoyHash, channelLabel)).to.be.revertedWithCustomError(
          examVault,
          "WrongState"
        ).withArgs(2, 0);

        await examVault.connect(authority).openCollection(examId, validP256PubKey);
        await expect(examVault.connect(authority).registerDecoy(examId, decoyHash, channelLabel)).to.be.revertedWithCustomError(
          examVault,
          "WrongState"
        ).withArgs(2, 1);
      });

      it("should succeed in Sealed state", async () => {
        await advanceToSealed();
        await expect(examVault.connect(authority).registerDecoy(examId, decoyHash, channelLabel))
          .to.emit(examVault, "DecoyRegistered")
          .withArgs(examId, decoyHash, channelLabel);
      });

      it("should succeed in Released state", async () => {
        await advanceToReleased();
        await expect(examVault.connect(authority).registerDecoy(examId, decoyHash, channelLabel))
          .to.emit(examVault, "DecoyRegistered")
          .withArgs(examId, decoyHash, channelLabel);
      });

      it("should revert ZeroValue if decoyHash is 0", async () => {
        await advanceToSealed();
        await expect(examVault.connect(authority).registerDecoy(examId, ethers.ZeroHash, channelLabel)).to.be.revertedWithCustomError(
          examVault,
          "ZeroValue"
        );
      });
    });

    describe("registerCopy", () => {
      it("should revert ExamNotFound for invalid exam ID", async () => {
        await expect(examVault.connect(centre1).registerCopy(999n, variantHash1)).to.be.revertedWithCustomError(
          examVault,
          "ExamNotFound"
        );
      });

      it("should revert if caller does not have CENTRE_ROLE", async () => {
        await expect(examVault.connect(stranger).registerCopy(examId, variantHash1)).to.be.revertedWithCustomError(
          examVault,
          "AccessControlUnauthorizedAccount"
        );
      });

      it("should revert NotAssigned if centre is not assigned to this exam", async () => {
        // Register centre3 with CENTRE_ROLE but don't assign to panel
        const centre3 = stranger;
        await examVault.connect(admin).registerParticipant(centre3.address, ROLE_CENTRE, ethers.ZeroHash);
        await expect(examVault.connect(centre3).registerCopy(examId, variantHash1)).to.be.revertedWithCustomError(
          examVault,
          "NotAssigned"
        );
      });

      it("should revert WrongState if exam is not Released", async () => {
        await expect(examVault.connect(centre1).registerCopy(examId, variantHash1)).to.be.revertedWithCustomError(
          examVault,
          "WrongState"
        ).withArgs(3, 0);

        await advanceToSealed();
        await expect(examVault.connect(centre1).registerCopy(examId, variantHash1)).to.be.revertedWithCustomError(
          examVault,
          "WrongState"
        ).withArgs(3, 2);
      });

      it("should allow registration between releaseOpensAt and examEndsAt (no lower bound at examStartsAt)", async () => {
        await advanceToReleased();

        // Right after release (before examStartsAt)
        const regTime1 = releaseOpensAt + 100n;
        await time.setNextBlockTimestamp(regTime1);
        await expect(examVault.connect(centre1).registerCopy(examId, variantHash1))
          .to.emit(examVault, "CopyRegistered")
          .withArgs(examId, centre1.address, variantHash1, regTime1);

        const copyData = await examVault.getCopy(examId, centre1.address);
        expect(copyData.variantHash).to.equal(variantHash1);
        expect(copyData.registeredAt).to.equal(regTime1);
        expect(await examVault.getCopyOwner(examId, variantHash1)).to.equal(centre1.address);

        // During exam (between examStartsAt and examEndsAt)
        const regTime2 = examStartsAt + 500n;
        await time.setNextBlockTimestamp(regTime2);
        await expect(examVault.connect(centre2).registerCopy(examId, variantHash2))
          .to.emit(examVault, "CopyRegistered")
          .withArgs(examId, centre2.address, variantHash2, regTime2);

        expect(await examVault.getCopyOwner(examId, variantHash2)).to.equal(centre2.address);
      });

      it("should revert TooLate if after examEndsAt", async () => {
        await advanceToReleased();
        await time.setNextBlockTimestamp(examEndsAt + 1n);

        await expect(examVault.connect(centre1).registerCopy(examId, variantHash1)).to.be.revertedWithCustomError(
          examVault,
          "TooLate"
        ).withArgs(examEndsAt + 1n, examEndsAt);
      });

      it("should revert ZeroValue if variantHash is 0", async () => {
        await advanceToReleased();
        await expect(examVault.connect(centre1).registerCopy(examId, ethers.ZeroHash)).to.be.revertedWithCustomError(
          examVault,
          "ZeroValue"
        );
      });

      it("should revert AlreadySubmitted if centre already registered", async () => {
        await advanceToReleased();
        await examVault.connect(centre1).registerCopy(examId, variantHash1);

        await expect(examVault.connect(centre1).registerCopy(examId, variantHash2)).to.be.revertedWithCustomError(
          examVault,
          "AlreadySubmitted"
        );
      });

      it("should revert DuplicateEntry if variantHash already registered by another centre", async () => {
        await advanceToReleased();
        await examVault.connect(centre1).registerCopy(examId, variantHash1);

        await expect(examVault.connect(centre2).registerCopy(examId, variantHash1)).to.be.revertedWithCustomError(
          examVault,
          "DuplicateEntry"
        );
      });
    });

    describe("reportLeak", () => {
      beforeEach(async () => {
        await advanceToReleased();
        await examVault.connect(centre1).registerCopy(examId, variantHash1);
      });

      it("should revert ExamNotFound for invalid exam ID", async () => {
        await expect(examVault.connect(auditor).reportLeak(999n, evidenceHash, centre1.address, variantHash1)).to.be.revertedWithCustomError(
          examVault,
          "ExamNotFound"
        );
      });

      it("should revert if caller does not have AUDITOR_ROLE", async () => {
        await expect(examVault.connect(stranger).reportLeak(examId, evidenceHash, centre1.address, variantHash1)).to.be.revertedWithCustomError(
          examVault,
          "AccessControlUnauthorizedAccount"
        );
      });

      it("should revert ZeroValue if evidenceHash is zero", async () => {
        await expect(
          examVault.connect(auditor).reportLeak(examId, ethers.ZeroHash, centre1.address, variantHash1)
        ).to.be.revertedWithCustomError(examVault, "ZeroValue");
      });

      it("should revert ZeroValue if suspectCentre == address(0) and matchedVariantHash is zero", async () => {
        await expect(
          examVault.connect(auditor).reportLeak(examId, evidenceHash, ethers.ZeroAddress, ethers.ZeroHash)
        ).to.be.revertedWithCustomError(examVault, "ZeroValue");
      });

      it("(a) assigned centre with no registered copy and matchedVariantHash = 0 must revert with CopyMismatch", async () => {
        // centre2 is assigned to panel, but has not registered a copy
        await expect(
          examVault.connect(auditor).reportLeak(examId, evidenceHash, centre2.address, ethers.ZeroHash)
        ).to.be.revertedWithCustomError(examVault, "CopyMismatch");
      });

      it("(b) assigned centre with no registered copy and non-zero matchedVariantHash must revert with CopyMismatch", async () => {
        // centre2 is assigned to panel, but has not registered a copy
        await expect(
          examVault.connect(auditor).reportLeak(examId, evidenceHash, centre2.address, variantHash2)
        ).to.be.revertedWithCustomError(examVault, "CopyMismatch");
      });

      it("(c) assigned centre with a registered copy but a different hash must revert with CopyMismatch", async () => {
        // centre1 registered variantHash1, auditor reports variantHash2 for centre1
        await expect(
          examVault.connect(auditor).reportLeak(examId, evidenceHash, centre1.address, variantHash2)
        ).to.be.revertedWithCustomError(examVault, "CopyMismatch");

        // centre1 registered variantHash1, auditor reports 0x0
        await expect(
          examVault.connect(auditor).reportLeak(examId, evidenceHash, centre1.address, ethers.ZeroHash)
        ).to.be.revertedWithCustomError(examVault, "CopyMismatch");
      });

      it("(d) unassigned centre must revert with NotAssigned", async () => {
        await expect(
          examVault.connect(auditor).reportLeak(examId, evidenceHash, stranger.address, variantHash1)
        ).to.be.revertedWithCustomError(examVault, "NotAssigned");
      });

      it("(e) correct match succeeds and emits LeakReported", async () => {
        await expect(
          examVault.connect(auditor).reportLeak(examId, evidenceHash, centre1.address, variantHash1)
        )
          .to.emit(examVault, "LeakReported")
          .withArgs(examId, auditor.address, evidenceHash, centre1.address, variantHash1);
      });

      it("should allow leak reporting for unattributed leaks (suspectCentre == address(0))", async () => {
        await expect(
          examVault.connect(auditor).reportLeak(examId, evidenceHash, ethers.ZeroAddress, variantHash1)
        )
          .to.emit(examVault, "LeakReported")
          .withArgs(examId, auditor.address, evidenceHash, ethers.ZeroAddress, variantHash1);
      });

      it("should allow leak reporting in Concluded state", async () => {
        await time.setNextBlockTimestamp(examEndsAt + 10n);
        await examVault.connect(authority).concludeExam(examId);

        await expect(
          examVault.connect(auditor).reportLeak(examId, evidenceHash, centre1.address, variantHash1)
        )
          .to.emit(examVault, "LeakReported")
          .withArgs(examId, auditor.address, evidenceHash, centre1.address, variantHash1);
      });

      it("should allow leak reporting in Cancelled state", async () => {
        await examVault.connect(authority).cancelExam(examId, reasonHash);

        await expect(
          examVault.connect(auditor).reportLeak(examId, evidenceHash, centre1.address, variantHash1)
        )
          .to.emit(examVault, "LeakReported")
          .withArgs(examId, auditor.address, evidenceHash, centre1.address, variantHash1);
      });

      it("should revert WrongState if exam is in Draft, Collecting, or Sealed", async () => {
        // Create new exam in Draft
        const newExamId = 2n;
        const newConfig = { ...baseConfig };
        const latest = BigInt(await time.latest());
        newConfig.releaseOpensAt = latest + minLeadSeconds + 100n;
        newConfig.examStartsAt = newConfig.releaseOpensAt + 3600n;
        newConfig.examEndsAt = newConfig.examStartsAt + 7200n;
        await examVault.connect(authority).createExam(newConfig);

        await expect(
          examVault.connect(auditor).reportLeak(newExamId, evidenceHash, ethers.ZeroAddress, variantHash1)
        ).to.be.revertedWithCustomError(examVault, "WrongState");
      });
    });

    describe("concludeExam", () => {
      it("should revert ExamNotFound for invalid exam ID", async () => {
        await expect(examVault.connect(authority).concludeExam(999n)).to.be.revertedWithCustomError(
          examVault,
          "ExamNotFound"
        );
      });

      it("should revert if caller does not have AUTHORITY_ROLE", async () => {
        await expect(examVault.connect(stranger).concludeExam(examId)).to.be.revertedWithCustomError(
          examVault,
          "AccessControlUnauthorizedAccount"
        );
      });

      it("should revert NotAssigned if caller is not the exam authority", async () => {
        await expect(examVault.connect(authority2).concludeExam(examId)).to.be.revertedWithCustomError(
          examVault,
          "NotAssigned"
        );
      });

      it("should revert WrongState if exam is not Released", async () => {
        await expect(examVault.connect(authority).concludeExam(examId)).to.be.revertedWithCustomError(
          examVault,
          "WrongState"
        ).withArgs(3, 0);
      });

      it("should revert TooEarly if called before or at examEndsAt", async () => {
        await advanceToReleased();
        await time.setNextBlockTimestamp(examEndsAt);

        await expect(examVault.connect(authority).concludeExam(examId)).to.be.revertedWithCustomError(
          examVault,
          "TooEarly"
        ).withArgs(examEndsAt, examEndsAt + 1n);
      });

      it("should succeed after examEndsAt, transition state to Concluded, and not decrement liveExamCount again", async () => {
        await advanceToReleased();

        // liveExamCount for holders should already be 0 (decremented upon release in submitShare)
        expect(await examVault.liveExamCount(holder1.address)).to.equal(0n);
        expect(await examVault.liveExamCount(holder2.address)).to.equal(0n);
        expect(await examVault.liveExamCount(holder3.address)).to.equal(0n);

        const concludeTimestamp = examEndsAt + 100n;
        await time.setNextBlockTimestamp(concludeTimestamp);

        await expect(examVault.connect(authority).concludeExam(examId))
          .to.emit(examVault, "ExamConcluded")
          .withArgs(examId);

        const exam = await examVault.getExam(examId);
        expect(exam.state).to.equal(4); // Concluded
        expect(exam.concludedAt).to.equal(concludeTimestamp);

        // Verify liveExamCount remains 0 and did not underflow
        expect(await examVault.liveExamCount(holder1.address)).to.equal(0n);
        expect(await examVault.liveExamCount(holder2.address)).to.equal(0n);
        expect(await examVault.liveExamCount(holder3.address)).to.equal(0n);
      });
    });

    describe("cancelExam", () => {
      it("should revert ExamNotFound for invalid exam ID", async () => {
        await expect(examVault.connect(authority).cancelExam(999n, reasonHash)).to.be.revertedWithCustomError(
          examVault,
          "ExamNotFound"
        );
      });

      it("should revert if caller does not have AUTHORITY_ROLE", async () => {
        await expect(examVault.connect(stranger).cancelExam(examId, reasonHash)).to.be.revertedWithCustomError(
          examVault,
          "AccessControlUnauthorizedAccount"
        );
      });

      it("should revert NotAssigned if caller is not the exam authority", async () => {
        await expect(examVault.connect(authority2).cancelExam(examId, reasonHash)).to.be.revertedWithCustomError(
          examVault,
          "NotAssigned"
        );
      });

      it("should revert ZeroValue if reasonHash is zero", async () => {
        await expect(examVault.connect(authority).cancelExam(examId, ethers.ZeroHash)).to.be.revertedWithCustomError(
          examVault,
          "ZeroValue"
        );
      });

      it("should cancel from Draft state and decrement liveExamCount", async () => {
        expect(await examVault.liveExamCount(holder1.address)).to.equal(1n);

        await expect(examVault.connect(authority).cancelExam(examId, reasonHash))
          .to.emit(examVault, "ExamCancelled")
          .withArgs(examId, reasonHash);

        const exam = await examVault.getExam(examId);
        expect(exam.state).to.equal(5); // Cancelled
        expect(exam.cancellationReasonHash).to.equal(reasonHash);

        expect(await examVault.liveExamCount(holder1.address)).to.equal(0n);
      });

      it("should cancel from Collecting state and decrement liveExamCount", async () => {
        await examVault.connect(authority).openCollection(examId, validP256PubKey);
        expect(await examVault.liveExamCount(holder1.address)).to.equal(1n);

        await expect(examVault.connect(authority).cancelExam(examId, reasonHash))
          .to.emit(examVault, "ExamCancelled")
          .withArgs(examId, reasonHash);

        expect(await examVault.liveExamCount(holder1.address)).to.equal(0n);
      });

      it("should cancel from Sealed state and decrement liveExamCount", async () => {
        await advanceToSealed();
        expect(await examVault.liveExamCount(holder1.address)).to.equal(1n);

        await expect(examVault.connect(authority).cancelExam(examId, reasonHash))
          .to.emit(examVault, "ExamCancelled")
          .withArgs(examId, reasonHash);

        expect(await examVault.liveExamCount(holder1.address)).to.equal(0n);
      });

      it("should cancel from Released state and NOT decrement liveExamCount again", async () => {
        await advanceToReleased();
        // At release, liveExamCount was already decremented to 0
        expect(await examVault.liveExamCount(holder1.address)).to.equal(0n);

        await expect(examVault.connect(authority).cancelExam(examId, reasonHash))
          .to.emit(examVault, "ExamCancelled")
          .withArgs(examId, reasonHash);

        const exam = await examVault.getExam(examId);
        expect(exam.state).to.equal(5); // Cancelled
        expect(await examVault.liveExamCount(holder1.address)).to.equal(0n);
      });

      it("should cancel from Concluded state and NOT decrement liveExamCount again", async () => {
        await advanceToReleased();
        await time.setNextBlockTimestamp(examEndsAt + 100n);
        await examVault.connect(authority).concludeExam(examId);

        expect(await examVault.liveExamCount(holder1.address)).to.equal(0n);

        await expect(examVault.connect(authority).cancelExam(examId, reasonHash))
          .to.emit(examVault, "ExamCancelled")
          .withArgs(examId, reasonHash);

        const exam = await examVault.getExam(examId);
        expect(exam.state).to.equal(5); // Cancelled
        expect(await examVault.liveExamCount(holder1.address)).to.equal(0n);
      });

      it("should revert WrongState if exam is already Cancelled", async () => {
        await examVault.connect(authority).cancelExam(examId, reasonHash);
        await expect(examVault.connect(authority).cancelExam(examId, reasonHash)).to.be.revertedWithCustomError(
          examVault,
          "WrongState"
        );
      });
    });

    describe("liveExamCount Lifecycle & Invariants", () => {
      it("tracks holder in multiple concurrent exams and manages live count correctly", async () => {
        // holder1 is in exam 1 (liveExamCount = 1)
        expect(await examVault.liveExamCount(holder1.address)).to.equal(1n);

        // Cannot revoke or rotate key while in live exam
        await expect(examVault.connect(admin).revokeParticipant(holder1.address, ROLE_HOLDER)).to.be.revertedWithCustomError(
          examVault,
          "HolderInLiveExam"
        );
        await expect(examVault.connect(holder1).setEncryptionKey(validP256PubKey)).to.be.revertedWithCustomError(
          examVault,
          "HolderInLiveExam"
        );

        // Create exam 2 with holder1
        const latest = BigInt(await time.latest());
        const config2 = {
          ...baseConfig,
          releaseOpensAt: latest + minLeadSeconds + 200n,
          examStartsAt: latest + minLeadSeconds + 4000n,
          examEndsAt: latest + minLeadSeconds + 8000n,
        };
        await examVault.connect(authority).createExam(config2);
        const examId2 = 2n;

        // holder1 is now in 2 live exams
        expect(await examVault.liveExamCount(holder1.address)).to.equal(2n);

        // Cancel exam 1 -> count drops to 1
        await examVault.connect(authority).cancelExam(examId, reasonHash);
        expect(await examVault.liveExamCount(holder1.address)).to.equal(1n);

        // Still cannot rotate key
        await expect(examVault.connect(holder1).setEncryptionKey(validP256PubKey)).to.be.revertedWithCustomError(
          examVault,
          "HolderInLiveExam"
        );

        // Advance exam 2 to Released -> count drops to 0
        await examVault.connect(authority).openCollection(examId2, validP256PubKey);
        await examVault.connect(holder1).commitRandomness(examId2, computeShareCommitment(examId2, holder1.address, share1), computeRandomnessCommitment(examId2, holder1.address, reveal1));
        await examVault.connect(holder2).commitRandomness(examId2, computeShareCommitment(examId2, holder2.address, share2), computeRandomnessCommitment(examId2, holder2.address, reveal2));
        await examVault.connect(holder3).commitRandomness(examId2, computeShareCommitment(examId2, holder3.address, share3), computeRandomnessCommitment(examId2, holder3.address, reveal3));
        await examVault.connect(setter1).submitBatch(examId2, 0, hashB1, 1);
        await examVault.connect(setter1).submitBatch(examId2, 1, hashB2, 1);
        await examVault.connect(authority).sealExam(examId2);

        await time.setNextBlockTimestamp(config2.releaseOpensAt);
        await examVault.connect(holder1).submitShare(examId2, share1, reveal1);
        await examVault.connect(holder2).submitShare(examId2, share2, reveal2);

        expect(await examVault.liveExamCount(holder1.address)).to.equal(0n);

        // Now holder1 can rotate key or be revoked without error!
        await expect(examVault.connect(holder1).setEncryptionKey(validP256PubKey)).to.emit(examVault, "EncryptionKeySet");
      });
    });

    describe("Views & Additional Coverage", () => {
      it("getSectionTotals returns correct section counts", async () => {
        expect(await examVault.getSectionTotals(examId)).to.deep.equal([0, 0]);

        await examVault.connect(authority).openCollection(examId, validP256PubKey);
        await examVault.connect(setter1).submitBatch(examId, 0, hashB1, 1);

        expect(await examVault.getSectionTotals(examId)).to.deep.equal([1, 0]);

        await examVault.connect(setter1).submitBatch(examId, 1, hashB2, 1);
        expect(await examVault.getSectionTotals(examId)).to.deep.equal([1, 1]);
      });

      it("hasCommittedRandomness returns true only after commitment", async () => {
        expect(await examVault.hasCommittedRandomness(examId, holder1.address)).to.be.false;

        await examVault.connect(authority).openCollection(examId, validP256PubKey);
        await examVault.connect(holder1).commitRandomness(examId, computeShareCommitment(examId, holder1.address, share1), computeRandomnessCommitment(examId, holder1.address, reveal1));

        expect(await examVault.hasCommittedRandomness(examId, holder1.address)).to.be.true;
        expect(await examVault.hasCommittedRandomness(examId, holder2.address)).to.be.false;
      });

      it("views revert ExamNotFound on invalid examId", async () => {
        await expect(examVault.getSectionTotals(999n)).to.be.revertedWithCustomError(examVault, "ExamNotFound");
        await expect(examVault.getSectionTotals(0n)).to.be.revertedWithCustomError(examVault, "ExamNotFound");
        await expect(examVault.hasCommittedRandomness(999n, holder1.address)).to.be.revertedWithCustomError(examVault, "ExamNotFound");
        await expect(examVault.hasCommittedRandomness(0n, holder1.address)).to.be.revertedWithCustomError(examVault, "ExamNotFound");
        await expect(examVault.getCopy(999n, centre1.address)).to.be.revertedWithCustomError(examVault, "ExamNotFound");
        await expect(examVault.getCopy(0n, centre1.address)).to.be.revertedWithCustomError(examVault, "ExamNotFound");
        await expect(examVault.getCopyOwner(999n, variantHash1)).to.be.revertedWithCustomError(examVault, "ExamNotFound");
        await expect(examVault.getCopyOwner(0n, variantHash1)).to.be.revertedWithCustomError(examVault, "ExamNotFound");
        await expect(examVault.getRosterRoot(999n)).to.be.revertedWithCustomError(examVault, "ExamNotFound");
        await expect(examVault.getRosterRoot(0n)).to.be.revertedWithCustomError(examVault, "ExamNotFound");
        await expect(examVault.getExam(0n)).to.be.revertedWithCustomError(examVault, "ExamNotFound");
        await expect(examVault.getPanel(0n)).to.be.revertedWithCustomError(examVault, "ExamNotFound");
        await expect(examVault.getBatches(0n)).to.be.revertedWithCustomError(examVault, "ExamNotFound");
        await expect(examVault.getBatch(0n, 1n)).to.be.revertedWithCustomError(examVault, "ExamNotFound");
        await expect(examVault.getSectionQuestionCount(0n, 0)).to.be.revertedWithCustomError(examVault, "ExamNotFound");
        await expect(examVault.getShareCommitment(0n, holder1.address)).to.be.revertedWithCustomError(examVault, "ExamNotFound");
        await expect(examVault.getRandomnessCommitment(0n, holder1.address)).to.be.revertedWithCustomError(examVault, "ExamNotFound");
        await expect(examVault.hasSubmittedShare(0n, holder1.address)).to.be.revertedWithCustomError(examVault, "ExamNotFound");
        await expect(examVault.getShareSubmissionCount(0n)).to.be.revertedWithCustomError(examVault, "ExamNotFound");
      });

      it("mutating functions revert ExamNotFound on examId == 0 and examId >= nextExamId", async () => {
        await expect(examVault.connect(authority).openCollection(0n, validP256PubKey)).to.be.revertedWithCustomError(examVault, "ExamNotFound");
        await expect(examVault.connect(holder1).commitRandomness(0n, ethers.ZeroHash, ethers.ZeroHash)).to.be.revertedWithCustomError(examVault, "ExamNotFound");
        await expect(examVault.connect(setter1).submitBatch(0n, 0, hashB1, 1)).to.be.revertedWithCustomError(examVault, "ExamNotFound");
        await expect(examVault.connect(authority).sealExam(0n)).to.be.revertedWithCustomError(examVault, "ExamNotFound");
        await expect(examVault.connect(holder1).submitShare(0n, share1, reveal1)).to.be.revertedWithCustomError(examVault, "ExamNotFound");
        await expect(examVault.connect(centre1).registerCopy(0n, variantHash1)).to.be.revertedWithCustomError(examVault, "ExamNotFound");
        await expect(examVault.connect(authority).registerDecoy(0n, decoyHash, channelLabel)).to.be.revertedWithCustomError(examVault, "ExamNotFound");
        await expect(examVault.connect(authority).publishRoster(0n, rosterRoot)).to.be.revertedWithCustomError(examVault, "ExamNotFound");
        await expect(examVault.connect(auditor).reportLeak(0n, evidenceHash, centre1.address, variantHash1)).to.be.revertedWithCustomError(examVault, "ExamNotFound");
        await expect(examVault.connect(authority).concludeExam(0n)).to.be.revertedWithCustomError(examVault, "ExamNotFound");
        await expect(examVault.connect(authority).cancelExam(0n, reasonHash)).to.be.revertedWithCustomError(examVault, "ExamNotFound");
      });
    });
  });
});

