import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { createTrainingHandler } from "../../server/proTrainingHttp.ts";
import { processTrainingRequest } from "../../server/proTraining.ts";
import { emptyRealIntake } from "../../src/professional/menuPlan.ts";
import { ProServerError } from "../../server/proPlanService.ts";
const answers = {
  ...emptyRealIntake(),
  display_name: "تست مصنوعی",
  birth_date: "1992-04-23",
  height_cm: 165,
  weight_kg: 75,
  safety_confirmed: true,
};
const input = {
  version: 1,
  location: "home",
  experience: "beginner",
  goal: "general",
  days: [0, 3],
  minutes: 45,
  equipment: ["dumbbells"],
  start_date: "2026-10-24",
  screening: {
    confirmed: true,
    symptoms: false,
    pain: false,
    restriction: false,
    recent_surgery: false,
  },
};
const request = {
  org: randomUUID(),
  record: randomUUID(),
  revision: 1,
  key: randomUUID(),
  input,
};
let contexts = 0,
  stages = 0,
  prior = null,
  priorHash = null;
const deps = {
  verify: async (t) => {
    if (t !== "test-token") throw new ProServerError("PRO_AUTH_REQUIRED", 401);
    return "synthetic-actor";
  },
  context: async (a) => {
    contexts++;
    if (prior && a.p_hash !== priorHash)
      throw new ProServerError("PRO_REQUEST_CONFLICT", 409);
    return prior ?? { answers };
  },
  stage: async (a) => {
    stages++;
    priorHash = a.p_hash;
    assert.equal(a.p_actor, "synthetic-actor");
    assert.match(a.p_hash, /^[a-f0-9]{64}$/);
    return (prior = { id: request.key, plan: a.p_plan });
  },
};
const first = await processTrainingRequest(request, "test-token", deps);
assert.equal(first.plan.engine, "behtan-training-1.0");
assert.deepEqual(
  await processTrainingRequest(request, "test-token", deps),
  first,
);
assert.equal(stages, 1);
assert.equal(contexts, 2);
const handler = createTrainingHandler(() => deps),
  server = createServer((req, res) => void handler(req, res));
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = "http://127.0.0.1:" + server.address().port;
let checks = 6;
async function call(body = request, headers = {}, method = "POST") {
  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer test-token",
      ...headers,
    },
    body:
      method === "POST"
        ? typeof body === "string"
          ? body
          : JSON.stringify(body)
        : undefined,
  });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert(response.headers.get("x-request-id"));
  checks += 2;
  return { status: response.status, ...(await response.json()) };
}
const logs = [],
  old = console.error;
console.error = (s) => logs.push(s);
try {
  assert.equal((await call()).status, 200);
  checks++;
  for (const [body, headers, method, status] of [
    [request, {}, "GET", 405],
    [request, { Authorization: "" }, "POST", 401],
    [request, { Authorization: "Bearer invalid" }, "POST", 401],
    [request, { "sec-fetch-site": "cross-site" }, "POST", 403],
    [request, { "Content-Type": "text/plain" }, "POST", 415],
    ["{bad", {}, "POST", 400],
    [{ ...request, plan: { forged: true } }, {}, "POST", 400],
    [{ ...request, actor: randomUUID() }, {}, "POST", 400],
    [{ ...request, org: "x" }, {}, "POST", 400],
    [{ ...request, revision: 1.5 }, {}, "POST", 400],
    [
      {
        ...request,
        input: {
          ...input,
          screening: { ...input.screening, confirmed: false },
        },
      },
      {},
      "POST",
      409,
    ],
  ]) {
    // Reusing a key after changing answers must conflict.
    assert.equal((await call(body, headers, method)).status, status);
    checks++;
  }
  prior = null;
  assert.equal(
    (
      await call({
        ...request,
        input: { ...input, screening: { ...input.screening, symptoms: true } },
      })
    ).status,
    422,
  );
  checks++;
  assert.equal((await call(" ".repeat(9000))).status, 413);
  checks++;
  for (const s of logs) {
    assert(!s.includes("test-token"));
    assert(!s.includes(answers.display_name));
    checks += 2;
  }
} finally {
  console.error = old;
  await new Promise((r) => server.close(r));
}
console.log(
  `PASS training HTTP: ${checks} assertions; real HTTP boundary, JWT gate, payload injection, limits, errors, safe logs, idempotent processing`,
);
