# Ready-to-send team messages

## To Members 4 and 5

The OpenAPI contract at `docs/api/openapi.json` and generated client types at `frontend/src/api/generated.ts` are final. Any interface change needs an Interface Change Request under section 16 before implementation. To run locally, configure the ignored `backend/.env`, then run `corepack pnpm dev:all`; it starts the local chain/API/web and bootstraps the configured demo chain roles. Do not share or commit `.env` contents.

## To Member 1

Member 3's BE-01..BE-13 work is ready for Gate 2 review. Root lint passes with the existing Solhint max-states warning in `contracts/ExamVault.sol`. Please use `docs/backend-chapter.md` for report assembly. Remaining Member 3 duties are the Gate 2 walking-skeleton check after frontend delivery and final integration review.

## To Member 2

Please review the Member 3 BE-01..BE-13 request on `m3/BE-wrapup-verification` and complete the checklist at `docs/reviews/member3-review-request.md`. PR body/title are in `docs/reviews/member3-pr-body.md` because GitHub CLI is unavailable. All BE tasks remain In review pending your review.
