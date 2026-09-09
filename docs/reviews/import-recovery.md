# Recover an unconfirmed import in the same browser

Previously, the import confirmation ID lived only in a mounted React ref. Reloading or closing the tab lost that ID and the selected rows. Re-entering the menu could create another import even if the first action had committed before its response was lost.

Before dispatch, the importer now writes and reads back a versioned local recovery record containing the brand, exact raw menu, selected line numbers and confirmation ID. Reloading or reopening the same browser profile restores that immutable selection. It never automatically submits. Explicit retry sends the original ID and payload through the existing authenticated, reparsed, transactionally idempotent server action.

The UI discloses local menu storage. An uncertain confirmation locks editing and requires an explicit warning/decision before discard; discarding does not undo server drafts. A confirmed result replaces the menu with a small receipt containing only its identity, brand and count. This receipt prevents an older tab from converting a retry into a new import. Starting another import is explicit. A failed cleanup preserves the known successful result on the current page; after reload, retrying its pending record remains idempotent.

Browser Web Locks serialize read/check/write operations across tabs. A stale tab reconciles another confirmation rather than overwriting it. Completion and discard compare the current confirmation identity so a delayed result cannot clear newer work. Different brands use separate storage keys. Stored input is untrusted: version, size, brand, UUID, rows and exact parser selection are validated; server auth/reparsing/hash/transaction guards remain authoritative. Invalid or unavailable storage prevents new dispatch until recovery is available or an explicit discard succeeds. No passwords or session tokens are stored in these records.

## Validation

A targeted probe against parent bf5313a reproduced the original gap: after an actual committed action lost its response, reload returned an empty menu instead of the original source. The probe and failure log are retained separately.

Seventeen component/parser/auth/recovery tests pass, including competing confirmations, immutable retries, receipts without menu text, delayed completion/discard fencing, corrupt/oversized/cross-brand/duplicate-row records, write failure and unavailable locks. Types, lint and the production build pass. All23 existing HTTP/PostgreSQL checks and the server ownership check pass on the new build, as do seven Firefox inventory checks.

The production HTTPS browser runner uses an owned PostgreSQL17 fixture. Eleven scenarios pass in Chromium, WebKit and Firefox: login; exact selection and no-op preview; transaction rollback followed by reload/retry; selected hidden drafts; an actual committed action with deliberately lost response followed by reload, brand navigation, tab closure, reauthentication and simultaneous same-ID retries; mobile layout/inventory navigation; quota failure without dispatch; corrupt-copy preservation and explicit discard; blocked storage; failed receipt cleanup followed by a safe reload/retry; and explicit discard of an uncertain committed import without undoing its database rows. Counts assert no duplicate Product/MenuImport/AuditEvent writes. Receipts contain no raw menu or selected lines. Final runners report no page errors or external blocked requests.

Initial browser test failures are retained in portfolio evidence: an alert selector also matched Next's route announcer, corrected by selecting the browser-recovery message; WebKit reported canceled sidebar prefetches during forced navigation/tab closure, corrected by settling unrelated requests before intentional closure. No retries, arbitrary sleeps, skipped assertions or page-error filtering were added. The lost-response fault still forwards the real action and awaits its commit before dropping only browser delivery.

## Limits

Recovery requires the same browser profile, site origin, available site storage and Web Locks. Browser-data clearing, private-session loss, a different origin/device or a destroyed profile cannot recover a missing copy. This feature does not add cross-device drafts, cloud backup, per-user brand authorization, offline submission or a new server retention policy. Shared-password pilot authorization is unchanged. Clearing/discarding a copy does not cancel or undo an import already committed on the server. Real device certification, publishing/staff/provider acceptance and production commissioning remain separate.

No authentication, cookie TTL, schema, live service, provider, billing, merge or deployment changes. Local fixture credentials and runtime state are outside application configuration. Detailed logs are retained in the portfolio's outputs/evidence/shelf-import-recovery-* files.
