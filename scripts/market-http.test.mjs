import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { memberHandler } from "../server/member/http.ts";
let calls = 0;
const server = createServer(
  memberHandler(() => async (token, action, input) => {
    calls++;
    assert.equal(token, "synthetic");
    if (action === "meal_intake" && input.kind === "skip") throw Error("STALE_INTAKE");
    if (action === "training") throw Error("TRAINING_LOCKED");
    if (action === "meal_schedule" && input.kind === "rotate") throw Error("STALE_INTAKE");
    if (action === "meal_schedule" && input.kind === "swap") throw Error("TIMEOUT");
    if (action === "meal_schedule" && input.kind === "generate") throw Error("synthetic internal details");
    return { ok: true, action, input };
  }),
);
server.listen(0, "127.0.0.1");
await once(server, "listening");
const url = "http://127.0.0.1:" + server.address().port;
const post = (body, headers = {}) =>
  fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer synthetic",
      ...headers,
    },
    body,
  });
try {
  assert.equal((await fetch(url)).status, 405);
  assert.equal((await post("{}", { authorization: "" })).status, 401);
  assert.equal(
    (await post("{}", { "sec-fetch-site": "cross-site" })).status,
    401,
  );
  assert.equal(
    (await post("{}", { "content-type": "text/plain" })).status,
    415,
  );
  assert.equal((await post("x".repeat(12001))).status, 413);
  assert.equal((await post("{")).status, 400);
  assert.equal(
    (await post(JSON.stringify({ action: "preflight", user: "forged" })))
      .status,
    400,
  );
  assert.equal(calls, 0);
  const r = await post(JSON.stringify({ action: "preflight" }));
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.equal(
    (await post(JSON.stringify({ action: "training" }))).status,
    403,
  );
  const stale = await post(JSON.stringify({ action: "meal_schedule", input: { kind: "rotate" } }));
  assert.equal(stale.status, 409);
  assert.deepEqual(await stale.json(), { error: "STALE_INTAKE" });
  const timedOut = await post(JSON.stringify({ action: "meal_schedule", input: { kind: "swap" } }));
  assert.equal(timedOut.status, 504);
  assert.deepEqual(await timedOut.json(), { error: "TIMEOUT" });
  const failure = await post(JSON.stringify({ action: "meal_schedule", input: { kind: "generate" } }));
  assert.equal(failure.status, 503);
  assert.deepEqual(await failure.json(), { error: "MEAL_SCHEDULE_UNAVAILABLE" });
  assert.equal((await post(JSON.stringify({ action: 'meal_intake', input: { kind: 'skip' } }))).status,409);
  assert.equal((await post(JSON.stringify({ action: 'meal_intake', input: { padding: 'x'.repeat(20000) } }))).status,200);
  assert.equal((await post(JSON.stringify({ action: 'preflight', input: { padding: 'x'.repeat(20000) } }))).status,413);
  assert.equal((await post(JSON.stringify({ action: 'meal_intake', input: { padding: 'x'.repeat(65536) } }))).status,413);
  console.log(
    "PASS actual member HTTP server: methods, JWT gate, cross-site rejection, media type, stream limit, malformed/injected input, no-store and training denial",
  );
} finally {
  server.close();
  await once(server, "close");
}
