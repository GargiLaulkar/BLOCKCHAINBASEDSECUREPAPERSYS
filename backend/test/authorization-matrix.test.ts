import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { join } from "node:path";
import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { Contract, ContractFactory, JsonRpcProvider, ethers } from "ethers";
import { SiweMessage } from "siwe";
import { canonical } from "@sigil/core";
import { createApp } from "../src/app.js";
import { parseConfig } from "../src/config.js";
import { clearRoleCache } from "../src/services/roles.js";

const dbState = vi.hoisted(() => ({
  exams: [] as any[],
}));

vi.mock("../src/db.js", () => ({
  prisma: {
    exam: {
      findMany: vi.fn(async () => dbState.exams),
      findUnique: vi.fn(async ({ where }: any) => dbState.exams.find((exam) => exam.examId === where.examId) ?? null),
      create: vi.fn(async ({ data }: any) => ({ ...data, createdAt: new Date(), updatedAt: new Date() })),
      upsert: vi.fn(async ({ create, update, where }: any) => {
        const existing = dbState.exams.find((exam) => exam.examId === where.examId);
        return { ...(existing ?? create), ...update, ...(existing ? {} : create), createdAt: new Date(), updatedAt: new Date() };
      }),
      count: vi.fn(async () => dbState.exams.length),
      groupBy: vi.fn(async () => []),
    },
    participant: {
      findUnique: vi.fn(async ({ where }: any) => ({
        address: where.address,
        displayName: "Matrix participant",
        organisation: "SIGIL test",
        profileHash: null,
      })),
      findMany: vi.fn(async () => []),
      update: vi.fn(async ({ where, data }: any) => ({ address: where.address, ...data })),
    },
    panelMember: {
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
    },
    batch: {
      findMany: vi.fn(async () => []),
      findUnique: vi.fn(async () => null),
      create: vi.fn(async ({ data }: any) => ({ id: "matrix-batch", batchId: null, ...data })),
      groupBy: vi.fn(async () => []),
    },
    encryptedShare: {
      findUnique: vi.fn(async () => null),
      upsert: vi.fn(async ({ create }: any) => ({ id: "matrix-share", ...create })),
    },
    chainEvent: {
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
      groupBy: vi.fn(async () => []),
    },
    leakTrace: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async ({ data }: any) => ({ id: "matrix-trace", ...data, createdAt: new Date() })),
    },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({})),
  },
}));

type MatrixActor = {
  name: string;
  signer?: ethers.JsonRpcSigner;
  address?: string;
  agent?: ReturnType<typeof request.agent>;
};

type MatrixEndpoint = {
  signature: string;
  method: "get" | "post" | "put";
  url: (actor: MatrixActor) => string;
  expectedStatus: (actor: MatrixActor) => number;
  body?: unknown;
  upload?: boolean;
};

const rpcUrl = process.env.SIGIL_AUTH_MATRIX_RPC_URL ?? "http://127.0.0.1:8545";
const provider = new JsonRpcProvider(rpcUrl);
const blobDir = join(tmpdir(), `sigil-auth-matrix-${process.pid}`);
const config = parseConfig({
  PORT: "4000",
  NODE_ENV: "test",
  RPC_URL: rpcUrl,
  CHAIN_ID: "31337",
  CONTRACT_ADDRESS: "0x0000000000000000000000000000000000000001",
  DEPLOY_BLOCK: "0",
  DATABASE_URL: "postgresql://sigil:sigil_password@localhost:5432/sigil_db?schema=public",
  SESSION_SECRET: "authorization-matrix-session-secret-long-enough",
  FRONTEND_ORIGIN: "http://localhost:5173",
  BLOB_DIR: blobDir,
});

const unauthenticated: MatrixActor = { name: "unauthenticated" };
const actors: MatrixActor[] = [
  unauthenticated,
  { name: "ADMIN" },
  { name: "AUTHORITY creator" },
  { name: "AUTHORITY non-creator" },
  { name: "SETTER assigned" },
  { name: "SETTER unassigned" },
  { name: "HOLDER assigned" },
  { name: "HOLDER unassigned" },
  { name: "CENTRE assigned before Released" },
  { name: "CENTRE assigned after Released" },
  { name: "CENTRE unassigned" },
  { name: "AUDITOR before Released" },
  { name: "AUDITOR after Released" },
  { name: "authenticated with no role" },
];

