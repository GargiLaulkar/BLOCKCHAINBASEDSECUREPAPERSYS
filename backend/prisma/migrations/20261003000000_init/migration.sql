-- CreateTable
CREATE TABLE "Exam" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "examId" TEXT NOT NULL,
    "metaHash" TEXT NOT NULL,
    "metaJson" JSONB,
    "state" INTEGER NOT NULL DEFAULT 0,
    "releaseOpensAt" BIGINT NOT NULL,
    "examStartsAt" BIGINT NOT NULL,
    "examEndsAt" BIGINT NOT NULL,
    "threshold" INTEGER NOT NULL,
    "bankHash" TEXT,
    "seed" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Exam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Participant" (
    "address" TEXT NOT NULL,
    "roles" JSONB NOT NULL,
    "displayName" TEXT,
    "organisation" TEXT,
    "profileHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Participant_pkey" PRIMARY KEY ("address")
);

-- CreateTable
CREATE TABLE "PanelMember" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PanelMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Batch" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "batchId" BIGINT,
    "sectionId" INTEGER NOT NULL,
    "setter" TEXT NOT NULL,
    "ciphertextHash" TEXT NOT NULL,
    "questionCount" INTEGER NOT NULL,
    "startInSection" INTEGER NOT NULL,
    "blobPath" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "txHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EncryptedShare" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "holder" TEXT NOT NULL,
    "envelope" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EncryptedShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChainEvent" (
    "id" TEXT NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "txHash" TEXT NOT NULL,
    "examId" TEXT,
    "type" TEXT NOT NULL,
    "actor" TEXT,
    "payloadJson" JSONB NOT NULL,
    "blockTimestamp" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChainEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeakTrace" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "auditor" TEXT NOT NULL,
    "evidenceHash" TEXT NOT NULL,
    "resultJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeakTrace_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Exam_examId_key" ON "Exam"("examId");

-- CreateIndex
CREATE UNIQUE INDEX "PanelMember_examId_address_kind_key" ON "PanelMember"("examId", "address", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Batch_examId_sectionId_ciphertextHash_key" ON "Batch"("examId", "sectionId", "ciphertextHash");

-- CreateIndex
CREATE UNIQUE INDEX "EncryptedShare_examId_holder_key" ON "EncryptedShare"("examId", "holder");

-- CreateIndex
CREATE UNIQUE INDEX "ChainEvent_txHash_logIndex_key" ON "ChainEvent"("txHash", "logIndex");
