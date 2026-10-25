import { mkdir, readFile, writeFile, readdir, cp } from "node:fs/promises";
import { resolve, join } from "node:path";
// Generates files only. Never opens a database connection, resets data or deploys.
const target = resolve(".local-supabase");
await mkdir(join(target, "supabase/migrations"), { recursive: true });
let config = await readFile("supabase/config.toml", "utf8");
config = config
  .replace(/project_id = ".*"/, 'project_id = "behtan_local_review"')
  .replace(
    /\[auth.sms\]([\s\S]*?)\n\[/,
    (_, body) =>
      "[auth.sms]" +
      body.replace("enable_signup = false", "enable_signup = true") +
      "\n[",
  );
config +=
  '\n[auth.sms.test_otp]\n"989111111111" = "123456"\n\n[functions.payments]\nverify_jwt = false\n\n[functions.send-sms]\nverify_jwt = false\n';
config = config.replace(
  /enabled = true\n# Specifies an ordered list of seed files/,
  "enabled = false\n# Specifies an ordered list of seed files",
);
await writeFile(join(target, "supabase/config.toml"), config);
const strip = (s) => s.replace(/^\s*(?:begin|commit);\s*$/gim, "");
const migrations = (await readdir("supabase/migrations"))
  .filter((f) => Number(f.match(/_(\d{3})_/)?.[1]) >= 16)
  .sort(
    (a, b) => Number(a.match(/_(\d{3})_/)[1]) - Number(b.match(/_(\d{3})_/)[1]),
  );
let sql =
  strip(await readFile("supabase/schema.sql", "utf8")) +
  "\n" +
  strip(await readFile("supabase/seed_nutrition_catalog.sql", "utf8"));
for (const name of migrations)
  sql +=
    "\n-- " +
    name +
    "\n" +
    strip(await readFile("supabase/migrations/" + name, "utf8"));
sql +=
  "\nupdate public.billing_settings set mode='sandbox',checkout_enabled=true where id;\n";
await writeFile(
  join(target, "supabase/migrations/202610240001_local_baseline.sql"),
  sql,
);
await cp("supabase/functions", join(target, "supabase/functions"), {
  recursive: true,
});
await cp("src", join(target, "src"), { recursive: true });
await writeFile(
  join(target, "functions.env.example"),
  "PAYMENT_SITE_URL=https://localhost.invalid\nZARINPAL_MERCHANT_ID=00000000-0000-0000-0000-000000000000\nPAYMENT_RECONCILE_SECRET=local-development-only\n# Optional real model secret, local private file only:\n# GEMINI_API_KEY=\n",
);
console.log(
  "Isolated local Supabase files generated in .local-supabase. No database connection or production change performed.",
);
console.log("Start with: supabase start --workdir .local-supabase");
console.log(
  "Local-only test phone: 09111111111; OTP: 123456. Never copy this config to production.",
);
