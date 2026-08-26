import type Database from "better-sqlite3";

const SERVER_INSTANCE_KEY = "server_instance_id";

export function getServerInstanceId(db: Database.Database): string {
  const row = db
    .prepare("SELECT value FROM system_metadata WHERE key = ?")
    .get(SERVER_INSTANCE_KEY) as { value: string } | undefined;
  const value = row?.value.trim() || "";
  if (!/^ascend-[a-f0-9]{32}$/.test(value)) throw new Error("Ascend 服务实例标识无效");
  return value;
}
