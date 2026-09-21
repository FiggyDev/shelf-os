# Inventory browser acceptance

Adds a repeatable Chromium gate for the built inventory editor against an explicitly owned PostgreSQL fixture. No application source changes and no new finding family.

Seven actual-browser scenarios pass: real password login and requested-brand redirect; successful save and retained values; stale second-tab conflict with retained edits and no extra audit; explicit reload and fresh save; repeated save with an advanced revision baseline; server validation preserving fields and subsequent recovery; mobile reopen/save at 390px with no horizontal overflow. Database values and audit counts are checked after each mutation. No synthetic server-action calls or API response mocks are used in this browser gate. No page errors or external requests occurred.

The first attempt matched both the form alert and Next's route announcer; scoped the selector to the form and reran successfully. This was a test-selector setup error, not a reproduced application defect.

Four migrations apply to the disposable PostgreSQL17 fixture. Production build, types, lint without warnings,13 component/parser/auth tests,one server-ownership check and all23 existing HTTP/database checks pass. CI installs pinned Playwright1.61.1 and Chromium before running the gate. Existing server ownership/cleanup helpers prevent silently reusing another process.

Evidence covers this inventory editing workflow. Per-user/per-brand permissions, field-level merging, other browser workflows, the unexposed toggle form and release/provider acceptance remain open. Shared-login permissions and expiry policy are unchanged. No merge, deployment or existing service contact.
