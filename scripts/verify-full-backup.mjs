import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
const dir = resolve(process.argv[2] || ""),
  manifest = JSON.parse(readFileSync(join(dir, "manifest.json")));
const dump = join(dir, "database.dump");
if (
  createHash("sha256").update(readFileSync(dump)).digest("hex") !==
  manifest.sha256
)
  throw Error("Backup checksum mismatch.");
const u = new URL(process.env.BEHTAN_RESTORE_URL || "");
if (!u.pathname.endsWith("/behtan_restore_verification"))
  throw Error(
    "Restore ONLY into the disposable empty behtan_restore_verification database.",
  );
const env = {
  ...process.env,
  PGHOST: u.hostname,
  PGPORT: u.port || "5432",
  PGUSER: decodeURIComponent(u.username),
  PGPASSWORD: decodeURIComponent(u.password),
  PGDATABASE: "behtan_restore_verification",
  PGSSLMODE: u.searchParams.get("sslmode") || "verify-full",
};
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, {
    env,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (r.error || r.status !== 0)
    throw Error(cmd + " failed; restore is not verified.");
  return r.stdout.trim();
};
if (
  run("psql", [
    "-Atc",
    "select count(*) from pg_tables where schemaname not in ('pg_catalog','information_schema')",
  ]) !== "0"
)
  throw Error("Refusing to overwrite a nonempty database.");
run("pg_restore", [
  "--exit-on-error",
  "--no-owner",
  "--dbname",
  "behtan_restore_verification",
  dump,
]);
const expectedBytes=readFileSync(join(dir,"source-counts.json"));
if(createHash('sha256').update(expectedBytes).digest('hex')!==manifest.source_counts_sha256)throw Error('Source counts checksum mismatch.');
const expected=JSON.parse(expectedBytes);
const ident=s=>'"'+s.replaceAll('"','""')+'"';
const counts=[];
for(const t of expected){const rows=run('psql',['-Atc',`select count(*)::text from ${ident(t.schemaname)}.${ident(t.tablename)}`]);counts.push({...t,rows});if(rows!==t.rows)throw Error(`Restore row count mismatch: ${t.schemaname}.${t.tablename}`);}
writeFileSync(join(dir,'restore-counts.json'),JSON.stringify(counts,null,2));
manifest.exact_row_counts_verified=true;
manifest.acls_restored=true;
manifest.restore_completed = true;
manifest.restore_verified = false;
manifest.restore_verified_at = new Date().toISOString();
writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(
  "Archive restored without error into isolated verification database. Exact table counts match the exported backup snapshot and ACL statements restored. Role memberships, ownership, Auth/Storage behavior and external Storage files still require a separate recovery drill; restore_verified remains false.",
);
