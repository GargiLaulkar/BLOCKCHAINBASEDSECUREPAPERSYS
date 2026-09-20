import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const minLeadSeconds = process.env.MIN_LEAD_SECONDS
    ? BigInt(process.env.MIN_LEAD_SECONDS)
    : 60n; // Default 60s for local/demo

  console.log(`Deploying ExamVault with minLeadSeconds=${minLeadSeconds} on network "${network.name}"...`);

  const ExamVaultFactory = await ethers.getContractFactory("ExamVault");
  const examVault = await ExamVaultFactory.deploy(minLeadSeconds);
  await examVault.waitForDeployment();

  const address = await examVault.getAddress();
  const deployTx = examVault.deploymentTransaction();
  const blockNumber = deployTx?.blockNumber ?? 0;
  const chainId = (await ethers.provider.getNetwork()).chainId;

  console.log(`ExamVault deployed at: ${address}`);
  console.log(`Block number: ${blockNumber}`);
  console.log(`Chain ID: ${chainId}`);

  // Write deployment info
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const deploymentInfo = {
    address,
    blockNumber,
    chainId: Number(chainId),
    minLeadSeconds: Number(minLeadSeconds),
    deployedAt: new Date().toISOString(),
  };

  const filePath = path.join(deploymentsDir, `${network.name}.json`);
  fs.writeFileSync(filePath, JSON.stringify(deploymentInfo, null, 2) + "\n");
  console.log(`Deployment info written to ${filePath}`);

  // Export ABI and Artifact to packages/contracts-types
  const artifactPath = path.join(
    __dirname,
    "..",
    "artifacts",
    "contracts",
    "ExamVault.sol",
    "ExamVault.json"
  );

  if (fs.existsSync(artifactPath)) {
    const artifactContent = fs.readFileSync(artifactPath, "utf-8");
    const parsedArtifact = JSON.parse(artifactContent);

    const packagesTypesSrcDir = path.join(__dirname, "..", "..", "packages", "contracts-types", "src");
    const packagesTypesAbiDir = path.join(__dirname, "..", "..", "packages", "contracts-types", "abi");

    if (!fs.existsSync(packagesTypesSrcDir)) {
      fs.mkdirSync(packagesTypesSrcDir, { recursive: true });
    }
    if (!fs.existsSync(packagesTypesAbiDir)) {
      fs.mkdirSync(packagesTypesAbiDir, { recursive: true });
    }

    fs.writeFileSync(
      path.join(packagesTypesSrcDir, "ExamVault.json"),
      JSON.stringify(parsedArtifact, null, 2) + "\n"
    );
    fs.writeFileSync(
      path.join(packagesTypesAbiDir, "ExamVault.json"),
      JSON.stringify(parsedArtifact.abi, null, 2) + "\n"
    );

    console.log(`Exported ABI and Artifact to packages/contracts-types`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
