import * as fs from "fs";
import * as path from "path";

interface CoverageData {
  s: Record<string, number>;
  l?: Record<string, number>;
  b: Record<string, number[]>;
  f: Record<string, number>;
}

const LINE_THRESHOLD = 95.0;
const BRANCH_THRESHOLD = 90.0;

function main() {
  const coveragePaths = [
    path.join(__dirname, "..", "coverage.json"),
    path.join(__dirname, "..", "coverage", "coverage-final.json"),
  ];

  let coverageFile = "";
  for (const p of coveragePaths) {
    if (fs.existsSync(p)) {
      coverageFile = p;
      break;
    }
  }

  if (!coverageFile) {
    console.error("❌ Error: Coverage file (coverage.json or coverage/coverage-final.json) not found.");
    console.error("   Run 'npx hardhat coverage' first.");
    process.exit(1);
  }

  console.log(`Reading coverage report from: ${coverageFile}`);
  const rawData = JSON.parse(fs.readFileSync(coverageFile, "utf-8")) as Record<string, CoverageData>;

  let totalStatements = 0;
  let hitStatements = 0;
  let totalLines = 0;
  let hitLines = 0;
  let totalBranches = 0;
  let hitBranches = 0;
  let totalFunctions = 0;
  let hitFunctions = 0;

  console.log("\n=================== Smart Contract Coverage Summary ===================");
  console.log(
    "File".padEnd(25) +
    " | " +
    "Statements".padEnd(12) +
    " | " +
    "Branches".padEnd(12) +
    " | " +
    "Functions".padEnd(12) +
    " | " +
    "Lines"
  );
  console.log("-".repeat(75));

  for (const [filePath, cov] of Object.entries(rawData)) {
    const fileName = path.basename(filePath);

    // Statements
    const stmts = Object.values(cov.s);
    const fileTotalStmts = stmts.length;
    const fileHitStmts = stmts.filter((c) => c > 0).length;
    totalStatements += fileTotalStmts;
    hitStatements += fileHitStmts;

    // Lines
    let fileTotalLines = 0;
    let fileHitLines = 0;
    if (cov.l) {
      const lines = Object.values(cov.l);
      fileTotalLines = lines.length;
      fileHitLines = lines.filter((c) => c > 0).length;
    } else {
      fileTotalLines = fileTotalStmts;
      fileHitLines = fileHitStmts;
    }
    totalLines += fileTotalLines;
    hitLines += fileHitLines;

    // Branches
    let fileTotalBranches = 0;
    let fileHitBranches = 0;
    for (const b of Object.values(cov.b)) {
      fileTotalBranches += b.length;
      fileHitBranches += b.filter((c) => c > 0).length;
    }
    totalBranches += fileTotalBranches;
    hitBranches += fileHitBranches;

    // Functions
    const fns = Object.values(cov.f);
    const fileTotalFns = fns.length;
    const fileHitFns = fns.filter((c) => c > 0).length;
    totalFunctions += fileTotalFns;
    hitFunctions += fileHitFns;

    const fileStmtPct = fileTotalStmts > 0 ? (fileHitStmts / fileTotalStmts) * 100 : 100;
    const fileLinePct = fileTotalLines > 0 ? (fileHitLines / fileTotalLines) * 100 : 100;
    const fileBranchPct = fileTotalBranches > 0 ? (fileHitBranches / fileTotalBranches) * 100 : 100;
    const fileFnPct = fileTotalFns > 0 ? (fileHitFns / fileTotalFns) * 100 : 100;

    console.log(
      fileName.padEnd(25) +
      " | " +
      `${fileStmtPct.toFixed(2)}%`.padEnd(12) +
      " | " +
      `${fileBranchPct.toFixed(2)}%`.padEnd(12) +
      " | " +
      `${fileFnPct.toFixed(2)}%`.padEnd(12) +
      " | " +
      `${fileLinePct.toFixed(2)}%`
    );
  }

  console.log("-".repeat(75));

  const totalStmtPct = totalStatements > 0 ? (hitStatements / totalStatements) * 100 : 100;
  const totalLinePct = totalLines > 0 ? (hitLines / totalLines) * 100 : 100;
  const totalBranchPct = totalBranches > 0 ? (hitBranches / totalBranches) * 100 : 100;
  const totalFnPct = totalFunctions > 0 ? (hitFunctions / totalFunctions) * 100 : 100;

  console.log(
    "TOTAL".padEnd(25) +
    " | " +
    `${totalStmtPct.toFixed(2)}%`.padEnd(12) +
    " | " +
    `${totalBranchPct.toFixed(2)}%`.padEnd(12) +
    " | " +
    `${totalFnPct.toFixed(2)}%`.padEnd(12) +
    " | " +
    `${totalLinePct.toFixed(2)}%`
  );
  console.log("=======================================================================\n");

  console.log(`Thresholds Check:`);
  console.log(`  - Lines:    ${totalLinePct.toFixed(2)}% (Target: >= ${LINE_THRESHOLD}%)`);
  console.log(`  - Branches: ${totalBranchPct.toFixed(2)}% (Target: >= ${BRANCH_THRESHOLD}%)`);

  let failed = false;
  if (totalLinePct < LINE_THRESHOLD) {
    console.error(`❌ FAILED: Line coverage (${totalLinePct.toFixed(2)}%) is below required threshold (${LINE_THRESHOLD}%).`);
    failed = true;
  }
  if (totalBranchPct < BRANCH_THRESHOLD) {
    console.error(`❌ FAILED: Branch coverage (${totalBranchPct.toFixed(2)}%) is below required threshold (${BRANCH_THRESHOLD}%).`);
    failed = true;
  }

  if (failed) {
    process.exit(1);
  }

  console.log(`✅ SUCCESS: All smart contract coverage thresholds are met!`);
}

main();
