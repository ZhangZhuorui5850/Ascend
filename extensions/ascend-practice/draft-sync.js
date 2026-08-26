function draftConflictFromError(error) {
  const errorCode = error?.details?.error?.code || error?.details?.errorCode;
  if (error?.status !== 409 || errorCode !== "DRAFT_CONFLICT") return null;
  const current = error.details?.error?.details?.current || error.details?.conflict;
  if (!current || !Number.isInteger(Number(current.revision))) return null;
  return {
    revision: Number(current.revision),
    sha256: String(current.sha256 || ""),
    updatedAt: String(current.updatedAt || ""),
    deviceId: String(current.deviceId || ""),
    deviceName: String(current.deviceName || ""),
  };
}

function draftConflictDecision(choice) {
  if (choice === "查看并载入云端") return "load-cloud";
  if (choice === "保留本地并保存") return "overwrite-cloud";
  return "cancel";
}

module.exports = { draftConflictDecision, draftConflictFromError };
