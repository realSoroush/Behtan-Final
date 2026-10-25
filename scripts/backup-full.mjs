import { Client } from "pg";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
// Run only against the explicitly configured source; never log credentials.
const connection = process.env.BEHTAN_DATABASE_URL;
if (!connection)
  throw Error("Set BEHTAN_DATABASE_URL privately before running the backup.");
let u;
try {
  u = new URL(connection.trim());
} catch {
  throw new Error(
    "رشته اتصال معتبر نیست؛ URI کامل PostgreSQL را وارد کن، نه فقط رمز."
  );
}
if (!["postgres:", "postgresql:"].includes(u.protocol))
  throw Error("Expected PostgreSQL URL.");
const output = resolve(
  process.env.BEHTAN_BACKUP_DIR || "backups",
  new Date().toISOString().replace(/[:.]/g, "-"),
);
mkdirSync(output, { recursive: true, mode: 0o700 });
const env = {
  ...process.env,
  PGHOST: u.hostname,
  PGPORT: u.port || "5432",
  PGUSER: decodeURIComponent(u.username),
  PGPASSWORD: decodeURIComponent(u.password),
  PGDATABASE: decodeURIComponent(u.pathname.slice(1)),
  PGSSLMODE: ["localhost", "127.0.0.1", "::1"].includes(u.hostname)
    ? u.searchParams.get("sslmode") || "disable"
    : "verify-full",
};
delete env.BEHTAN_DATABASE_URL;
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, {
    env,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (r.error || r.status !== 0)
    throw Error(
      `${cmd} failed. No verified backup was created. Check connectivity, permissions and PostgreSQL client version; do not run migrations.`,
    );
  return r.stdout;
};
const dump = join(output, "database.dump");
const snapshotClient=new Client({host:env.PGHOST,port:Number(env.PGPORT),user:env.PGUSER,password:env.PGPASSWORD,database:env.PGDATABASE,ssl:["localhost","127.0.0.1","::1"].includes(u.hostname)?false:{rejectUnauthorized:true}});
let sourceCounts;
await snapshotClient.connect();
try{
 await snapshotClient.query('begin isolation level repeatable read read only');
 const snapshot=(await snapshotClient.query('select pg_export_snapshot() as id')).rows[0].id;
 const tables=(await snapshotClient.query("select schemaname,tablename from pg_tables where schemaname not in ('pg_catalog','information_schema') order by schemaname,tablename")).rows;
 sourceCounts=[];
 const ident=s=>'"'+s.replaceAll('"','""')+'"';
 for(const t of tables){const n=(await snapshotClient.query(`select count(*)::text n from ${ident(t.schemaname)}.${ident(t.tablename)}`)).rows[0].n;sourceCounts.push({...t,rows:n});}
 run("pg_dump", ["--format=custom", "--no-owner", "--snapshot",snapshot,"--file", dump]);
 await snapshotClient.query('commit');
}finally{await snapshotClient.end();}
writeFileSync(join(output,"source-counts.json"),JSON.stringify(sourceCounts,null,2),{mode:0o600});
writeFileSync(
  join(output, "roles.sql"),
  run("pg_dumpall", ["--roles-only", "--no-role-passwords"]),
  { mode: 0o600 },
);
const toc = run("pg_restore", ["--list", dump]);
if (!/TABLE DATA/.test(toc) || statSync(dump).size < 1000)
  throw Error("Backup failed structural validation.");
writeFileSync(join(output, "contents.txt"), toc, { mode: 0o600 });
writeFileSync(
  join(output, "manifest.json"),
  JSON.stringify(
    {
      created_at: new Date().toISOString(),
      sha256: createHash("sha256").update(readFileSync(dump)).digest("hex"),
      bytes: statSync(dump).size,
      source_counts_sha256:createHash("sha256").update(readFileSync(join(output,"source-counts.json"))).digest("hex"),
      includes:
        "All accessible database schemas and data, including Auth and Storage metadata. Storage object bytes and provider secrets are separate.",
      restore_verified: false,
    },
    null,
    2,
  ),
  { mode: 0o600 },
);
console.log("Database archive and role definitions created at " + output);
console.log(
  "REQUIRED: restore into an isolated disposable database and verify auth/public/storage counts before any production migration. Do not upload this backup to GitHub or ChatGPT.",
);
