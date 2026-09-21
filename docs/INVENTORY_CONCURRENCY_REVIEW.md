# Inventory concurrency review

SHELF-05 (P2): inventory actions read the current product before entering the
write/audit transaction. Overlapping identical edits both recorded a change,
and overlapping different edits both described the original value instead of
the value actually replaced. This undermined the audit trail despite the
existing write-and-audit rollback guarantee.

The product read, brand check, change detection, mutation and audit now run
under a product row lock in one transaction. Brand-scoped lock selection and
the existing brand check remain in place. Cache invalidation runs after commit.
The unused visibility-toggle helper follows the same locking pattern, but it
is not exposed in the current build's action manifest and no HTTP proof is
claimed for that helper.

Two built-app HTTP regressions failed before and pass after: identical edits
produce one audit, and distinct edits produce an accurate chain of old/new
names. An owned PostgreSQL connection holds the product row while two separate
HTTP requests queue, and an observer confirms both are waiting on database
locks before release. The first harness attempt targeted the unexposed toggle
helper; it was corrected to exercise the actual edit action. That failed
harness attempt is retained separately from the two valid before/after cases.

All 20 real HTTP/PostgreSQL checks pass: nine existing inventory/access/audit
cases, nine existing import cases, and two new concurrency cases. Twelve
component/parser/auth tests, one server-ownership/port-collision check, four
migrations, lint, Next type generation, TypeScript and production build pass.
Database guards still require explicit opt-in, loopback and shelf_review;
the expected port may now be supplied by the owned ephemeral DB runner, with
55443 retained as the CI default. The test servers never reuse another process.
Local Node networking is limited to the owned DB and listeners whose ancestry
reaches the validation runner. All fixtures are fictional. The temporary audit
trigger from the existing rollback test is removed by its cleanup.

This serializes writes and makes audits accurate; it does not warn a user that
their form was loaded before somebody else's edit. Last-writer behavior remains.
Per-user login and brand membership authorization, complete browser workflows,
actual publication/provider behavior and deployment readiness remain open.
Shared-password authentication still grants pilot-wide access and identifies
no individual staff member. No credentials, token lifetimes, real configuration,
merge, deployment or provider calls are changed by this review.
