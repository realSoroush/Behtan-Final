// Read-only export. Never restores or modifies the source database.
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  statSync,
  renameSync,
  rmSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
const args = process.argv.slice(2);
const run = (tool, parameters, env) => {
  const p = spawnSync(tool, parameters, {
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 600000,
  });
  if (p.error || p.status !== 0)
    throw new Error(
      `${tool} failed. Check installation, database credentials, network and PostgreSQL client/server versions. Raw output withheld to protect credentials.`,
    );
  return p.stdout;
};
if (args[0] === "verify") {
  const dir = resolve(args[1] || "");
  const manifest = JSON.parse(
    readFileSync(resolve(dir, "manifest.json"), "utf8"),
  );
  if (manifest.version !== 1) throw new Error("Unsupported backup manifest");
  for (const name of ["database.dump", "roles.sql"]) {
    const bytes = readFileSync(resolve(dir, name));
    if (
      createHash("sha256").update(bytes).digest("hex") !== manifest.sha256[name]
    )
      throw new Error(`Checksum mismatch: ${name}`);
  }
  const list = run(
    "pg_restore",
    ["--list", resolve(dir, "database.dump")],
    process.env,
  );
  if (!list.includes("TABLE DATA"))
    throw new Error("Archive contains no table data");
  console.log(
    "PASS: checksums and PostgreSQL archive directory. This is NOT a restore test.",
  );
} else {
  if (!process.env.BEHTAN_BACKUP_DATABASE_URL)
    throw new Error(
      "Set BEHTAN_BACKUP_DATABASE_URL locally. Never paste the password into chat or commit it.",
    );
  let connection;
  try {
    connection = new URL(process.env.BEHTAN_BACKUP_DATABASE_URL);
  } catch {
    throw new Error("Invalid database connection URL; value withheld.");
  }
  if (
    !["postgresql:", "postgres:"].includes(connection.protocol) ||
    !connection.hostname
  )
    throw new Error("Invalid PostgreSQL URL");
  const env = {
    ...process.env,
    PGHOST: connection.hostname,
    PGPORT: connection.port || "5432",
    PGUSER: decodeURIComponent(connection.username),
    PGPASSWORD: decodeURIComponent(connection.password),
    PGDATABASE: connection.pathname.slice(1) || "postgres",
    PGSSLMODE: "require",
    PGCONNECT_TIMEOUT: "15",
  };
  delete env.BEHTAN_BACKUP_DATABASE_URL;
  const dir = resolve(
    args[0] ||
      resolve(
        "..",
        "Behtan-Backups",
        new Date().toISOString().replace(/[:.]/g, "-"),
      ),
  );
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  for (const name of ["database.dump", "roles.sql", "manifest.json"])
    try {
      statSync(resolve(dir, name));
      throw new Error(
        "Backup destination already contains files; choose a new directory",
      );
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  try {
    run(
      "pg_dump",
      [
        "--format=custom",
        "--no-owner",
        "--file",
        resolve(dir, "database.dump.partial"),
      ],
      env,
    );
    const roles = run(
      "pg_dumpall",
      ["--roles-only", "--no-role-passwords"],
      env,
    );
    writeFileSync(resolve(dir, "roles.sql.partial"), roles, { mode: 0o600 });
    run("pg_restore", ["--list", resolve(dir, "database.dump.partial")], env);
    const sha256 = {};
    for (const name of ["database.dump", "roles.sql"]) {
      renameSync(resolve(dir, name + ".partial"), resolve(dir, name));
      sha256[name] = createHash("sha256")
        .update(readFileSync(resolve(dir, name)))
        .digest("hex");
    }
    writeFileSync(
      resolve(dir, "manifest.json"),
      JSON.stringify(
        {
          version: 1,
          created_at: new Date().toISOString(),
          format: "pg_dump custom; no-owner; ACLs retained",
          sha256,
          excludes: [
            "Storage object files",
            "provider/Vercel configuration",
            "role passwords",
          ],
          restore_verified: false,
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    console.log(
      "Backup exported to " +
        dir +
        ". Run backup:verify and rehearse restoration in a separate project before relying on it.",
    );
  } catch (e) {
    for (const name of ["database.dump.partial", "roles.sql.partial"])
      rmSync(resolve(dir, name), { force: true });
    throw e;
  }
}
