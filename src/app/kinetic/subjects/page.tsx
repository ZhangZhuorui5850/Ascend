import { ArrowUpRight, Brain, Radar, Sparkles, Target } from "lucide-react";
import Link from "next/link";
import { SubjectCreate } from "@/components/SubjectCreate";
import { todayKey } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { requirePageWorkspace } from "@/lib/page-auth";
import { getSubjectOverviews, TRACK_NAMES, type SubjectTrack } from "@/lib/repo/knowledge";
import styles from "@/components/kinetic/KineticLearning.module.css";

export const dynamic = "force-dynamic";

export default async function KineticSubjectsPage() {
  const access = await requirePageWorkspace("/kinetic/subjects");
  const subjects = getSubjectOverviews(getDb(), access, todayKey());
  const totalPoints = subjects.reduce((sum, item) => sum + item.pointCount, 0);
  const mastered = subjects.reduce((sum, item) => sum + item.masteredCount, 0);
  const due = subjects.reduce((sum, item) => sum + item.dueCount, 0);
  const mistakes = subjects.reduce((sum, item) => sum + item.openMistakes, 0);
  const groups = (["written", "machine"] as SubjectTrack[]).map((track) => ({
    track,
    items: subjects.filter((subject) => subject.track === track),
  })).filter((group) => group.items.length);

  return <div className={styles.page}>
    <header className={styles.knowledgeHero}>
      <div><span><Radar size={14}/>KNOWLEDGE ORBIT SYSTEM</span><h1>把知识从目录，<br/>变成一张<span>会反馈的星图。</span></h1><p>科目是轨道，章节是星群，知识点会根据掌握、到期复习、错题与资料信号持续改变状态。</p></div>
      <div className={styles.knowledgeCore}><i/><i/><Brain size={30}/><strong>{totalPoints}</strong><small>KNOWLEDGE NODES</small></div>
      <section className={styles.heroMetrics}><div><small>MASTERY</small><strong>{totalPoints ? Math.round(mastered/totalPoints*100) : 0}<span>%</span></strong></div><div><small>DUE ECHO</small><strong>{due}</strong></div><div><small>OPEN ERROR</small><strong>{mistakes}</strong></div></section>
    </header>

    {groups.map((group, groupIndex) => <section className={styles.orbitGroup} key={group.track}>
      <header><div><span>ORBIT {String(groupIndex+1).padStart(2,"0")}</span><h2>{TRACK_NAMES[group.track]}</h2></div><small>{group.items.length} 条主轨道</small></header>
      <div className={styles.subjectOrbitGrid}>{group.items.map((subject,index)=>{const progress=subject.pointCount?Math.round(subject.masteredCount/subject.pointCount*100):0;return <Link className={styles.subjectOrbit} href={`/kinetic/subjects/${subject.code}`} key={subject.code} style={{"--orbit-index":index} as React.CSSProperties}>
        <div className={styles.orbitVisual}><i/><i/><span>{subject.code}</span><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="54"/><circle className={styles.orbitProgress} cx="60" cy="60" r="54" style={{strokeDasharray:`${progress*3.39} 339`}}/></svg></div>
        <div className={styles.orbitCopy}><small>{subject.track === "written" ? "THEORY ORBIT" : "COMPUTE ORBIT"}</small><h3>{subject.name}</h3><p>{subject.masteredCount}/{subject.pointCount} 已掌握 · {subject.assetCount} 份资料</p><div>{subject.dueCount?<span data-tone="due">{subject.dueCount} 到期</span>:<span>轨道稳定</span>}{subject.openMistakes?<span data-tone="error">{subject.openMistakes} 错题</span>:null}</div></div>
        <ArrowUpRight size={17}/>
      </Link>})}</div>
    </section>)}
    {!subjects.length?<section className={styles.emptyUniverse}><Sparkles size={28}/><h2>知识宇宙还没有第一颗星</h2><p>从博士研究当前最需要推进的一条数学或计算机主线开始。</p></section>:null}
    <div className={styles.legacySurface}><SubjectCreate/></div>
    <Link className={styles.floatingAction} href="/kinetic/mistakes"><Target size={15}/>查看错题回声<ArrowUpRight size={14}/></Link>
  </div>;
}
