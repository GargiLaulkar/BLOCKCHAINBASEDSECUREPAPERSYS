# FB-10: Playwright End-to-End Tests

## Setup

The repository uses the root `@playwright/test` dev dependency and a Chromium project in `playwright.config.ts`. The config starts its own Vite development server at `http://127.0.0.1:4173` and refuses to reuse another server. No backend, database, production wallet, or external blockchain is contacted by this suite.

Install the browser once after dependency installation:

```powershell
corepack pnpm exec playwright install chromium
```

## Commands

```powershell
corepack pnpm test:e2e
corepack pnpm test:e2e:headed
```

No application environment variables are required for the default suite. CI mode is detected through the standard `CI` environment variable to prohibit focused tests, enable one retry, and limit workers.

HTML report and failure traces/screenshots/videos are written to ignored `playwright-report/` and `test-results/` directories.

## Tests and mock boundaries

Nine Chromium tests cover:

- Public Verifier lookup, not-found and API-error states, plus sensitive event-value redaction.
- Unauthenticated protected-route gating and wrong-role denial.
- Authority, Centre, Holder and Auditor dashboard rendering, empty assignments and supported navigation.
- Centre station and Holder assignment empty states.
- Auditor Leak Tracer route access.
- Audit Log Explorer filter request, all-results CSV download initiation and success feedback.
- Evidence PDF download initiation, Decoy Manager empty history and Roster Proof page load.

All `/api/**` calls are intercepted by deterministic fixtures. Authenticated-route coverage uses a test-only session response. A read-only EIP-1193 shim supplies the Hardhat chain ID and deterministic `eth_call` results so the app's role guard can exercise its normal contract-read path. It has no signing capability. The tests do not make transactions and do not test backend authorization itself; backend authorization remains covered by backend tests.

No test treats fixture events or the mock wallet as live blockchain data. CSV/PDF tests verify that browser download initiation occurs, not that a user saved or inspected the file.

## Not covered / limitations

- These browser tests do not start a real backend or database and do not verify the local indexer against a chain. Use the backend and Hardhat suites for those boundaries.
- The Centre Paper Station is tested with no assigned exams. Protected generation, attestor signing, artifact delivery, and managed printing are unavailable and are not faked here.
- Holder tests do not submit shares, reveal values, or attempt release transactions.
- The dashboard test's role check uses deterministic read results rather than a deployed local ExamVault.
- Authentication tests exercise UI guard states with mocked `/api/auth/me`; they do not perform real SIWE signing.
- Retry on a live failed API, detailed Centre assignment ownership, and all individual error branches remain candidates for additional E2E coverage.

## Before the faculty demonstration

1. Ensure dependencies are installed with `corepack pnpm install`.
2. Ensure Chromium is installed with `corepack pnpm exec playwright install chromium` (once per machine).
3. Run `corepack pnpm test:e2e` from the repository root.
4. Review the terminal summary. If a test fails, inspect `test-results/` and the trace before presenting.

Passing these E2E tests demonstrates the tested UI journeys with controlled fixtures; it does not certify the complete application as production-ready.
