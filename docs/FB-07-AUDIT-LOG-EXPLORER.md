# FB-07 Audit Log Explorer

## Features

The Auditor workspace includes a searchable, cursor-paginated view of indexed blockchain events. It supports filters for exam ID, event type, actor wallet, and inclusive UTC calendar dates; event details; retry and empty states; and CSV export of all pages matching the active filters.

## Route and authorization

Open `/auditor/audit-logs`. The route is wrapped in the existing authenticated `AppShell` with the `AUDITOR` role requirement. The Auditor dashboard and role navigation link to the explorer.

The page uses the existing `GET /api/events` API. That endpoint is public because it also serves the FB-02 Public Verifier. The explorer does not create a new privileged-event endpoint. The server applies its existing payload sanitization, and the explorer renders only an explicit allowlist of scalar metadata fields; it never renders the raw payload. The frontend role guard is a user-interface access control and does not make the shared public API Auditor-only.

## Filters and pagination

Filters map to the existing `exam`, `type`, `actor`, `from`, and `to` query parameters. Date bounds cover the selected days in UTC. The API page size is 100, matching the server maximum. Next follows `nextCursor`; Previous re-requests the cursor recorded for the prior page. Filters remain applied while paging. An invalid/expired cursor offers a restart from page one.

## CSV export

Export retrieves every cursor page for the currently applied filters and creates a UTF-8 CSV with a BOM. It includes timestamp, event type, exam ID, actor, transaction hash, block number, and the same allowlisted summary. CSV quoting handles quotes and line breaks; cells beginning with spreadsheet formula characters are prefixed to prevent formula execution. Repeated cursors and request failures are reported instead of silently producing a partial export. Empty result sets are reported and no empty file is downloaded.

## Security considerations

- The explorer displays actual indexed events; it does not manufacture audit records.
- Transaction and event metadata are public chain data. The page does not expose raw indexed payload objects or secret material.
- Existing backend event access and sanitization remain unchanged to preserve the public verifier contract.
- CSV content is a snapshot of pages fetched during export. Events indexed while an export is in progress may not be represented consistently across pages.
- CSV formula neutralization is intended for spreadsheet safety, not evidence authenticity. A hash supports integrity comparison; it does not prove that a report is true.

## Local demonstration

1. Start the backend and its configured local indexer/API using the repository's existing development workflow.
2. Start the frontend and sign in with an account that has the Auditor role.
3. Open the Auditor dashboard and select **Audit Log Explorer** (or navigate to `/auditor/audit-logs`).
4. Apply one or more filters, open an event for its details, navigate pages, and export all matching results as CSV.

The page requires indexed events from the existing backend. An empty index is shown as an empty state; no sample records are inserted by the feature.

## Known limitations

- The events endpoint remains public by design for FB-02; the Auditor route guard is not server-side authorization for that shared public event data.
- Pagination is cursor-based without a server-provided total count, so the interface reports the current page count and whether another cursor exists rather than a global total.
- Export walks the full matching result set sequentially and can take time for large histories. It reports progress and fails visibly on API or cursor errors.
- Event summaries are intentionally limited to known safe metadata keys. New event payload fields require explicit review before display/export.
