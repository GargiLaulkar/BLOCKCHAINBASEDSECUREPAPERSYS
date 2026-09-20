import ExamVaultArtifact from "./ExamVault.json";

export const ExamVaultABI = ExamVaultArtifact.abi;
export const ExamVaultBytecode = ExamVaultArtifact.bytecode;

export enum Role {
  ADMIN = 0,
  AUTHORITY = 1,
  SETTER = 2,
  HOLDER = 3,
  CENTRE = 4,
  AUDITOR = 5,
}

export enum ExamState {
  Draft = 0,
  Collecting = 1,
  Sealed = 2,
  Released = 3,
  Concluded = 4,
  Cancelled = 5,
}

export interface ExamConfig {
  metaHash: string;
  releaseOpensAt: bigint | number;
  examStartsAt: bigint | number;
  examEndsAt: bigint | number;
  threshold: number;
  holders: string[];
  setters: string[];
  centres: string[];
  quotas: number[];
}

export interface Exam {
  id: bigint;
  state: ExamState;
  authority: string;
  metaHash: string;
  releaseOpensAt: bigint;
  examStartsAt: bigint;
  examEndsAt: bigint;
  threshold: number;
  holderCount: number;
  bankHash: string;
  seed: string;
  examPublicKey: string;
  quotas: number[];
  releasedAt: bigint;
  concludedAt: bigint;
  cancellationReasonHash: string;
}

export interface Batch {
  batchId: bigint;
  setter: string;
  sectionId: number;
  ciphertextHash: string;
  questionCount: number;
  startInSection: number;
  submittedAt: bigint;
}

export { ExamVaultArtifact };
