import assert from "node:assert/strict";
import { test } from "node:test";
import { issueToken, tokenIsValid } from "../src/lib/mc-auth";

test("signed sessions reject tampering, expiry, trailing data and disabled configuration", async () => {
  const oldPassword = process.env.MC_PASSWORD;
  const oldSecret = process.env.MC_SESSION_SECRET;
  try {
    process.env.MC_PASSWORD = "ReviewFixturePassword123!";
    process.env.MC_SESSION_SECRET = "review-fixture-secret-more-than-thirty-two-characters";
    const token = await issueToken();
    assert.equal(await tokenIsValid(token), true);
    assert.equal(await tokenIsValid(undefined), false);
    assert.equal(await tokenIsValid(token + ".extra"), false);
    assert.equal(await tokenIsValid("0." + token.split(".")[1]), false);
    assert.equal(await tokenIsValid(token.slice(0, -1) + (token.endsWith("0") ? "1" : "0")), false);
    process.env.MC_SESSION_SECRET = "different-review-fixture-secret";
    assert.equal(await tokenIsValid(token), false);
    process.env.MC_SESSION_SECRET = "review-fixture-secret-more-than-thirty-two-characters";
    delete process.env.MC_PASSWORD;
    assert.equal(await tokenIsValid(token), false);
  } finally {
    if (oldPassword === undefined) delete process.env.MC_PASSWORD;
    else process.env.MC_PASSWORD = oldPassword;
    if (oldSecret === undefined) delete process.env.MC_SESSION_SECRET;
    else process.env.MC_SESSION_SECRET = oldSecret;
  }
});
