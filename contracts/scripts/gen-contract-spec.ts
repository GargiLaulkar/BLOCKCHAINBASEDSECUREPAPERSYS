import * as fs from "fs";
import * as path from "path";

interface AbiInput {
  name: string;
  type: string;
  indexed?: boolean;
  components?: AbiInput[];
  internalType?: string;
}

interface AbiItem {
  type: string;
  name?: string;
  inputs?: AbiInput[];
  outputs?: AbiInput[];
  stateMutability?: string;
  anonymous?: boolean;
}

interface FunctionMetadata {
  caller: string;
  stateRequirements: string;
  eventsEmitted: string[];
}

const FUNCTION_RULES: Record<string, FunctionMetadata> = {
  registerParticipant: {
    caller: "ADMIN (`DEFAULT_ADMIN_ROLE`)",
    stateRequirements: "None (Global participant registry)",
    eventsEmitted: ["ParticipantRegistered"],
  },
  revokeParticipant: {
    caller: "ADMIN (`DEFAULT_ADMIN_ROLE`)",
    stateRequirements: "Account must hold role; if HOLDER, caller must not be in active live exams (`liveExamCount == 0`)",
    eventsEmitted: ["ParticipantRevoked"],
  },
  setEncryptionKey: {
    caller: "HOLDER (`HOLDER_ROLE`)",
    stateRequirements: "Caller must not be assigned to an active live exam (`liveExamCount == 0`)",
    eventsEmitted: ["EncryptionKeySet"],
  },
  createExam: {
    caller: "AUTHORITY (`AUTHORITY_ROLE`)",
    stateRequirements: "None (Initializes new exam in `Draft` state)",
    eventsEmitted: ["ExamCreated", "PanelAssigned"],
  },
  openCollection: {
    caller: "Creating Authority (`exam.authority`)",
    stateRequirements: "Exam state must be `Draft`; `block.timestamp < releaseOpensAt`",
    eventsEmitted: ["CollectionOpened"],
  },
  commitRandomness: {
    caller: "Assigned Panel Holder (`isHolder[examId][msg.sender]`)",
    stateRequirements: "Exam state must be `Collecting`; `block.timestamp < releaseOpensAt`",
    eventsEmitted: ["RandomnessCommitted"],
  },
  submitBatch: {
    caller: "Assigned Panel Setter (`isSetter[examId][msg.sender]`)",
    stateRequirements: "Exam state must be `Collecting`; `block.timestamp < releaseOpensAt`",
    eventsEmitted: ["BatchSubmitted"],
  },
  sealExam: {
    caller: "Creating Authority (`exam.authority`)",
    stateRequirements: "Exam state must be `Collecting`; `block.timestamp < releaseOpensAt`; all section question counts strictly equal quotas; all assigned panel holders have committed randomness",
    eventsEmitted: ["ExamSealed"],
  },
  submitShare: {
    caller: "Assigned Panel Holder (`isHolder[examId][msg.sender]`)",
    stateRequirements: "Exam state must be `Sealed` or `Released`; `releaseOpensAt <= block.timestamp <= examEndsAt`; share matches stored share commitment; reveal matches stored randomness commitment",
    eventsEmitted: ["ShareSubmitted", "PaperReleased (on t-th submission)"],
  },
  registerCopy: {
    caller: "Assigned Panel Centre (`isCentre[examId][msg.sender]`)",
    stateRequirements: "Exam state must be `Released`; `block.timestamp <= examEndsAt`; centre has not registered a copy yet; variantHash not already registered by another centre",
    eventsEmitted: ["CopyRegistered"],
  },
  publishRoster: {
    caller: "Creating Authority (`exam.authority`)",
    stateRequirements: "Exam state must be `Draft`, `Collecting`, or `Sealed`; roster root not zero; not already published",
    eventsEmitted: ["RosterPublished"],
  },
  registerDecoy: {
    caller: "Creating Authority (`exam.authority`)",
    stateRequirements: "Exam state must be `Sealed` or `Released`; decoyHash not zero",
    eventsEmitted: ["DecoyRegistered"],
  },
  reportLeak: {
    caller: "AUDITOR (`AUDITOR_ROLE`)",
    stateRequirements: "Exam state must be `Released`, `Concluded`, or `Cancelled`; evidenceHash not zero; if suspectCentre is non-zero, centre must have registered a copy matching matchedVariantHash",
    eventsEmitted: ["LeakReported"],
  },
  concludeExam: {
    caller: "Creating Authority (`exam.authority`)",
    stateRequirements: "Exam state must be `Released`; `block.timestamp > examEndsAt`",
    eventsEmitted: ["ExamConcluded"],
  },
  cancelExam: {
    caller: "Creating Authority (`exam.authority`)",
    stateRequirements: "Exam state must not be `Cancelled`; reasonHash not zero",
    eventsEmitted: ["ExamCancelled"],
  },
};

