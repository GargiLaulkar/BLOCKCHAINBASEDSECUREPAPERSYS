# @sigil/contracts-types

Type definitions, TypeChain typings, and contract ABIs for the **SIGIL ExamVault** smart contracts.

## Overview

This package exposes the TypeScript types, ABI, and bytecode for the `ExamVault` contract, allowing the frontend (`frontend/`) and backend services (`backend/`) to interact with deployed contracts safely and with full type completion.

## How to Run a Local Node and Deploy

### 1. Start Local Hardhat Node

From the repository root or the `contracts/` directory:

```bash
cd contracts
npx hardhat node
```

This starts a JSON-RPC node on `http://127.0.0.1:8545` with 20 funded test accounts and chain ID `31337`.

### 2. Deploy Contracts

In a separate terminal window:

```bash
cd contracts
npx hardhat run scripts/deploy.ts --network localhost
```

This will:
- Deploy `ExamVault` with configured `minLeadSeconds` (default: 60s for local testing).
- Record the deployment address, block number, and chain ID in `contracts/deployments/localhost.json`.
- Export ABI artifacts into `@sigil/contracts-types`.

### 3. Bootstrap Roles (Demo / Local Testing)

To assign test accounts to the 5 system roles (`AUTHORITY`, `SETTER`, `HOLDER`, `CENTRE`, `AUDITOR`):

```bash
cd contracts
npx hardhat demo:bootstrap-roles --network localhost
```

### 4. Advance Time (Local Testing)

To jump forward through exam lifecycle windows on the local node:

```bash
cd contracts
npx hardhat demo:advance-time --seconds 3600 --network localhost
```

*(Note: `demo:advance-time` strictly refuses to run on non-local networks to prevent unintended state manipulation).*

## Using the Types in Backend or Frontend

Import types, ABI, and contract factory from this package:

```typescript
import { ethers } from "ethers";
import { ExamVaultABI, ExamState, Role } from "@sigil/contracts-types";
import localhostDeployment from "@sigil/contracts/deployments/localhost.json";

// Connect to deployed contract
const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
const examVault = new ethers.Contract(localhostDeployment.address, ExamVaultABI, provider);

// Read exam details
const exam = await examVault.getExam(1);
console.log("Exam state:", ExamState[exam.state]);
```
