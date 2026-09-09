# Shelf tooling dependency repair

The parent pnpm lockfile reported six advisory records: three high and three moderate, affecting lodash4.17.21, deepmerge-ts7.1.5 and mysql2 3.15.3. All reported paths came through development dependency Prisma's Studio/config/CLI tree. This is a tooling dependency finding, not evidence of exploitation or deployed storefront exposure.

Targeted workspace overrides select lodash4.18.0, @prisma/config's deepmerge-ts8.0.2 and Prisma's mysql2 3.23.1. The final lock audits cleanly. The dependency changes preserve the schema, direct package manifest, framework versions and existing build-script policy. The follow-up editor fix below changes application source and browser coverage. CI gains pnpm audit --audit-level=low. The deepmerge override crosses a major version and is validated through actual Prisma generation/config/migrations and the existing database suites; remove these overrides when upstream pins resolve patched versions.

Fresh frozen-lockfile install succeeds. The existing policy skips Prisma/esbuild install scripts; explicit generation subsequently succeeds. Four migrations apply to fresh PostgreSQL17. Thirteen component/parser/auth tests, the server-ownership check, type generation, TypeScript, lint and production build pass. All23 HTTP/PostgreSQL checks pass (inventory9, import9, race2, stale3). Firefox import6/inventory7 checks pass over the owned HTTPS fixture with no page errors or external blocked requests. These exercise login, actual production actions/database writes, audit rollback, lost-response retry on the same mounted page, selection preservation, stale edits, repeated saves and390px layouts. Chromium/WebKit remain in CI with their prior evidence; they were not rerun locally in this dependency-only pass.

Durable import confirmation after reload/tab-close remains unimplemented. The current request ID lives in the mounted component. A separate recovery design must preserve the immutable payload and confirmation ID before dispatch, handle uncertain outcomes and concurrent tabs, and pass real reload/tab-close tests. This dependency repair does not claim that feature or full per-user brand authorization, publishing/provider acceptance, device certification or launch readiness. No production environment, credentials, TTL, authentication, schema, provider, merge or deployment changes.

Before/after audit, install, database/browser and scan evidence is retained in the portfolio's outputs/evidence/shelf-dependencies-* files. Durable-recovery requirements are retained separately in outputs/shelf-import-recovery-design.md.


## Editor readiness after reload

The first hosted run34325891006 passed the dependency/application/HTTP gates and Chromium runners but failed WebKit inventory reopening after reload. A local probe reproduced the same lost click by delaying JavaScript loading after reload. The server-rendered toggle was enabled before its client handler existed.

The product toggle now stays disabled until hydration attaches the handler, using matching server/client snapshots. The production browser regression holds script requests during reload, asserts that the visible toggle is disabled, releases scripts, and then opens and saves the fresh revision. No retries or arbitrary sleep were added to the acceptance test. The initial failed hosted run and delayed-script probe are retained as evidence. This is separate from durable import recovery.