const ERROR_DESCRIPTIONS: Record<string, string> = {
  NotAssigned: "Caller or specified account lacks the required role or is not assigned to the exam panel.",
  WrongState: "The exam is in an incompatible state for the requested operation.",
  TooEarly: "Current block timestamp is before the minimum required timestamp (e.g. before releaseOpensAt or concludeExam before examEndsAt).",
  TooLate: "Current block timestamp exceeds the allowed window (e.g. share submission or copy registration after examEndsAt).",
  InvalidTimes: "Provided timestamps violate time sequence invariant (`now + minLeadSeconds <= releaseOpensAt < examStartsAt < examEndsAt`).",
  InvalidThreshold: "Threshold $t$ is outside valid bounds ($n/2 < t \\le n$).",
  InvalidPanel: "Panel configuration violates minimum requirements (holders count $< 3$ or $> 20$, empty setters, or empty centres).",
  DuplicateEntry: "A duplicate entity was encountered (duplicate role, duplicate panel member, repeated ciphertext hash, or duplicate copy registration).",
  InvalidKeyFormat: "Encryption public key is not a 65-byte uncompressed P-256 key starting with prefix byte `0x04`.",
  InvalidShare: "Submitted Shamir share does not match the stored share commitment.",
  InvalidReveal: "Submitted randomness reveal preimage does not match the stored randomness commitment.",
  AlreadySubmitted: "The caller or authority has already submitted or committed this item for the given exam.",
  QuotaNotMet: "Section question count does not meet or exceeds the exact configured quota upon sealing.",
  MissingCommitment: "One or more assigned panel holders have not committed their randomness prior to sealing.",
  ZeroValue: "A required parameter contains an empty value, zero address, or zero hash.",
  HolderInLiveExam: "A holder cannot have their role revoked or encryption key updated while assigned to an active live exam (`Draft`, `Collecting`, `Sealed`).",
  InvalidRole: "An invalid role integer ($> 5$) was provided to participant registration.",
  CannotGrantAdmin: "Cannot grant DEFAULT_ADMIN_ROLE (`0x00`) through participant registration.",
  ExamNotFound: "Referenced exam ID does not exist (`examId == 0` or `examId >= nextExamId`).",
  InvalidQuotas: "Quotas array length is invalid ($0$ or $> 8$) or contains a quota of $0$.",
  BatchNotFound: "Referenced question batch ID is out of bounds.",
  CopyMismatch: "Auditor leak report suspect centre copy has not registered, or matched variant hash does not match the centre's registered copy.",
};

