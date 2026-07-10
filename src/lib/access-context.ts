export type UserRole = "admin" | "user";
export type UserStatus = "invited" | "active" | "suspended";

export type WorkspaceScope = {
  workspaceId: string;
};

export type AccessContext = {
  userId: string;
  email: string;
  displayName: string;
  role: UserRole;
  status: UserStatus;
  workspaceId: string | null;
};
