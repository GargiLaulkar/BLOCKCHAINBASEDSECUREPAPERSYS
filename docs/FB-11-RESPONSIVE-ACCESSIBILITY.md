# FB-11: Responsive Design and Accessibility

## Responsive work

- Tightened the application shell sizing and added a compact, wrapping mobile header with comfortable navigation targets.
- Kept wide audit, evidence, roster, Centre and Holder data in their scroll wrappers instead of hiding columns; wrappers can receive keyboard focus and have accessible region labels.
- Added inline wrapping for long hash values and controlled modal dimensions/scrolling for small viewports.
- Hardened dashboard and Auditor page box sizing to avoid narrow-screen content pushing the document wider than the viewport.
- Preserved the existing page layouts and theme rather than replacing them.

## Pages covered

Responsive browser checks cover Public Verifier, all four role dashboards, Centre Paper Station, Holder Console, Auditor Audit Log Explorer, Leak Tracer, Evidence PDF, Decoy Manager, and Roster Proof.

The audit table view retains all columns in a keyboard-focusable horizontal scroll region. The Centre/Holder/dashboards likewise retain their complete native tables when records are present. Existing authenticated role and route guards are unchanged.

## Accessibility work

- Guard screens use level-one headings when they are the active page content.
- Guard errors rely on `role="alert"` alone; no conflicting `aria-live="polite"` is added. Pending updates use `role="status"`.
- Scrollable table regions have accessible names, keyboard focus, and visible focus outlines.
- Audit event details focus the close control, trap Tab within the dialog, close on Escape, and restore focus to the event control.
- Existing global `:focus-visible` styling and reduced-motion rules remain in force.

These are targeted improvements and checks, not a full WCAG audit or production accessibility certification.

## Viewports and tests

Playwright responsive tests exercise these exact viewport sizes: 375×812, 390×844, 768×1024, 1366×768, and 1920×1080. Assertions check page-level horizontal overflow, key headings, labelled controls, navigation, and dialog keyboard behavior.

The E2E suite continues to use deterministic API fixtures and a read-only wallet shim. It does not make transactions, sign attestations, generate papers, or verify production services.

## Commands and validation

```powershell
corepack pnpm test:e2e
corepack pnpm --filter @sigil/frontend test
corepack pnpm --filter @sigil/frontend typecheck
corepack pnpm --filter @sigil/frontend build
git diff --check
```

Latest FB-11 results:

- Playwright: **15 passed** (9 existing journeys plus 6 responsive journeys).
- Focused frontend tests (guard and Audit Log Explorer): **16 passed**.
- Frontend typecheck: passed.
- Frontend production build: passed. Existing dependency annotation and large-chunk warnings remain.
- `git diff --check`: passed.

## Limitations

- Browser testing covers the stated viewports but not every browser, zoom level, assistive technology, or user preference combination.
- Table contents are preserved in horizontally scrollable regions on narrow screens; they are not transformed into separate mobile cards.
- The responsive Centre and Holder checks use empty assignment fixtures. They do not verify every populated row’s visual density or assignment authorization.
- All authenticated API and wallet responses in E2E are fixtures; use backend and contract suites for those boundaries.
