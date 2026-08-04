import { ArrowUpRight, BrainCircuit, CheckCircle2, Flame, Orbit, RotateCcw } from "lucide-react";
import Link from "next/link";
import { CreateTrainingTaskButton } from "@/components/CreateTrainingTaskButton";
import { MistakeReattempt } from "@/components/MistakeReattempt";
import { RichText } from "@/components/RichText";
import { todayKey } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { requirePageWorkspace } from "@/lib/page-auth";
import { getMistakeBook } from "@/lib/repo/reviews";
import styles from "@/components/kinetic/KineticLearning.module.css";

export const dynamic="force-dynamic";

export default async function KineticMistakesPage(){
  const access=await requirePageWorkspace("/kinetic/mistakes"); const today=todayKey(); const book=getMistakeBook(getDb(),access,today);
  const total=book.open.length+book.graduated.length; const graduation=total?Math.round(book.graduated.length/total*100):0;
  const causes=Object.entries(book.open.reduce<Record<string,number>>((result,item)=>{const key=item.cause_category||"待归因";result[key]=(result[key]||0)+1;return result;},{})).sort((a,b)=>b[1]-a[1]).slice(0,5);
  return <div className={styles.page}>
    <header className={styles.errorHero}><div><span><BrainCircuit size={14}/>ERROR ECHO FIELD</span><h1>错题不是失败，<br/>是模型暴露出的<span>可训练梯度。</span></h1><p>先无提示重做，再核对错因；跨日稳定答对后才毕业。熟悉感不算证据。</p></div><div className={styles.errorPulse}><i/><i/><RotateCcw size={28}/><strong>{book.due.length}</strong><small>DUE NOW</small></div><section><div><small>OPEN LOOP</small><strong>{book.open.length}</strong></div><div><small>GRADUATED</small><strong>{book.graduated.length}</strong></div><div><small>RESOLUTION</small><strong>{graduation}<span>%</span></strong></div></section></header>
    <section className={styles.reattemptField}><header><div><span>01 / ACTIVE RETRIEVAL</span><h2>今日无提示重做</h2><p>{book.due.length?`${book.due.length} 道到期错题等待重新取得证据。`:"今天没有到期错题，时间场保持清洁。"}</p></div><Link href={`/kinetic/day/${today}#day-reviews`}>进入完整回声场 <ArrowUpRight size={14}/></Link></header><div className={styles.legacySurface}>{book.due.length?<MistakeReattempt day={today} mistakes={book.due}/>:<div className={styles.clearField}><CheckCircle2 size={30}/><strong>今日回炉已清空</strong><span>继续推进新轨迹，系统会在合适的间隔重新发出信号。</span></div>}</div></section>
    <section className={styles.errorDashboard}>
      <article className={styles.openErrors}><header><div><span>OPEN ERROR LOOPS</span><h2>回炉队列</h2></div><strong>{book.open.length}</strong></header><div>{book.open.map((mistake,index)=><div id={`mistake-${mistake.id}`} key={mistake.id}><span className={styles.errorIndex}>{String(index+1).padStart(2,"0")}</span><i/><div><small>{mistake.subject_code||"GENERAL"} · {mistake.next_review?`下次 ${mistake.next_review}`:"待排期"}</small><strong><RichText text={mistake.title}/></strong><p><RichText text={mistake.knowledge_title||mistake.cause||mistake.day}/></p></div><CreateTrainingTaskButton compact completionCriteria="独立重做并订正该错题，再完成一道同类题" day={today} knowledgePointId={mistake.knowledge_point_id} notes={`错题来源：${mistake.day}；错因：${mistake.cause_category||mistake.cause||"待归因"}`} sourceId={mistake.id} sourceType="mistake" subjectCode={mistake.subject_code} title={`错题专项：${mistake.title}`} verificationMethod="独立重做与同类题验证"/></div>)}{!book.open.length?<p>暂无开放错题。</p>:null}</div></article>
      <aside className={styles.causeRadar}><header><Flame size={18}/><span>CAUSE DISTRIBUTION</span><h2>错因信号</h2></header>{causes.map(([cause,count])=><div key={cause}><span>{cause}</span><i><b style={{transform:`scaleX(${count/Math.max(1,causes[0]?.[1]||1)})`}}/></i><strong>{count}</strong></div>)}{!causes.length?<p>记录具体错因后，这里会出现结构性信号。</p>:null}<Link href="/kinetic/analytics">进入学习分析 <ArrowUpRight size={14}/></Link></aside>
    </section>
    {book.graduated.length?<section className={styles.graduateStream}><header><div><span>RESOLVED EVIDENCE</span><h2>最近毕业</h2></div><CheckCircle2 size={20}/></header><div>{book.graduated.slice(0,12).map((mistake)=><article key={mistake.id}><Orbit size={14}/><span><small>{mistake.day}</small><strong><RichText text={mistake.title}/></strong></span></article>)}</div></section>:null}
  </div>;
}
