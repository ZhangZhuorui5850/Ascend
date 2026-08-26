const assert = require("node:assert/strict");
const test = require("node:test");
const { draftConflictDecision, draftConflictFromError } = require("./draft-sync");

test("parses versioned draft conflicts and preserves cloud revision", () => {
  const conflict = draftConflictFromError({
    status: 409,
    details: {
      error: {
        code: "DRAFT_CONFLICT",
        details: { current: { revision: 7, sha256: "abc", deviceName: "Web" } },
      },
    },
  });
  assert.deepEqual(conflict, {
    revision: 7,
    sha256: "abc",
    updatedAt: "",
    deviceId: "",
    deviceName: "Web",
  });
  assert.equal(draftConflictDecision("查看并载入云端"), "load-cloud");
  assert.equal(draftConflictDecision("保留本地并保存"), "overwrite-cloud");
  assert.equal(draftConflictDecision(undefined), "cancel");
});

test("ignores unrelated request failures", () => {
  assert.equal(draftConflictFromError({ status: 401, details: {} }), null);
});
