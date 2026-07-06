import Link from "next/link";
import { getAssets } from "@/lib/repository";

export const dynamic = "force-dynamic";

export default function AssetsPage() {
  const assets = getAssets() as Array<{ id: number; day: string; original_name: string; mime_type: string; size: number }>;
  return (
    <div className="pageStack">
      <div className="pageHeader"><span className="eyebrow">Library</span><h1>资料库</h1><p>所有拖入文件都复制入库，并按日期组织。</p></div>
      <div className="assetList card">
        {assets.map((asset) => (
          <Link href={`/api/assets/${asset.id}/file`} target="_blank" className="assetRow" key={asset.id}>
            <span>{asset.day}</span>
            <strong>{asset.original_name}</strong>
            <small>{asset.mime_type || "file"} · {Math.round(asset.size / 1024)} KB</small>
          </Link>
        ))}
        {!assets.length ? <p className="empty">还没有资料。使用右侧收纳小窗口上传。</p> : null}
      </div>
    </div>
  );
}
