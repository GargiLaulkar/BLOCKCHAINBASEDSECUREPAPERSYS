import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const artifactPath = path.join(root, "contracts", "artifacts", "contracts", "ExamVault.sol", "ExamVault.json");

if (!fs.existsSync(artifactPath)) {
  throw new Error(`Artifact not found at ${artifactPath}. Did you run 'hardhat compile' first?`);
}

const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
const typesSrcDir = path.join(root, "packages", "contracts-types", "src");
const typesAbiDir = path.join(root, "packages", "contracts-types", "abi");

fs.mkdirSync(typesSrcDir, { recursive: true });
fs.mkdirSync(typesAbiDir, { recursive: true });

fs.writeFileSync(path.join(typesSrcDir, "ExamVault.json"), JSON.stringify(artifact, null, 2) + "\n");
fs.writeFileSync(path.join(typesAbiDir, "ExamVault.json"), JSON.stringify(artifact.abi, null, 2) + "\n");
console.log("Exported ExamVault ABI and Artifact to @sigil/contracts-types");
