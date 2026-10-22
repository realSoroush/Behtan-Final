import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const script = new URL("./pro-backup.mjs", import.meta.url);
const env = { ...process.env };
delete env.BEHTAN_BACKUP_DATABASE_URL;
let result = spawnSync(process.execPath, [fileURLToPath(script)], {
  env,
  encoding: "utf8",
});
assert.notEqual(result.status, 0);
assert.match(result.stderr, /Set BEHTAN_BACKUP_DATABASE_URL/);
const secret = "never-print-this-password";
result = spawnSync(process.execPath, [fileURLToPath(script)], {
  env: { ...env, BEHTAN_BACKUP_DATABASE_URL: "invalid-connection-" + secret },
  encoding: "utf8",
});
assert.notEqual(result.status, 0);
assert(!result.stderr.includes(secret));
assert(!result.stdout.includes(secret));
const dir = mkdtempSync(join(tmpdir(), "behtan-backup-probe-"));
try {
  writeFileSync(join(dir, "database.dump"), "damaged");
  writeFileSync(join(dir, "roles.sql"), "roles");
  writeFileSync(
    join(dir, "manifest.json"),
    JSON.stringify({
      version: 1,
      sha256: { "database.dump": "invalid", "roles.sql": "invalid" },
    }),
  );
  result = spawnSync(process.execPath, [fileURLToPath(script), "verify", dir], {
    env,
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Checksum mismatch/);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log(
  "PASS: 3 backup safety scenarios; credentials withheld, missing configuration and corrupted archive rejected before tool execution",
);
