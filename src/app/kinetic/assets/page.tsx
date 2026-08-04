import { Database, FileStack, FolderTree, HardDrive, Orbit, Search } from "lucide-react";
import { FileExplorer } from "@/components/FileExplorer";
import { getDb } from "@/lib/db";
import { requirePageWorkspace } from "@/lib/page-auth";
import { getCaptureHierarchy } from "@/lib/repo/knowledge";
import { getExplorer, getStorageUsage, searchAssets } from "@/lib/repo/library";
import styles from "@/components/kinetic/KineticResource.module.css";

export const dynamic="force-dynamic";
type Query={ [key:string]:string|string[]|undefined };
const first=(value:string|string[]|undefined)=>Array.isArray(value)?value[0]||"":value||"";

export default async function KineticAssetsPage({searchParams}:{searchParams:Promise<Query>}){
  const access=await requirePageWorkspace("/kinetic/assets"); const query=await searchParams; const folder=first(query.folder); const q=first(query.q).trim(); const page=Math.max(1,Number(first(query.page))||1); const db=getDb(); const explorer=getExplorer(db,access,folder,{page,pageSize:100}); const usage=getStorageUsage(db,access); const percent=usage.quotaBytes?Math.round(usage.usedBytes/usage.quotaBytes*100):0;
  return <div className={styles.page}>
    <header className={styles.libraryHero}><div><span><Database size={14}/>CONNECTED RESEARCH MEMORY</span><h1>文件不是终点，<br/>要进入<span>可检索的学习上下文。</span></h1><p>资料通过科目、章节、知识点、日期与备注建立连接。目录负责空间组织，元数据负责未来能否找回。</p></div><div className={styles.memoryCore}><i/><i/><HardDrive size={27}/><strong>{explorer.totalFiles}</strong><small>CONNECTED ARTIFACTS</small></div><section><div><small>STORAGE</small><strong>{formatBytes(usage.usedBytes)}</strong></div><div><small>USAGE</small><strong>{percent}<span>%</span></strong></div><div><small>CONTEXT</small><strong>{getCaptureHierarchy(db,access).length}</strong></div></section></header>
    <section className={styles.librarySignals}><div><FolderTree size={18}/><span><small>CURRENT ORBIT</small><strong>{explorer.currentPath||"资料库根目录"}</strong></span></div><div><FileStack size={18}/><span><small>VISIBLE FILES</small><strong>{explorer.currentFolderFileCount}</strong></span></div><div><Search size={18}/><span><small>QUERY</small><strong>{q||"全部连接"}</strong></span></div><div><Orbit size={18}/><span><small>PAGE</small><strong>{explorer.filePage}/{explorer.filePageCount}</strong></span></div></section>
    <div className={styles.explorerSurface}><FileExplorer basePath="/kinetic/assets" explorer={explorer} hierarchy={getCaptureHierarchy(db,access)} searchQuery={q} searchResults={q?searchAssets(db,access,q):null} usage={usage}/></div>
  </div>;
}
function formatBytes(value:number){if(value>=1024*1024*1024)return`${(value/1024/1024/1024).toFixed(1)}GB`;if(value>=1024*1024)return`${(value/1024/1024).toFixed(1)}MB`;if(value>=1024)return`${Math.round(value/1024)}KB`;return`${value}B`}
