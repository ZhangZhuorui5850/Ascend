import { ExtensionsManager } from "@/components/ExtensionsManager";
import { getDb } from "@/lib/db";
import { requirePageWorkspace } from "@/lib/page-auth";
import { listWorkspacePlugins } from "@/lib/repo/plugins";

export const dynamic = "force-dynamic";

export default async function ExtensionsPage() {
  const access = await requirePageWorkspace("/extensions");
  const plugins = listWorkspacePlugins(getDb(), access);

  return (
    <div className="pageStack extensionsPage">
      <header className="pageHeader">
        <span className="eyebrow">EXTENSIONS · 扩展能力</span>
        <h1>扩展中心</h1>
        <p>按需要启用经过审查的学习能力；每个扩展都有独立权限、数据和停用边界。</p>
      </header>
      <ExtensionsManager initial={plugins} />
    </div>
  );
}
