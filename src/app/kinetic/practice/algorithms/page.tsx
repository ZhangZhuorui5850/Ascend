import { Braces, CheckCircle2, Code2, Radar, ShieldAlert, Target } from "lucide-react";
import { notFound } from "next/navigation";
import { AlgorithmTrainingBoard } from "@/components/AlgorithmTrainingBoard";
import { todayKey } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { getJudgeRuntimeAvailability } from "@/lib/judge-runtime";
import { requirePageWorkspace } from "@/lib/page-auth";
import { getAlgorithmDashboard } from "@/lib/repo/algorithms";
import { requirePluginEnabled } from "@/lib/repo/plugins";
import styles from "@/components/kinetic/KineticResource.module.css";

export const dynamic="force-dynamic";
export default async function KineticAlgorithmsPage({searchParams}:{searchParams:Promise<{problem?:string|string[];task?:string|string[]}>}){
  const access=await requirePageWorkspace("/kinetic/practice/algorithms");const db=getDb();try{requirePluginEnabled(db,access,"algorithms")}catch{notFound()}
  const today=todayKey();const dashboard=getAlgorithmDashboard(db,access,today);const judge=getJudgeRuntimeAvailability(db,access);const query=await searchParams;const problem=parseId(query.problem);const task=parseId(query.task);
  return <div className={styles.page}>
    <header className={styles.algorithmHero}><div><span><Braces size={14}/>ALGORITHMIC TRANSFER LAB</span><h1>不是“做过”，<br/>而是能否<span>独立迁移。</span></h1><p>区分引导完成、独立完成、延迟稳定和未见变式迁移。外部记录不冒充平台验证，Judge 状态始终显式展示。</p></div><div className={styles.codeCore}><i/><i/><Code2 size={29}/><strong>{dashboard.metrics.independentCount}</strong><small>INDEPENDENT SOLVES</small></div><section><div><small>PROBLEMS</small><strong>{dashboard.metrics.problemCount}</strong></div><div><small>TRANSFER</small><strong>{dashboard.metrics.transferCount}</strong></div><div><small>DUE</small><strong>{dashboard.metrics.dueCount}</strong></div></section><div className={styles.judgeSignal} data-ready={judge.submissionAllowed}>{judge.submissionAllowed?<CheckCircle2 size={15}/>:<ShieldAlert size={15}/>}<span>{judge.submissionAllowed?"在线评测可用":judge.configured?"Judge 待批准":"外部记录模式"}</span></div></header>
    <section className={styles.transferManifest}><div><Radar size={18}/><span><small>EVIDENCE LADDER</small><strong>引导 → 独立 → 延迟 → 迁移</strong></span></div><p>只有未见变式稳定完成，才说明方法结构已经脱离原题表面。</p><Target size={18}/></section>
    <div className={styles.algorithmSurface}><AlgorithmTrainingBoard dashboard={dashboard} initialProblemId={problem} initialTaskId={task} judgeAvailability={judge} today={today}/></div>
  </div>;
}
function parseId(value:string|string[]|undefined){if(typeof value!=="string"||!/^\d{1,12}$/.test(value))return null;const parsed=Number(value);return Number.isSafeInteger(parsed)&&parsed>0?parsed:null}
