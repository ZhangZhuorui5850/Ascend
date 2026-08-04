import { ArrowLeft, ArrowUpRight, Brain, FileText, Target } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RichText } from "@/components/RichText";
import { SubjectWorkbench } from "@/components/SubjectWorkbench";
import { assetFileUrl } from "@/lib/asset-url";
import { todayKey } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { requirePageWorkspace } from "@/lib/page-auth";
import { flattenChapterPoints, flattenPointTree, getSubjectDetail } from "@/lib/repo/knowledge";
import styles from "@/components/kinetic/KineticLearning.module.css";

export const dynamic = "force-dynamic";

export default async function KineticSubjectPage({ params, searchParams }: { params:Promise<{code:string}>; searchParams:Promise<{focus?:string;view?:string}> }) {
  const {code}=await params; const {focus,view}=await searchParams;
  const access=await requirePageWorkspace(`/kinetic/subjects/${code}`);
  const detail=getSubjectDetail(getDb(),access,decodeURIComponent(code));
  if(!detail) notFound();
  const today=todayKey();
  const points=[...flattenChapterPoints(detail.chapters),...flattenPointTree(detail.loosePoints)];
  const mastered=points.filter((point)=>point.status==="已掌握").length;
  const due=points.filter((point)=>point.next_review&&point.next_review<=today).length;
  const mistakes=detail.mistakes.filter((item)=>!item.graduated).length;
  const mastery=points.length?Math.round(mastered/points.length*100):0;

  return <div className={styles.page}>
    <header className={styles.subjectHero}>
      <div><Link href="/kinetic/subjects"><ArrowLeft size={14}/>全部轨道</Link><span>{detail.subject.code} / KNOWLEDGE ORBIT</span><h1>{detail.subject.name}</h1><p>{detail.subject.description||"把章节、知识点、资料与错题证据汇聚到同一条学习轨道。"}</p></div>
      <div className={styles.subjectGauge}><svg viewBox="0 0 160 160"><circle cx="80" cy="80" r="69"/><circle className={styles.gaugeProgress} cx="80" cy="80" r="69" style={{strokeDasharray:`${mastery*4.34} 434`}}/></svg><Brain size={21}/><strong>{mastery}<span>%</span></strong><small>MASTERY</small></div>
      <section className={styles.subjectStats}><div><strong>{mastered}<span>/{points.length}</span></strong><small>稳定节点</small></div><div data-alert={due>0}><strong>{due}</strong><small>到期回声</small></div><div data-alert={mistakes>0}><strong>{mistakes}</strong><small>开放错题</small></div></section>
    </header>
    <div className={styles.workbenchSurface}><SubjectWorkbench chapters={detail.chapters} focusId={typeof focus==="string"&&focus?focus:null} loosePoints={detail.loosePoints} subject={detail.subject} today={today} view={view==="map"?"map":"list"}/></div>
    <section className={styles.evidenceGrid}>
      <article><header><div><FileText size={17}/><span>CONNECTED ARTIFACTS</span><h2>关联资料</h2></div><Link href="/kinetic/assets">资料星库 <ArrowUpRight size={14}/></Link></header><div>{detail.assets.map((asset)=><a href={assetFileUrl(asset.id)} key={asset.id} rel="noopener" target="_blank"><FileText size={15}/><span><strong>{asset.original_name}</strong><small>{asset.day}{asset.knowledge_titles?` · ${asset.knowledge_titles}`:""}</small></span><ArrowUpRight size={13}/></a>)}{!detail.assets.length?<p>还没有资料进入这条轨道。</p>:null}</div></article>
      <article><header><div><Target size={17}/><span>ERROR EVIDENCE</span><h2>错题回声</h2></div><Link href="/kinetic/mistakes">错题场 <ArrowUpRight size={14}/></Link></header><div>{detail.mistakes.map((mistake)=><div key={mistake.id}><i data-open={!mistake.graduated}/><span><strong><RichText text={mistake.title}/></strong><small><RichText text={mistake.knowledge_title||mistake.cause||mistake.day}/></small></span><em>{mistake.graduated?"已毕业":"回炉中"}</em></div>)}{!detail.mistakes.length?<p>这条轨道还没有错题证据。</p>:null}</div></article>
    </section>
  </div>;
}
