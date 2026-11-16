# FB-09: Application UI States

## Scope

This pass adds a small shared set of accessible asynchronous-state primitives and applies them to missing completion/loading feedback in selected authentication and Auditor flows. Existing page-specific workflows and their behavior remain in place.

## Shared components

`@sigil/ui` exports:

- `LoadingState`: polite status announcement, `aria-busy="true"`, and a reduced-motion-aware indicator.
- `ErrorState`: assertive error announcement with an optional explicit retry button. It never retries on its own.
- `SuccessMessage`: atomic polite announcement for a completed operation.
- `EmptyState`: now announces changed empty content and exposes its title as a level-two heading.
- Existing `FieldError` continues to expose form errors with `role="alert"`.

## Pages and behavior updated

- Wallet connection and SIWE sign-in guards announce pending operations, expose busy state, and announce authentication errors.
- Auditor Audit Log Explorer uses shared loading feedback for fetch/CSV progress and announces CSV completion after a browser download is initiated. CSV retrieval still collects all cursor pages and reports errors without claiming success.
- Auditor Evidence PDF page uses shared loading feedback and confirms that the PDF download was initiated. PDF creation errors remain visible; no evidence authenticity claim is added.
- Existing transaction flows continue to use the transaction drawer and show confirmation only after their current operation reports success. No automatic transaction retry was introduced.

## Existing state coverage retained

The Authority/Setter, Holder, Centre, dashboard, public-verifier, leak-tracer, roster-proof, decoy-manager and other Auditor screens already had page-specific loading, empty, error, retry, or transaction status handling. This pass did not replace those workflows wholesale. The shared empty-state announcement applies wherever `EmptyState` is reused.

## Accessibility changes

State updates use status/alert live regions; pending connect/sign-in buttons expose `aria-busy`; empty messages announce changes; and loading animation respects `prefers-reduced-motion`. This is a targeted improvement, not a claim of full WCAG conformance. Keyboard behavior, contrast, and focus management still require a broader accessibility audit, particularly for custom dialogs in feature pages.

## Error-handling strategy

Retry remains an explicit user action and is offered only where the operation is safe to repeat (for example, a read request). Blockchain transactions are never automatically retried. Existing forms retain their values on request failures where the page already controls the form state. User rejection and confirmed transaction failures continue to follow each flow's existing error handling.

## Known limitations

- This is not a complete rewrite of all page-specific state markup. Some screens retain bespoke status messages and visual treatments.
- Browser download initiation is the success boundary for PDF/CSV feedback; the application cannot confirm that the user saved or opened the file.
- Existing remote service and wallet errors depend on the source API/provider for meaningful messages; internal details must continue to be sanitized by each feature.
- No backend, contract, database, or deployment changes are part of FB-09.

## Demonstration

1. Run the frontend with the repository's normal development command.
2. Connect a wallet and sign in; observe the pending status announcements during connect/sign-in.
3. Open Auditor → Audit Log Explorer. Observe loading or empty/error states depending on the local indexed events; retry reads explicitly.
4. Export all filtered results; the page announces collected progress and confirms the initiated CSV download.
5. Open Auditor → Evidence PDF reports with indexed leak events and download a report; the page announces that the download was initiated.
