import { FileExplorer } from "@/components/FileExplorer";
import { getDb } from "@/lib/db";
import { requirePageSession } from "@/lib/page-auth";
import { getFileExplorerWithDb } from "@/lib/repository";

export const dynamic = "force-dynamic";

type Query = { [key: string]: string | string[] | undefined };

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

export default async function AssetsPage({ searchParams }: { searchParams: Promise<Query> }) {
  await requirePageSession("/assets");

  const query = await searchParams;
  const explorer = getFileExplorerWithDb(getDb(), first(query.folder));

  return (
    <div className="pageStack">
      <div className="pageHeader drivePageHeader">
        <span className="eyebrow">Drive</span>
        <h1>资料库</h1>
        <p>专门管理文件和目录。左侧是文件夹树，中间按资源管理器方式浏览、上传和移动文件。</p>
      </div>
      <FileExplorer initialExplorer={explorer} />
    </div>
  );
}
