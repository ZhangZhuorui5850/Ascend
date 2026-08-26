function profileScopeKey(profile, payload) {
  const profileId = boundedSegment(profile?.id, "profile");
  const serverId = boundedSegment(payload?.server?.instanceId, profileId);
  const workspaceId = boundedSegment(payload?.workspace?.id, "workspace");
  return `${profileId}/${serverId}/${workspaceId}`;
}

function localProblemKey(scopeKey, problemId, language = "cpp17") {
  const id = Number(problemId);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error("题目 ID 无效");
  return `${scopeKey}/${id}/${boundedSegment(language, "cpp17")}`;
}

function scopedProblemPaths(store, scopeKey) {
  const value = store && typeof store === "object" ? store[scopeKey] : null;
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function withScopedProblemPath(store, scopeKey, problemId, record) {
  const currentStore = store && typeof store === "object" && !Array.isArray(store) ? store : {};
  const currentPaths = scopedProblemPaths(currentStore, scopeKey);
  return {
    ...currentStore,
    [scopeKey]: {
      ...currentPaths,
      [problemId]: record,
    },
  };
}

function migrateLegacyProblemPaths(store, scopeKey, legacyPaths) {
  if (Object.keys(scopedProblemPaths(store, scopeKey)).length) return store;
  const legacy = legacyPaths && typeof legacyPaths === "object" && !Array.isArray(legacyPaths) ? legacyPaths : {};
  if (!Object.keys(legacy).length) return store;
  return { ...(store || {}), [scopeKey]: { ...legacy } };
}

function metadataMatchesScope(metadata, expected) {
  if (!metadata || Number(metadata.schemaVersion || 0) < 2) return false;
  return (
    metadata.profileId === expected.profileId
    && metadata.serverInstanceId === expected.serverInstanceId
    && metadata.workspaceId === expected.workspaceId
    && Number(metadata.problemId) === Number(expected.problemId)
  );
}

function boundedSegment(value, fallback) {
  const normalized = String(value || "").trim();
  return normalized ? normalized.slice(0, 160) : fallback;
}

module.exports = {
  localProblemKey,
  metadataMatchesScope,
  migrateLegacyProblemPaths,
  profileScopeKey,
  scopedProblemPaths,
  withScopedProblemPath,
};