const EVENT_DESCRIPTIONS: Record<string, string> = {
  ParticipantRegistered: "Emitted when a new participant is assigned a role by the Admin.",
  ParticipantRevoked: "Emitted when an Admin revokes a participant role.",
  EncryptionKeySet: "Emitted when a Holder registers or updates their 65-byte uncompressed P-256 public key.",
  ExamCreated: "Emitted when an Authority creates an exam with configuration metadata and schedule.",
  PanelAssigned: "Emitted alongside ExamCreated listing all assigned panel holders, setters, and centres.",
  CollectionOpened: "Emitted when the Authority opens the collection phase with the exam public key.",
  RandomnessCommitted: "Emitted when an assigned holder commits their share and randomness commitments.",
  BatchSubmitted: "Emitted when an assigned setter submits an encrypted question batch.",
  ExamSealed: "Emitted when the Authority seals the question bank under bankHash.",
  ShareSubmitted: "Emitted when an assigned holder submits their Shamir share and randomness reveal.",
  PaperReleased: "Emitted when the threshold t-th share arrives, releasing the canonical seed.",
  CopyRegistered: "Emitted when an assigned centre registers its structurally unique paper variant.",
  DecoyRegistered: "Emitted when the Authority registers a decoy honeypot paper hash.",
  RosterPublished: "Emitted when the Authority publishes the candidate roster Merkle root.",
  LeakReported: "Emitted when an Auditor files an on-chain leak report against an exam.",
  ExamConcluded: "Emitted when an exam is concluded by the Authority after the exam ends.",
  ExamCancelled: "Emitted when an exam is cancelled by the Authority with a reason hash.",
};

function formatType(input: AbiInput): string {
  if (input.type === "tuple") {
    const components = input.components?.map(formatType).join(", ") ?? "";
    return `(${components})`;
  }
  if (input.type === "tuple[]") {
    const components = input.components?.map(formatType).join(", ") ?? "";
    return `(${components})[]`;
  }
  return input.type;
}

function getMethodSignature(item: AbiItem): string {
  const params = item.inputs?.map((i) => formatType(i)).join(",") ?? "";
  return `${item.name}(${params})`;
}

