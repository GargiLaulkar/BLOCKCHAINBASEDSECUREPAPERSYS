# SIGIL local demo

SIGIL is a local development prototype for time-locked, threshold-controlled custody of examination papers. This guide starts the chain, API, database, and web shell without creating sample exams or participant data.

## Prerequisites

- Node.js 20 or later
- Corepack with pnpm 9 (`corepack enable`)
- Git

For the database, use either Docker Desktop or an existing PostgreSQL server listening on localhost. `backend\.env` must contain a `DATABASE_URL`; if set, `dev:all` uses that database and does not start Docker. If it is absent, `dev:all` starts the PostgreSQL service from `docker-compose.yml` and requires Docker Desktop.

## First run: local PostgreSQL

Create a local database named `sigil`, then configure its connection in `backend\.env`:

```dotenv
DATABASE_URL=postgresql://USER:PASSWORD@127.0.0.1:5432/sigil?schema=public
```

Do not commit `backend\.env`. Use your local PostgreSQL credentials; they are read by the scripts but are not printed.

## First run: Docker PostgreSQL

From the repository root in PowerShell:

```powershell
corepack pnpm install
Copy-Item backend\.env.example backend\.env
corepack pnpm dev:all
```

For this path, leave `DATABASE_URL` unset in both the environment and `backend\.env`; the example configuration is for the PostgreSQL service in `docker-compose.yml`. The first start compiles and deploys `ExamVault`, starts/reuses the local Hardhat node, starts PostgreSQL with Docker Compose, applies database migrations, registers the local role accounts using Member 1's `demo:bootstrap-roles` task, then starts the API and web app. Open <http://localhost:5173>. The first run should take under 15 minutes on a typical development machine; subsequent starts reuse the existing local chain and database.

For either path, the orchestration loads `backend\.env` (without overriding environment variables), supplies the freshly deployed contract address and deployment block to the API process, and uses the configured `DATABASE_URL`.

The web shell only checks API health and shows the empty local-demo state. Create project data through the application as features become available; startup does not seed example users, exams, questions, papers, or statistics.

Press Ctrl+C to stop the API and web app and any chain process started by `dev:all`. PostgreSQL remains running in Docker or as your local service.

## Reset local demo state

With the local Hardhat chain and PostgreSQL available, run:

```powershell
corepack pnpm demo:reset
```

`demo:reset` requires `DATABASE_URL` to point to `localhost` or `127.0.0.1`, plus a local Hardhat chain (chain ID 31337). It resets that database by reapplying migrations with `--skip-seed`, resets the local chain, removes and recreates the configured `BLOB_DIR`, and deploys a fresh empty contract. It refuses remote database/RPC targets. It does not register roles or create any demo records. Restart the API after resetting if it was already running.

## Useful commands

```powershell
corepack pnpm dev:chain
corepack pnpm dev:api
corepack pnpm dev:web
corepack pnpm demo:bootstrap-roles
corepack pnpm test:auth-matrix
```

`dev:chain` and `demo:bootstrap-roles` are the existing contract-team commands. To use a non-default blob directory, set `BLOB_DIR` in `backend\.env`; `demo:reset` only permits a reset target inside `backend\` as a safety guard.
