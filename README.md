# SIGIL local demo

SIGIL is a local development prototype for time-locked, threshold-controlled custody of examination papers. This guide starts the chain, API, database, and web shell without creating sample exams or participant data.

## Prerequisites

- Node.js 20 or later
- Corepack with pnpm 9 (`corepack enable`)
- Docker Desktop (running)
- Git

## First run

From the repository root in PowerShell:

```powershell
corepack pnpm install
Copy-Item backend\.env.example backend\.env
corepack pnpm dev:all
```

The first start compiles and deploys `ExamVault`, starts the local Hardhat node and PostgreSQL, applies database migrations, registers the local role accounts using Member 1's `demo:bootstrap-roles` task, then starts the API and web app. Open <http://localhost:5173>. The first run should take under 15 minutes on a typical development machine; subsequent starts reuse the existing local chain and database.

`backend\.env` is local configuration and must not be committed. The example file uses the PostgreSQL service from `docker-compose.yml`. The orchestration supplies the freshly deployed contract address and deployment block to the API process.

The web shell only checks API health and shows the empty local-demo state. Create project data through the application as features become available; startup does not seed example users, exams, questions, papers, or statistics.

Press Ctrl+C to stop the API and web app and any chain process started by `dev:all`. PostgreSQL remains running in Docker.

## Reset local demo state

With the local Hardhat chain and PostgreSQL available, run:

```powershell
corepack pnpm demo:reset
```

This resets the local chain, resets PostgreSQL by reapplying migrations without seed scripts, removes and recreates the configured `BLOB_DIR`, and deploys a fresh empty contract. It does not register roles or create any demo records. Restart the API after resetting if it was already running.

## Useful commands

```powershell
corepack pnpm dev:chain
corepack pnpm dev:api
corepack pnpm dev:web
corepack pnpm demo:bootstrap-roles
corepack pnpm test:auth-matrix
```

`dev:chain` and `demo:bootstrap-roles` are the existing contract-team commands. To use a non-default blob directory, set `BLOB_DIR` in `backend\.env`; `demo:reset` only permits a reset target inside `backend\` as a safety guard.
