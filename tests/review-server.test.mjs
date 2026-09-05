import http from "node:http";
import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import { startReviewServer } from "./review-server.mjs";

test("a port collision never makes the harness probe another server", async () => {
  let requests = 0;
  const fixture = http.createServer((request, response) => {
    request.resume(); requests++; response.end("owned collision fixture");
  });
  fixture.listen(0, "127.0.0.1");
  await once(fixture, "listening");
  try {
    await assert.rejects(startReviewServer(fixture.address().port), /Owned fixture exited/);
    assert.equal(requests, 0);
  } finally {
    await new Promise(resolve => fixture.close(resolve));
  }
});
