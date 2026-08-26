const assert = require("node:assert/strict");
const test = require("node:test");
const {
  localProblemKey,
  metadataMatchesScope,
  migrateLegacyProblemPaths,
  profileScopeKey,
  scopedProblemPaths,
  withScopedProblemPath,
} = require("./profile-state");

test("scopes local problem state by profile, server and workspace", () => {
  const scope = profileScopeKey(
    { id: "profile-a" },
    { server: { instanceId: "ascend-a" }, workspace: { id: "workspace-a" } },
  );
  assert.equal(scope, "profile-a/ascend-a/workspace-a");
  assert.equal(localProblemKey(scope, 12), "profile-a/ascend-a/workspace-a/12/cpp17");

  const next = withScopedProblemPath({}, scope, 12, { path: "/tmp/a" });
  assert.deepEqual(scopedProblemPaths(next, scope), { 12: { path: "/tmp/a" } });
  assert.deepEqual(scopedProblemPaths(next, "profile-b/ascend-b/workspace-b"), {});
});

test("migrates legacy paths into one explicit connection scope", () => {
  const migrated = migrateLegacyProblemPaths({}, "profile-a/ascend-a/workspace-a", {
    1: { path: "/tmp/legacy" },
  });
  assert.equal(scopedProblemPaths(migrated, "profile-a/ascend-a/workspace-a")[1].path, "/tmp/legacy");
});

test("validates versioned local metadata against the active connection", () => {
  const expected = {
    profileId: "profile-a",
    serverInstanceId: "ascend-a",
    workspaceId: "workspace-a",
    problemId: 7,
  };
  assert.equal(metadataMatchesScope({ schemaVersion: 2, ...expected }, expected), true);
  assert.equal(metadataMatchesScope({ schemaVersion: 2, ...expected, workspaceId: "workspace-b" }, expected), false);
  assert.equal(metadataMatchesScope({ schemaVersion: 1, ...expected }, expected), false);
});
