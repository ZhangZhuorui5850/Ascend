import type Database from "better-sqlite3";
import type { AccessContext } from "../access-context";

export type AgentContext = AccessContext & { workspaceId: string };

type AgentUserRow = {
  userId: string;
  email: string;
  displayName: string;
  role: "user";
  status: "active";
  workspaceId: string;
  mustChangePassword: number;
};

/** Resolve the local Agent process to exactly one active learning workspace. */
export function resolveAgentContext(
  db: Database.Database,
  requestedEmail = process.env.ASCEND_AGENT_EMAIL,
): AgentContext {
  const email = requestedEmail?.trim().toLowerCase() || "";
  const rows = db
    .prepare(
      `
    SELECT
      u.id AS userId,
      u.email,
      u.display_name AS displayName,
      u.role,
      u.status,
      u.must_change_password AS mustChangePassword,
      w.id AS workspaceId
    FROM users u
    JOIN workspaces w ON w.owner_user_id = u.id
    WHERE u.role = 'user' AND u.status = 'active'
      AND (@email = '' OR LOWER(u.email) = @email)
    ORDER BY u.created_at ASC, u.id ASC
  `,
    )
    .all({ email }) as AgentUserRow[];

  if (!rows.length) {
    throw new Error(
      email ? `没有找到可供 Agent 使用的活跃普通账号：${email}` : "没有找到可供 Agent 使用的活跃普通账号",
    );
  }
  if (!email && rows.length > 1) {
    throw new Error("存在多个学习账号；请设置 ASCEND_AGENT_EMAIL 或在 CLI 中传入 --email");
  }

  const row = rows[0];
  if (row.mustChangePassword) throw new Error("该账号必须先在网页中完成密码修改");
  return {
    userId: row.userId,
    email: row.email,
    displayName: row.displayName,
    role: row.role,
    status: row.status,
    workspaceId: row.workspaceId,
    mustChangePassword: false,
  };
}
