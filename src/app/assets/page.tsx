import { FileExplorer } from "@/components/FileExplorer";
import { getDb } from "@/lib/db";
import { requirePageWorkspace } from "@/lib/page-auth";
import { getExplorer, getStorageUsage, searchAssets } from "@/lib/repo/library";
import { getCaptureHierarchy } from "@/lib/repo/knowledge";

export const dynamic = "force-dynamic";

type Query = { [key: string]: string | string[] | undefined };

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

export default async function AssetsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const access = await requirePageWorkspace("/assets");

  const query = await searchParams;
  const folder = first(query.folder);
  const q = first(query.q).trim();
  const db = getDb();
  const explorer = getExplorer(db, access, folder);
  const searchResults = q ? searchAssets(db, access, q) : null;
  const usage = getStorageUsage(db, access);
  const hierarchy = getCaptureHierarchy(db, access);

  return (
    <div className="pageStack fullHeight">
      <header className="pageHeader assetPageHeader">
        <span className="eyebrow">CONNECTED LIBRARY · 关联资料库</span>
        <h1>资料库</h1>
        <p>文件通过科目、章节、知识点与日期进入学习上下文。</p>
      </header>
      <FileExplorer explorer={explorer} hierarchy={hierarchy} searchQuery={q} searchResults={searchResults} usage={usage} />
    </div>
  );
}
