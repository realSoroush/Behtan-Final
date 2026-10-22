import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import {
  makeBodyReport,
  validateMeasurements,
} from "../src/professional/body/contracts.ts";
import { bodyAppendixHtml } from "../src/professional/body/appendix.ts";
import { createBodyHandler } from "../server/proBodyHttp.ts";
import { assessPhotos } from "../server/proBodyProvider.ts";

let checks = 0;
const eq = (a, b) => {
  assert.deepEqual(a, b);
  checks++;
};
eq(
  makeBodyReport(
    165,
    75,
    1,
    {},
    [{ view: "front", usable: true, issues: [] }],
    "test",
  ).bmi,
  27.55,
);
eq(makeBodyReport(165, 75, 1, {}, [], "test").fat_mass_kg, null);
eq(
  makeBodyReport(
    165,
    75,
    1,
    { body_fat_pct: 30, body_fat_method: "bia" },
    [],
    "test",
  ).fat_free_mass_kg,
  52.5,
);
for (const input of [
  { waist_cm: NaN },
  { hip_cm: -1 },
  { body_fat_pct: 40 },
  { body_fat_pct: 100, body_fat_method: "bia" },
  { waist_cm: "90" },
  { secret: "x" },
  null,
  [],
]) {
  assert.throws(() => validateMeasurements(input));
  checks++;
}
const photo = {
  view: "front",
  data:
    "data:image/jpeg;base64," +
    Buffer.concat([Buffer.from([255, 216, 255]), Buffer.alloc(128)]).toString(
      "base64",
    ),
};
const request = {
  org: randomUUID(),
  record: randomUUID(),
  revision: 1,
  key: randomUUID(),
  photos: [photo],
  measurements: {},
  consent: true,
};
let reserve = 0,
  assess = 0,
  finish = 0,
  cached = false,
  captured;
const deps = {
  model: "test",
  verify: async () => randomUUID(),
  reserve: async (a) => {
    reserve++;
    return cached
      ? { id: a.p_key, report: makeBodyReport(165, 75, 1, {}, [], "test") }
      : { id: a.p_key, answers: { height_cm: 165, weight_kg: 75 } };
  },
  finish: async (a) => {
    finish++;
    captured = a;
  },
  assess: async () => {
    assess++;
    return [{ view: "front", usable: true, issues: [] }];
  },
};
async function http(
  body = request,
  headers = {},
  method = "POST",
  factory = () => deps,
) {
  const req = Readable.from([]);
  Object.assign(req, {
    method,
    body,
    headers: {
      authorization: "Bearer token",
      "content-type": "application/json",
      ...headers,
    },
  });
  const res = {
    statusCode: 0,
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    end(s) {
      this.body = JSON.parse(s);
    },
  };
  await createBodyHandler(factory)(req, res);
  return res;
}
let r = await http();
eq(r.statusCode, 200);
eq(assess, 1);
eq(finish, 1);
assert(r.headers["X-Request-Id"]);
checks++;
eq(JSON.stringify(captured).includes("data:image"), false);
eq(r.body.report.fat_mass_kg, null);
cached = true;
r = await http();
eq(r.statusCode, 200);
eq(assess, 1);
cached = false;
for (const body of [
  { ...request, consent: false },
  { ...request, key: "x" },
  { ...request, revision: 0 },
  { ...request, photos: [] },
  { ...request, photos: [photo, photo] },
  { ...request, photos: [{ ...photo, data: "https://attacker.test/photo" }] },
  {
    ...request,
    photos: [
      {
        ...photo,
        data: "data:image/jpeg;base64," + Buffer.alloc(200).toString("base64"),
      },
    ],
  },
  { ...request, measurements: { body_fat_pct: 25 } },
  { ...request, extra: "untrusted" },
  "{bad json",
]) {
  eq((await http(body)).statusCode, 400);
}
eq((await http(request, { "content-length": "4000000" })).statusCode, 413);
eq((await http(request, { "sec-fetch-site": "cross-site" })).statusCode, 403);
eq((await http(request, { authorization: "" })).statusCode, 401);
eq((await http(request, {}, "GET")).statusCode, 405);
eq((await http(request, { "content-type": "text/plain" })).statusCode, 415);
let failureFinish;
await http(request, {}, "POST", () => ({
  ...deps,
  assess: async () => {
    throw new Error("secret profile");
  },
  finish: async (a) => {
    failureFinish = a;
  },
}));
eq(failureFinish.p_report, null);
const before = reserve;
await http(request, {}, "POST", () => ({
  ...deps,
  verify: async () => {
    throw new Error("secret-token-profile");
  },
}));
eq(reserve, before);
const provider = await assessPhotos(
  [photo],
  "model",
  "secret",
  async (url, init) => {
    const payload = JSON.parse(init.body);
    eq(url, "https://api.openai.com/v1/responses");
    eq(payload.store, false);
    eq(payload.text.format.strict, true);
    eq(JSON.stringify(payload).includes("989"), false);
    return {
      ok: true,
      json: async () => ({
        output: [
          {
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  photos: [
                    { view: "front", usable: true, issues: ["lighting"] },
                  ],
                }),
              },
            ],
          },
        ],
      }),
    };
  },
);
eq(provider[0].usable, false);
for (const value of [
  { photos: [{ view: "side", usable: true, issues: [] }] },
  { photos: [{ view: "front", usable: true, issues: [], fat: 10 }] },
  { photos: [{ view: "front", usable: true, issues: ["diagnosis"] }] },
  { photos: [] },
]) {
  await assert.rejects(
    () =>
      assessPhotos([photo], "model", "key", async () => ({
        ok: true,
        json: async () => ({
          output: [
            { content: [{ type: "output_text", text: JSON.stringify(value) }] },
          ],
        }),
      })),
    /PRO_SCAN_INVALID_RESULT/,
  );
  checks++;
}
eq(
  bodyAppendixHtml(makeBodyReport(165, 75, 1, {}, [], "<script>")).includes(
    "<script>",
  ),
  false,
);
console.log(
  `PASS: ${checks} body report validation, provider contract, privacy, cache, HTTP security assertions`,
);
