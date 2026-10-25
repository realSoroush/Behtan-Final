import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { memberHandler } from "../server/member/http.ts";
let calls = 0;
const server = createServer(
  memberHandler(() => async (token, action, input) => {
    calls++;
    assert.equal(token, "synthetic");
    if (action === "training") throw Error("TRAINING_LOCKED");
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
  console.log(
    "PASS actual member HTTP server: methods, JWT gate, cross-site rejection, media type, stream limit, malformed/injected input, no-store and training denial",
  );
} finally {
  server.close();
  await once(server, "close");
}