function main() {
  const buildInfoDir = path.join(__dirname, "..", "artifacts", "build-info");
  if (!fs.existsSync(buildInfoDir)) {
    console.error("❌ Error: build-info directory not found. Run 'npx hardhat compile' first.");
    process.exit(1);
  }

  const buildInfoFiles = fs.readdirSync(buildInfoDir).filter((f) => f.endsWith(".json"));
  if (buildInfoFiles.length === 0) {
    console.error("❌ Error: No build-info files found.");
    process.exit(1);
  }

  const latestBuildInfo = JSON.parse(
    fs.readFileSync(path.join(buildInfoDir, buildInfoFiles[0]), "utf-8")
  );

  const contractOutput =
    latestBuildInfo.output?.contracts?.["contracts/ExamVault.sol"]?.["ExamVault"];

  if (!contractOutput) {
    console.error("❌ Error: ExamVault contract output not found in build-info.");
    process.exit(1);
  }

  const abi: AbiItem[] = contractOutput.abi;
  const metadata = JSON.parse(contractOutput.metadata);
  const userdoc = metadata.output?.userdoc ?? {};
  const devdoc = metadata.output?.devdoc ?? {};

  const specChangesPath = path.join(__dirname, "..", "..", "docs", "contract-spec-changes.md");
  let specChangesContent = "";
  if (fs.existsSync(specChangesPath)) {
    specChangesContent = fs.readFileSync(specChangesPath, "utf-8");
  }

  let out = "";
  out += `# ExamVault Contract Specification\n\n`;
  out += `> **AUTO-GENERATED FILE — DO NOT EDIT DIRECTLY**\n`;
  out += `> Generated by \`contracts/scripts/gen-contract-spec.ts\` from compiled ABI, AST, and NatSpec.\n\n`;
  out += `## 1. Overview\n\n`;
  out += `- **Contract Name:** \`ExamVault\`\n`;
  out += `- **Solidity Version:** \`^0.8.24\`\n`;
  out += `- **Access Control:** OpenZeppelin v5 \`AccessControl\`\n`;
  out += `- **Notice:** ${userdoc.notice || "Time-locked, threshold-controlled custody of examination papers on a blockchain ledger."}\n\n`;

  out += `## 2. State Machine\n\n`;
  out += `\`ExamVault\` governs examinations through a 6-state finite state machine:\n\n`;
  out += `| State ID | State Name | Description |\n`;
  out += `|---|---|---|\n`;
  out += `| \`0\` | \`Draft\` | Initial configuration created by Authority with panels and quotas. |\n`;
  out += `| \`1\` | \`Collecting\` | Key generation ceremony active; setters submit encrypted question batches. |\n`;
  out += `| \`2\` | \`Sealed\` | Question bank quotas and holder commitments verified and sealed under \`bankHash\`. |\n`;
  out += `| \`3\` | \`Released\` | Threshold $t$ shares submitted; canonical \`seed\` derived for paper selection. |\n`;
  out += `| \`4\` | \`Concluded\` | Examination window has elapsed (\`block.timestamp > examEndsAt\`). |\n`;
  out += `| \`5\` | \`Cancelled\` | Exam cancelled by Authority with recorded reason hash. |\n\n`;

  out += `### State Transition Table\n\n`;
  out += `| From State | To State | Trigger Function | Authorized Caller | Preconditions |\n`;
  out += `|---|---|---|---|---|\n`;
  out += `| \`None\` | \`Draft\` | \`createExam\` | \`AUTHORITY_ROLE\` | Valid lead time, unique panel roles, valid quotas |\n`;
  out += `| \`Draft\` | \`Collecting\` | \`openCollection\` | Creating Authority | Valid 65-byte uncompressed P-256 public key |\n`;
  out += `| \`Collecting\` | \`Sealed\` | \`sealExam\` | Creating Authority | Quotas strictly satisfied; all holders committed randomness |\n`;
  out += `| \`Sealed\` | \`Released\` | \`submitShare\` | Assigned \`HOLDER_ROLE\` | $t$-th valid share/reveal submitted in release window |\n`;
  out += `| \`Released\` | \`Concluded\` | \`concludeExam\` | Creating Authority | \`block.timestamp > examEndsAt\` |\n`;
  out += `| Any except \`Cancelled\` | \`Cancelled\` | \`cancelExam\` | Creating Authority | \`reasonHash != bytes32(0)\` |\n\n`;

  out += `## 3. External Functions\n\n`;

  const functions = abi.filter((item) => item.type === "function");
  const mutatingFunctions = functions.filter(
    (f) => f.stateMutability !== "view" && f.stateMutability !== "pure"
  );
  const viewFunctions = functions.filter(
    (f) => f.stateMutability === "view" || f.stateMutability === "pure"
  );

  // Group mutating functions into Core ExamVault and AccessControl
  const domainMutating = mutatingFunctions.filter((f) => !["grantRole", "revokeRole", "renounceRole"].includes(f.name || ""));
  const accessControlMutating = mutatingFunctions.filter((f) => ["grantRole", "revokeRole", "renounceRole"].includes(f.name || ""));

  out += `### 3.1 State Mutating Functions\n\n`;

  for (const fn of domainMutating) {
    const sig = getMethodSignature(fn);
    const userNotice = userdoc.methods?.[sig]?.notice || userdoc.methods?.[fn.name!]?.notice || "";
    const devDocItem = devdoc.methods?.[sig] || devdoc.methods?.[fn.name!] || {};
    const devDetails = devDocItem.details || "";
    const meta = FUNCTION_RULES[fn.name!] || {
      caller: "AccessControl / Role Restricted",
      stateRequirements: "See dev details",
      eventsEmitted: [],
    };

    out += `#### \`${fn.name}\`\n\n`;
    out += `\`\`\`solidity\nfunction ${fn.name}(${fn.inputs?.map((i) => `${formatType(i)} ${i.name}`).join(", ") || ""}) external\n\`\`\`\n\n`;
    out += `- **Authorized Caller:** ${meta.caller}\n`;
    out += `- **State Requirements / Preconditions:** ${meta.stateRequirements}\n`;
    out += `- **Events Emitted:** ${meta.eventsEmitted.length > 0 ? meta.eventsEmitted.map((e) => `\`${e}\``).join(", ") : "None"}\n`;
    if (userNotice) out += `- **User Notice:** ${userNotice}\n`;
    if (devDetails) out += `- **Dev Details:** ${devDetails}\n`;
    out += `\n`;

    if (fn.inputs && fn.inputs.length > 0) {
      out += `**Parameters:**\n\n`;
      out += `| Name | Type | Description |\n`;
      out += `|---|---|---|\n`;
      for (const input of fn.inputs) {
        const paramDesc = devDocItem.params?.[input.name] || "";
        out += `| \`${input.name}\` | \`${formatType(input)}\` | ${paramDesc || "-"} |\n`;
      }
      out += `\n`;
    }
  }

  if (accessControlMutating.length > 0) {
    out += `### 3.2 AccessControl Functions\n\n`;
    for (const fn of accessControlMutating) {
      const sig = getMethodSignature(fn);
      const devDocItem = devdoc.methods?.[sig] || devdoc.methods?.[fn.name!] || {};
      out += `#### \`${fn.name}\`\n\n`;
      out += `\`\`\`solidity\nfunction ${fn.name}(${fn.inputs?.map((i) => `${formatType(i)} ${i.name}`).join(", ") || ""}) external\n\`\`\`\n\n`;
      if (devDocItem.details) out += `**Details:** ${devDocItem.details}\n\n`;
    }
  }

  out += `### 3.3 View and Query Functions\n\n`;
  out += `| Function | Parameters | Returns | Notice |\n`;
  out += `|---|---|---|---|\n`;

  for (const fn of viewFunctions) {
    const sig = getMethodSignature(fn);
    const userNotice = userdoc.methods?.[sig]?.notice || userdoc.methods?.[fn.name!]?.notice || "";
    const inputsStr = fn.inputs?.map((i) => `\`${formatType(i)} ${i.name}\``).join(", ") || "None";
    const outputsStr = fn.outputs?.map((o) => `\`${formatType(o)}${o.name ? ` ${o.name}` : ""}\``).join(", ") || "void";
    out += `| \`${fn.name}\` | ${inputsStr} | ${outputsStr} | ${userNotice || "-"} |\n`;
  }
  out += `\n`;

  out += `## 4. Events Specification\n\n`;
  out += `| Event Name | Signature | Description |\n`;
  out += `|---|---|---|\n`;

  const events = abi.filter((item) => item.type === "event");
  for (const ev of events) {
    const params = ev.inputs?.map((i) => `${i.indexed ? "indexed " : ""}${formatType(i)} ${i.name}`).join(", ") || "";
    const desc = EVENT_DESCRIPTIONS[ev.name!] || "Standard lifecycle event";
    out += `| \`${ev.name}\` | \`${ev.name}(${params})\` | ${desc} |\n`;
  }
  out += `\n`;

  out += `## 5. Custom Errors Specification\n\n`;
  out += `| Custom Error | Parameters | Description |\n`;
  out += `|---|---|---|\n`;

  const errors = abi.filter((item) => item.type === "error");
  for (const err of errors) {
    const params = err.inputs?.map((i) => `${formatType(i)} ${i.name}`).join(", ") || "";
    const desc = ERROR_DESCRIPTIONS[err.name!] || "Custom revert condition";
    out += `| \`${err.name}(${params})\` | ${err.inputs?.map((i) => `\`${i.name}\` (${formatType(i)})`).join(", ") || "None"} | ${desc} |\n`;
  }
  out += `\n`;

  out += `## 6. Differences from Master Spec Section 7\n\n`;
  out += `Below is the recorded list of additive items, refined state rules, and interface precision adjustments tracked in \`docs/contract-spec-changes.md\`:\n\n`;
  out += specChangesContent;
  out += `\n`;

  const targetPath = path.join(__dirname, "..", "..", "docs", "contract-spec.md");
  fs.writeFileSync(targetPath, out);
  console.log(`✅ Generated contract specification at: ${targetPath}`);
}

main();
