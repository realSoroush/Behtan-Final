import assert from "node:assert/strict";
import { build } from "esbuild";
const result = await build({
  entryPoints: ["src/marketing/catalog.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { parsePro, parseMember } = await import(
  "data:text/javascript;base64," +
    Buffer.from(result.outputFiles[0].text).toString("base64")
);
const pro = {
  code: "nutrition",
  title: "تغذیه",
  subtitle: "توضیح",
  features: ["خروجی"],
  prices: { 1: 100, 3: 300, 6: 600, 12: 1200 },
};
assert.equal(parsePro([pro])[0].prices["3"], 300);
assert.deepEqual(parsePro([]), []);
for (const n of [-1, NaN, Infinity, 1.5, "100", null])
  assert.throws(() => parsePro([{ ...pro, prices: { ...pro.prices, 1: n } }]));
assert.throws(() => parsePro([{ ...pro, features: "invalid" }]));
assert.throws(() => parsePro([{ ...pro, prices: { 1: 100 } }]));
const member = {
  code: "trial",
  name: "آزمایشی",
  features: [],
  price_toman: 0,
  duration_days: 3,
};
assert.equal(parseMember([member])[0].price_toman, 0);
assert.throws(() => parseMember([{ ...member, price_toman: -1 }]));
assert.throws(() => parseMember([{ ...member, duration_days: 0 }]));
assert.throws(() => parseMember({}));
console.log(
  "PASS: catalog accepts free offers and rejects invalid prices, malformed features and durations.",
);

const { readFileSync } = await import("node:fs");
const html = readFileSync("site.html", "utf8");
for (const id of [
  "pro-price-grid",
  "member-price-grid",
  "testimonials-list",
  "pro-video",
])
  assert.equal(
    (html.match(new RegExp('id="' + id + '"', "g")) || []).length,
    1,
  );
assert.equal((html.match(/data-pro-month=/g) || []).length, 4);
assert(!html.includes("{{"));
const main = readFileSync("src/marketing/main.ts", "utf8");
assert(main.includes("https://pro.behtan.fit"));
assert(!main.includes("2490000"));
console.log(
  "PASS: live catalog targets, periods, embedded assets and Pro destination.",
);
const taskBuild=await build({entryPoints:['src/marketing/refreshTask.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {createRefreshTask}=await import('data:text/javascript;base64,'+Buffer.from(taskBuild.outputFiles[0].text).toString('base64'));
let release,calls=0;
const task=createRefreshTask(async()=>{calls++;if(calls===1)await new Promise(r=>{release=r;});});
const first=task();await task();release();await first;assert.equal(calls,2,'An update received during a request must trigger another read.');
const inactive=createRefreshTask(async()=>{throw Error('must not run');},()=>false);await inactive();
console.log('PASS: refresh coalesces bursts without losing concurrent invalidations.');
const uuidBuild=await build({entryPoints:['src/utils/createUuid.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {createUuid}=await import('data:text/javascript;base64,'+Buffer.from(uuidBuild.outputFiles[0].text).toString('base64'));
const fallback=createUuid({getRandomValues:array=>{for(let i=0;i<array.length;i++)array[i]=i;return array;}});
assert.match(fallback,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
assert.equal(createUuid({randomUUID:()=> 'native-uuid',getRandomValues:()=>{throw Error('fallback called');}}),'native-uuid');
console.log('PASS: secure UUID fallback preserves analytics startup outside secure contexts.');