const examIds = { draft: "1", collecting: "2", released: "3" };
const apps = new Map<string, ReturnType<typeof createApp>>();
const endpointMatrix: MatrixEndpoint[] = [
  { signature: "GET /nonce", method: "get", url: () => "/api/auth/nonce", expectedStatus: () => 200 },
  { signature: "POST /verify", method: "post", url: () => "/api/auth/verify", expectedStatus: () => 400, body: {} },
  { signature: "GET /me", method: "get", url: () => "/api/auth/me", expectedStatus: (actor) => actor === unauthenticated ? 401 : 200 },
  { signature: "GET /health", method: "get", url: () => "/api/health", expectedStatus: () => 200 },
  { signature: "GET /api/openapi.json", method: "get", url: () => "/api/openapi.json", expectedStatus: () => 200 },
  { signature: "GET /events", method: "get", url: () => "/api/events", expectedStatus: () => 200 },
  { signature: "GET /stats/overview", method: "get", url: () => "/api/stats/overview", expectedStatus: (actor) => actor === unauthenticated ? 401 : 200 },
  { signature: "GET /stats/exams/:id/readiness", method: "get", url: () => `/api/stats/exams/${examIds.draft}/readiness`, expectedStatus: (actor) => actor === unauthenticated ? 401 : 200 },
  { signature: "GET /", method: "get", url: () => "/api/exams", expectedStatus: () => 200 },
  {
    signature: "GET /:id",
    method: "get",
    url: () => `/api/exams/${examIds.draft}`,
    expectedStatus: (actor) => actor === unauthenticated || ["AUTHORITY creator", "SETTER assigned", "HOLDER assigned", "CENTRE assigned before Released"].includes(actor.name) ? 200 : 403,
  },
  {
    signature: "POST /:id/meta",
    method: "post",
    url: () => `/api/exams/${examIds.draft}/meta`,
    expectedStatus: (actor) => actor === unauthenticated ? 401 : actor.name === "AUTHORITY creator" ? 200 : 403,
    body: "exam-meta",
  },
  {
    signature: "POST /:id/batches",
    method: "post",
    url: () => `/api/exams/${examIds.collecting}/batches`,
    expectedStatus: (actor) => actor === unauthenticated ? 401 : actor.name === "SETTER assigned" ? 201 : 403,
    upload: true,
  },
  {
    signature: "GET /:id/batches",
    method: "get",
    url: (actor) => `/api/exams/${["CENTRE assigned after Released", "AUDITOR after Released"].includes(actor.name) ? examIds.released : examIds.collecting}/batches`,
    expectedStatus: (actor) => actor === unauthenticated ? 401 : ["AUTHORITY creator", "CENTRE assigned after Released", "AUDITOR after Released"].includes(actor.name) ? 200 : 403,
  },
  {
    signature: "GET /:id/batches/:batchId/download",
    method: "get",
    url: (actor) => `/api/exams/${["CENTRE assigned after Released", "AUDITOR after Released"].includes(actor.name) ? examIds.released : examIds.collecting}/batches/missing-batch/download`,
    expectedStatus: (actor) => actor === unauthenticated ? 401 : ["AUTHORITY creator", "CENTRE assigned after Released", "AUDITOR after Released"].includes(actor.name) ? 404 : 403,
  },
  {
    signature: "GET /:id/shares/me",
    method: "get",
    url: () => `/api/exams/${examIds.draft}/shares/me`,
    expectedStatus: (actor) => actor === unauthenticated ? 401 : actor.name === "HOLDER assigned" ? 404 : 403,
  },
  {
    signature: "PUT /:id/shares",
    method: "put",
    url: () => `/api/exams/${examIds.draft}/shares`,
    expectedStatus: (actor) => actor === unauthenticated ? 401 : actor.name === "AUTHORITY creator" ? 400 : 403,
    body: {},
  },
  {
    signature: "POST /audit/traces",
    method: "post",
    url: () => "/api/audit/traces",
    expectedStatus: (actor) => actor === unauthenticated ? 401 : actor.name.startsWith("AUDITOR") ? 400 : 403,
    body: {},
  },
  {
    signature: "GET /audit/traces/:id",
    method: "get",
    url: () => "/api/audit/traces/missing-trace",
    expectedStatus: (actor) => actor === unauthenticated ? 401 : actor.name.startsWith("AUDITOR") ? 404 : 403,
  },
  {
    signature: "POST /profiles",
    method: "post",
    url: () => "/api/profiles",
    expectedStatus: (actor) => actor === unauthenticated ? 401 : 200,
    body: { displayName: "Matrix participant", organisation: "SIGIL test" },
  },
  {
    signature: "GET /profiles/:address",
    method: "get",
    url: (actor) => `/api/profiles/${actor.address ?? ethers.ZeroAddress}`,
    expectedStatus: (actor) => actor === unauthenticated ? 401 : 200,
  },
  { signature: "POST /logout", method: "post", url: () => "/api/auth/logout", expectedStatus: () => 200 },
];

