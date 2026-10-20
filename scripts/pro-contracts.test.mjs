import assert from "node:assert/strict";
import {
  canCreateSandboxPatient,
  proErrorMessage,
} from "../src/professional/contracts.ts";
assert.equal(canCreateSandboxPatient(["owner"]), true);
assert.equal(canCreateSandboxPatient(["assistant"]), true);
assert.equal(canCreateSandboxPatient(["practitioner"]), false);
assert.equal(canCreateSandboxPatient([]), false);
assert.equal(canCreateSandboxPatient(["owner", "practitioner"]), true);
assert.match(proErrorMessage(new Error("PRO_ACCESS_DENIED")), /دسترسی/);
assert.match(proErrorMessage(new Error("PRO_SANDBOX_LIMIT")), /ظرفیت/);
assert.match(proErrorMessage(new Error("PRO_REQUEST_CONFLICT")), /تداخل/);
assert.match(
  proErrorMessage(new Error("Failed to fetch")),
  /دوباره ساخته نمی‌شود/,
);
const { requestKey, clearRequestKey } = await import(
  "../src/professional/requestKeys.ts"
);
const values = new Map();
const storage = {
  getItem: (k) => values.get(k),
  setItem: (k, v) => values.set(k, v),
  removeItem: (k) => values.delete(k),
};
const first = requestKey("user-a.patient.org-a", storage);
assert.equal(
  requestKey("user-a.patient.org-a", storage),
  first,
  "Retry after reload",
);
assert.notEqual(
  requestKey("user-b.patient.org-a", storage),
  first,
  "User isolation",
);
assert.notEqual(
  requestKey("user-a.patient.org-b", storage),
  first,
  "Tenant isolation",
);
clearRequestKey("user-a.patient.org-a", storage);
assert.notEqual(
  requestKey("user-a.patient.org-a", storage),
  first,
  "New action after confirmed success",
);
assert.match(
  requestKey("disabled", {
    getItem() {
      throw Error("blocked");
    },
    setItem() {
      throw Error("blocked");
    },
  }),
  /^[0-9a-f-]{36}$/,
);
console.log("PASS: 14 Professional UI contract assertions");
