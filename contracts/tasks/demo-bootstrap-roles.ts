import { task } from "hardhat/config";

task("demo:bootstrap-roles", "Register participants with all five role types from local accounts")
  .setAction(async (_, { ethers, network }) => {
    const signers = await ethers.getSigners();
    if (signers.length < 15) {
      throw new Error(
        `Need at least 15 local accounts (have ${signers.length}). ` +
        `Run with a Hardhat network that has enough accounts.`
      );
    }

    // Account allocation:
    // 0: admin (deployer)
    // 1: authority
    // 2-3: setters (2)
    // 4-8: holders (5)
    // 9-11: centres (3)
    // 12: auditor
    const admin = signers[0];
    const authorityAccounts = [signers[1]];
    const setterAccounts = [signers[2], signers[3]];
    const holderAccounts = [signers[4], signers[5], signers[6], signers[7], signers[8]];
    const centreAccounts = [signers[9], signers[10], signers[11]];
    const auditorAccounts = [signers[12]];

    const ROLE_AUTHORITY = 1;
    const ROLE_SETTER = 2;
    const ROLE_HOLDER = 3;
    const ROLE_CENTRE = 4;
    const ROLE_AUDITOR = 5;

    const AUTHORITY_ROLE = ethers.keccak256(ethers.toUtf8Bytes("AUTHORITY_ROLE"));
    const SETTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("SETTER_ROLE"));
    const HOLDER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("HOLDER_ROLE"));
    const CENTRE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("CENTRE_ROLE"));
    const AUDITOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("AUDITOR_ROLE"));

    // Find the deployed contract
    const deployments = await import("fs");
    const path = await import("path");
    const candidates = [
      path.join(__dirname, "..", "deployments", `${network.name}.json`),
      path.join(__dirname, "..", "deployments", "localhost.json"),
      path.join(__dirname, "..", "deployments", "hardhat.json"),
    ];

    let examVaultAddress = "";
    for (const candidate of candidates) {
      if (deployments.existsSync(candidate)) {
        try {
          const deploymentInfo = JSON.parse(deployments.readFileSync(candidate, "utf-8"));
          if (deploymentInfo.address) {
            const code = await ethers.provider.getCode(deploymentInfo.address);
            if (code && code !== "0x") {
              examVaultAddress = deploymentInfo.address;
              console.log(`Found live deployment at: ${deploymentInfo.address} (${candidate})`);
              break;
            }
          }
        } catch {
          // continue checking candidates
        }
      }
    }

    let examVault;
    if (!examVaultAddress) {
      console.log(`No active deployment found on network "${network.name}". Deploying fresh ExamVault instance for task...`);
      const ExamVaultFactory = await ethers.getContractFactory("ExamVault", admin);
      examVault = await ExamVaultFactory.deploy(60n);
      await examVault.waitForDeployment();
      examVaultAddress = await examVault.getAddress();
      console.log(`ExamVault deployed at ${examVaultAddress}`);
    } else {
      examVault = await ethers.getContractAt("ExamVault", examVaultAddress);
      console.log(`Using existing ExamVault at ${examVaultAddress}`);
    }

    // Register authority (idempotent)
    console.log("\n--- Authority Accounts ---");
    for (const acc of authorityAccounts) {
      const alreadyHasRole = await examVault.hasRole(AUTHORITY_ROLE, acc.address);
      if (!alreadyHasRole) {
        const tx = await examVault.connect(admin).registerParticipant(acc.address, ROLE_AUTHORITY, ethers.ZeroHash);
        await tx.wait();
        console.log(`  [REGISTERED] AUTHORITY: ${acc.address}`);
      } else {
        console.log(`  [ALREADY HAS ROLE] AUTHORITY: ${acc.address}`);
      }
    }

    // Register setters (idempotent)
    console.log("\n--- Setter Accounts ---");
    for (const acc of setterAccounts) {
      const alreadyHasRole = await examVault.hasRole(SETTER_ROLE, acc.address);
      if (!alreadyHasRole) {
        const tx = await examVault.connect(admin).registerParticipant(acc.address, ROLE_SETTER, ethers.ZeroHash);
        await tx.wait();
        console.log(`  [REGISTERED] SETTER:    ${acc.address}`);
      } else {
        console.log(`  [ALREADY HAS ROLE] SETTER:    ${acc.address}`);
      }
    }

    // Register holders (idempotent - roles only, holders register their own keys)
    console.log("\n--- Holder Accounts ---");
    for (const acc of holderAccounts) {
      const alreadyHasRole = await examVault.hasRole(HOLDER_ROLE, acc.address);
      if (!alreadyHasRole) {
        const tx = await examVault.connect(admin).registerParticipant(acc.address, ROLE_HOLDER, ethers.ZeroHash);
        await tx.wait();
        console.log(`  [REGISTERED] HOLDER:    ${acc.address}`);
      } else {
        console.log(`  [ALREADY HAS ROLE] HOLDER:    ${acc.address}`);
      }
    }

    // Register centres (idempotent)
    console.log("\n--- Centre Accounts ---");
    for (const acc of centreAccounts) {
      const alreadyHasRole = await examVault.hasRole(CENTRE_ROLE, acc.address);
      if (!alreadyHasRole) {
        const tx = await examVault.connect(admin).registerParticipant(acc.address, ROLE_CENTRE, ethers.ZeroHash);
        await tx.wait();
        console.log(`  [REGISTERED] CENTRE:    ${acc.address}`);
      } else {
        console.log(`  [ALREADY HAS ROLE] CENTRE:    ${acc.address}`);
      }
    }

    // Register auditor (idempotent)
    console.log("\n--- Auditor Accounts ---");
    for (const acc of auditorAccounts) {
      const alreadyHasRole = await examVault.hasRole(AUDITOR_ROLE, acc.address);
      if (!alreadyHasRole) {
        const tx = await examVault.connect(admin).registerParticipant(acc.address, ROLE_AUDITOR, ethers.ZeroHash);
        await tx.wait();
        console.log(`  [REGISTERED] AUDITOR:   ${acc.address}`);
      } else {
        console.log(`  [ALREADY HAS ROLE] AUDITOR:   ${acc.address}`);
      }
    }

    console.log("\nBootstrap complete. Assigned addresses summary:");
    console.log(`  Authority (1): ${authorityAccounts.map((a) => a.address).join(", ")}`);
    console.log(`  Setters   (2): ${setterAccounts.map((a) => a.address).join(", ")}`);
    console.log(`  Holders   (5): ${holderAccounts.map((a) => a.address).join(", ")}`);
    console.log(`  Centres   (3): ${centreAccounts.map((a) => a.address).join(", ")}`);
    console.log(`  Auditor   (1): ${auditorAccounts.map((a) => a.address).join(", ")}`);
  });
