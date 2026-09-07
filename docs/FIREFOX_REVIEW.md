# Firefox acceptance review

Extend the existing explicit browser selector to Firefox and run both import and inventory journeys over owned loopback HTTPS. Run the existing server-side inventory/import/race/stale tests on fresh PostgreSQL too. Register Firefox in CI. Keep production code unchanged; this covers browser engine acceptance, not real devices, deployment or durable import recovery after reload/tab close.
