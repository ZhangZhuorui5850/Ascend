import { FileExplorer } from "@/components/FileExplorer";
import { getDb } from "@/lib/db";
import { requirePageWorkspace } from "@/lib/page-auth";
import { getExplorer, searchAssets } from "@/lib/repo/library";

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

  return (
    <div className="pageStack fullHeight">
      <FileExplorer explorer={explorer} searchQuery={q} searchResults={searchResults} />
    </div>
  );
}
