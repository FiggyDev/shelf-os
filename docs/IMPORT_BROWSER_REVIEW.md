# Import browser acceptance

The standalone `tests/import-browser.mjs` runner uses Chromium, a production Next build, real server actions and PostgreSQL. It follows the same owned-fixture host, port and database guards as the inventory browser runner. Run after migrations, client generation, production build and Chromium installation with the review environment from `.github/workflows/review.yml`:

```sh
node tests/import-browser.mjs
```

Six scenarios cover the login return path; preview exclusions and empty-selection protection; transaction rollback after an injected audit failure; successful retry saving only selected hidden drafts; a deliberately lost response after the real server has committed, followed by an idempotent retry; and a 390px mobile import followed by inventory navigation. Database assertions check draft, confirmation and audit counts. No external requests are allowed, and browser page errors fail the run. Only response delivery is intercepted in the transport-loss case: persistence runs against the real database.

All six scenarios passed locally. This checkpoint extends evidence without a new product defect or runtime change. Existing component and HTTP tests remain complementary: the browser suite does not exhaust every input boundary or concurrent server delivery.

The retry identity currently lives in the mounted importer. The lost-response test demonstrates recovery on that same page. Reloading, closing the tab, or deliberately changing the selection is outside that guarantee; a future durable confirmation/resume design needs explicit product behavior and separate reload/process-recovery tests. The shared-password gate is still a demo gate, not per-user brand authorization. Full catalog publishing, provider delivery, additional browser engines and broader staff workflow acceptance remain separate work. No live database, provider, deployment or merge is part of this test.