function routeSignatures(app: ReturnType<typeof createApp>): string[] {
  const signatures: string[] = [];
  const addRoutes = (stack: any[]) => {
    for (const layer of stack) {
      if (layer.route) {
        const routePath = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
        const methods = [...new Set(layer.route.stack.map((routeLayer: any) => routeLayer.method).filter(Boolean))];
        for (const method of methods) {
          for (const path of routePath) signatures.push(`${method.toUpperCase()} ${path}`);
        }
      } else if (layer.name === "router" && Array.isArray(layer.handle?.stack)) {
        addRoutes(layer.handle.stack);
      }
    }
  };
  addRoutes((app as any)._router.stack);
  return signatures;
}

async function deployMatrixFixtures() {
  const artifactPath = resolve(process.cwd(), "../contracts/artifacts/contracts/ExamVault.sol/ExamVault.json");
  const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
  const signers = await Promise.all(Array.from({ length: 14 }, (_, index) => provider.getSigner(index)));
  const admin = signers[0];
  const contract = await new ContractFactory(artifact.abi, artifact.bytecode, admin).deploy(60n);
  await contract.waitForDeployment();

  const roleAccounts = [
    [signers[1], 1],
    [signers[2], 1],
    [signers[3], 2],
    [signers[4], 2],
    [signers[5], 3],
    [signers[6], 3],
    [signers[7], 4],
    [signers[8], 4],
    [signers[9], 4],
    [signers[10], 5],
  ] as const;
  for (const [signer, roleId] of roleAccounts) {
    await (await contract.registerParticipant(await signer.getAddress(), roleId, ethers.ZeroHash)).wait();
  }
  await (await contract.registerParticipant(await signers[12].getAddress(), 3, ethers.ZeroHash)).wait();
  await (await contract.registerParticipant(await signers[13].getAddress(), 3, ethers.ZeroHash)).wait();

  const assignedHolders = [await signers[5].getAddress(), await signers[12].getAddress(), await provider.getSigner(13).then((s) => s.getAddress())];
  for (const holder of assignedHolders) {
    const holderSigner = await provider.getSigner(holder);
    const key = ethers.concat([new Uint8Array([4]), ethers.randomBytes(64)]);
    await (await contract.connect(holderSigner).setEncryptionKey(key)).wait();
  }

  const latestBlock = await provider.getBlock("latest");
  if (!latestBlock) throw new Error("Hardhat node did not provide a latest block");
  const releaseOpensAt = BigInt(latestBlock.timestamp + 900);
  const examStartsAt = releaseOpensAt + 3600n;
  const examEndsAt = examStartsAt + 7200n;
  const setter = await signers[3].getAddress();
  const centreBefore = await signers[7].getAddress();
  const centreAfter = await signers[8].getAddress();
  const meta = {
    title: "Authorization matrix examination",
    sections: [{ name: "Section One", quota: 1 }],
    releaseOpensAt: Number(releaseOpensAt),
    examStartsAt: Number(examStartsAt),
    examEndsAt: Number(examEndsAt),
  };
  const createConfig = async (centres: string[]) => ({
    metaHash: canonical.keccakJson(meta),
    releaseOpensAt,
    examStartsAt,
    examEndsAt,
    threshold: 2,
    holders: assignedHolders,
    setters: [setter],
    centres,
    quotas: [1],
  });

  const authority = signers[1];
  for (const centres of [[centreBefore], [centreBefore], [centreAfter]]) {
    await (await contract.connect(authority).createExam(await createConfig(centres))).wait();
  }
  const ids = await Promise.all([1, 2, 3].map(async (id) => {
    const exam = await contract.getExam(id);
    return {
      examId: String(id),
      chainId: 31337,
      state: Number(exam.state),
      metaHash: exam.metaHash,
      metaJson: meta,
      releaseOpensAt: exam.releaseOpensAt,
      examStartsAt: exam.examStartsAt,
      examEndsAt: exam.examEndsAt,
      threshold: Number(exam.threshold),
      bankHash: null,
      seed: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }));
  dbState.exams = ids;

  for (const id of [2, 3]) {
    await (await contract.connect(authority).openCollection(id, ethers.concat([new Uint8Array([4]), ethers.randomBytes(64)]))).wait();
  }

  for (const [index, holder] of assignedHolders.entries()) {
    const share = ethers.toUtf8Bytes(`matrix-share-${index}`);
    const reveal = ethers.keccak256(ethers.toUtf8Bytes(`matrix-reveal-${index}`));
    const coder = ethers.AbiCoder.defaultAbiCoder();
    const shareCommitment = ethers.keccak256(coder.encode(["uint256", "address", "bytes"], [3, holder, share]));
    const randomnessCommitment = ethers.keccak256(coder.encode(["uint256", "address", "bytes32"], [3, holder, reveal]));
    await (await contract.connect(await provider.getSigner(holder)).commitRandomness(3, shareCommitment, randomnessCommitment)).wait();
  }
  await (await contract.connect(await provider.getSigner(setter)).submitBatch(3, 0, ethers.keccak256(ethers.toUtf8Bytes("matrix-batch")), 1)).wait();
  await (await contract.connect(authority).sealExam(3)).wait();
  await provider.send("evm_setNextBlockTimestamp", [Number(releaseOpensAt)]);
  for (const [index, holder] of assignedHolders.slice(0, 2).entries()) {
    const share = ethers.toUtf8Bytes(`matrix-share-${index}`);
    const reveal = ethers.keccak256(ethers.toUtf8Bytes(`matrix-reveal-${index}`));
    await (await contract.connect(await provider.getSigner(holder)).submitShare(3, share, reveal)).wait();
  }
  return { contract, signers, meta };
}

describe.skipIf(!process.env.SIGIL_AUTH_MATRIX_RPC_URL)("BE-12 authorization matrix (real local Hardhat chain)", () => {
  let chainContract: Contract;
  let signers: ethers.JsonRpcSigner[];
  let meta: Record<string, unknown>;

  beforeAll(async () => {
    await mkdir(blobDir, { recursive: false });
    const fixtures = await deployMatrixFixtures();
    chainContract = fixtures.contract;
    signers = fixtures.signers;
    meta = fixtures.meta;

    const signerByActor = new Map<string, ethers.JsonRpcSigner>([
      ["ADMIN", signers[0]],
      ["AUTHORITY creator", signers[1]],
      ["AUTHORITY non-creator", signers[2]],
      ["SETTER assigned", signers[3]],
      ["SETTER unassigned", signers[4]],
      ["HOLDER assigned", signers[5]],
      ["HOLDER unassigned", signers[6]],
      ["CENTRE assigned before Released", signers[7]],
      ["CENTRE assigned after Released", signers[8]],
      ["CENTRE unassigned", signers[9]],
      ["AUDITOR before Released", signers[10]],
      ["AUDITOR after Released", signers[10]],
      ["authenticated with no role", signers[11]],
    ]);

    for (const actor of actors.filter((candidate) => candidate !== unauthenticated)) {
      actor.signer = signerByActor.get(actor.name);
      if (!actor.signer) throw new Error(`Missing local signer for matrix actor ${actor.name}`);
      actor.address = await actor.signer.getAddress();
      const app = createApp(config, provider, chainContract);
      apps.set(actor.name, app);
      actor.agent = request.agent(app);
      const nonce = (await actor.agent.get("/api/auth/nonce")).body.nonce as string;
      const message = new SiweMessage({
        domain: "localhost:5173",
        address: actor.address,
        statement: "Sign in to SIGIL authorization matrix",
        uri: "http://localhost:5173",
        version: "1",
        chainId: 31337,
        nonce,
        issuedAt: new Date().toISOString(),
      }).prepareMessage();
      const signature = await actor.signer.signMessage(message);
      clearRoleCache(actor.address);
      const verified = await actor.agent.post("/api/auth/verify").send({ message, signature });
      expect(verified.status, `${actor.name} should authenticate against chain roles`).toBe(200);
    }
    const unauthApp = createApp(config, provider, chainContract);
    apps.set(unauthenticated.name, unauthApp);
  });

  afterAll(async () => {
    await rm(blobDir, { recursive: true, force: true });
    await provider.destroy();
  });

  it("has an explicit matrix row for every mounted API route", () => {
    const inventory = routeSignatures(apps.get("ADMIN")!);
    const covered = endpointMatrix.map((endpoint) => endpoint.signature);
    const counts = (items: string[]) => new Map([...new Set(items)].map((signature) => [signature, items.filter((item) => item === signature).length]));
    expect(counts(covered)).toEqual(counts(inventory));
  });

  it.each(endpointMatrix.flatMap((endpoint) =>
    actors.map((actor) => ({ endpoint, actor }))
  ))("$endpoint.signature as $actor.name", async ({ endpoint, actor }) => {
    const app = apps.get(actor.name)!;
    let call = actor.agent
      ? actor.agent[endpoint.method](endpoint.url(actor))
      : request(app)[endpoint.method](endpoint.url(actor));

    if (endpoint.upload) {
      call = call
        .field("sectionId", "0")
        .field("questionCount", "1")
        .attach("file", Buffer.from("matrix-ciphertext"), { filename: "batch.bin", contentType: "application/octet-stream" });
    } else if (endpoint.body === "exam-meta") {
      call = call.send(meta);
    } else if (endpoint.body !== undefined) {
      call = call.send(endpoint.body);
    }

    const response = await call;
    expect(response.status, `${endpoint.signature} as ${actor.name}`).toBe(endpoint.expectedStatus(actor));
  });
});
