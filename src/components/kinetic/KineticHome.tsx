"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowRight, ArrowUpRight, Brain, Check, ChevronRight, Clock3,
  Command, Flame, Focus, Gauge, Pause, Play, RotateCcw, Sparkles,
  Target, X, Zap,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { updatePlannerTaskAction } from "@/app/actions/planner-tasks";
import styles from "./KineticHome.module.css";

export type KineticHomeData = {
  displayName: string;
  today: string;
  learningGoal: string;
  momentum: number;
  weekly: {
    targetMinutes: number;
    studiedMinutes: number;
    plannedMinutes: number;
    unallocatedMinutes: number;
    overloadMinutes: number;
    dailyMinutes: Array<{ day: string; minutes: number }>;
  };
  summary: {
    dueReviews: number;
    dueMistakes: number;
    studyMinutes: number;
    reviewsDone: number;
    mistakesLogged: number;
    streak: number;
    openTasks: number;
    doneTasks: number;
  };
  missions: Array<{
    id: string;
    version: number;
    index: string;
    title: string;
    subject: string;
    duration: number;
    priority: 1 | 2 | 3;
    scheduledTime: string | null;
    dueDate: string | null;
    completed: boolean;
  }>;
  subjects: Array<{
    code: string;
    name: string;
    mastery: number;
    due: number;
    mistakes: number;
    points: number;
    position: { x: number; y: number };
  }>;
  echoes: Array<{
    id: string;
    subjectCode: string;
    title: string;
    tierName: string;
    mastery: number;
    due: boolean;
    reasons: string[];
    openMistakes: number;
  }>;
  exams: Array<{ name: string; date: string; subjectCode?: string; targetScore?: number; days: number }>;
  pluginSignals: Array<{ key: string; label: string; title: string; description: string; count: number; href: string }>;
};

type ViewMode = "pulse" | "map" | "echo";

const viewLabels: Record<ViewMode, string> = {
  pulse: "今日脉冲",
  map: "知识星图",
  echo: "复习回声",
};

function formatTimer(total: number) {
  return `${String(Math.floor(total / 60)).padStart(2,"0")}:${String(total % 60).padStart(2,"0")}`;
}

export function KineticHome({ data }: { data: KineticHomeData }) {
  const reduceMotion = useReducedMotion();
  const [mode, setMode] = useState<ViewMode>("pulse");
  const [missions, setMissions] = useState(data.missions);
  const [focusMission, setFocusMission] = useState<(typeof missions)[number] | null>(null);
  const [focusRunning, setFocusRunning] = useState(false);
  const [focusSeconds, setFocusSeconds] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [activeSubject, setActiveSubject] = useState(data.subjects[0]?.code ?? "");
  const [pending, startTransition] = useTransition();

  const openMissions = useMemo(() => missions.filter((item) => !item.completed), [missions]);
  const activeMission = openMissions[0] ?? missions[0] ?? null;
  const activeSubjectData = data.subjects.find((subject) => subject.code === activeSubject) ?? data.subjects[0];
  const pendingReviews = data.summary.dueReviews + data.summary.dueMistakes;
  const maxDaily = Math.max(...data.weekly.dailyMinutes.map((day) => day.minutes), 1);

  useEffect(() => {
    if (!focusMission || !focusRunning || focusSeconds <= 0) return;
    const timer = window.setInterval(() => setFocusSeconds((value) => {
      if (value <= 1) { setFocusRunning(false); setToast("专注区间完成 · 可以记录学习输出"); return 0; }
      return value - 1;
    }), 1000);
    return () => window.clearInterval(timer);
  }, [focusMission, focusRunning, focusSeconds]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const openFocus = (mission: (typeof missions)[number]) => {
    setFocusMission(mission);
    setFocusSeconds(mission.duration * 60);
    setFocusRunning(false);
  };

  const completeMission = (mission: (typeof missions)[number]) => {
    const previous = missions;
    setMissions((items) => items.map((item) => item.id === mission.id ? { ...item, completed: !item.completed } : item));
    startTransition(async () => {
      const result = await updatePlannerTaskAction({
        id: mission.id,
        expectedVersion: mission.version,
        status: mission.completed ? "open" : "completed",
      });
      if (!result.ok) {
        setMissions(previous);
        setToast(result.conflict ? "任务已在其他设备更新，轨迹已恢复" : result.error || "任务更新失败");
        return;
      }
      if (result.entity) {
        setMissions((items) => items.map((item) => item.id === mission.id ? {
          ...item,
          completed: result.entity!.status === "completed",
          version: result.entity!.version,
        } : item));
      }
      setToast(mission.completed ? "任务重新进入轨道" : "轨迹已完成 · 动量已更新");
    });
  };

  return (
    <div className={styles.page} data-mode={mode}>
      <section className={styles.viewSwitcher} aria-label="首页视图">
        {(Object.keys(viewLabels) as ViewMode[]).map((view) => (
          <button className={mode === view ? styles.viewActive : ""} key={view} onClick={() => setMode(view)} type="button">
            {mode === view ? <motion.i layoutId="kinetic-home-mode" /> : null}<span>{viewLabels[view]}</span>
          </button>
        ))}
      </section>

      <AnimatePresence mode="wait">
        <motion.div className={styles.stage} key={mode} initial={reduceMotion ? false : { opacity: 0, y: 18, filter: "blur(12px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={reduceMotion ? undefined : { opacity: 0, y: -10, filter: "blur(8px)" }}>
          {mode === "pulse" ? (
            <>
              <section className={styles.heroCopy}>
                <div className={styles.eyebrow}><span>{formatDate(data.today)}</span><i /><span>{data.summary.streak} DAY STREAK</span></div>
                <h1>把今天的<span>势能</span><br />变成真正的理解。</h1>
                <p>{data.learningGoal || `${data.displayName}，今天只推进最有价值的一步。任务、复习与学习信号已经汇入同一条轨迹。`}</p>
                <div className={styles.heroActions}>
                  {activeMission ? <button className={styles.primaryAction} onClick={() => openFocus(activeMission)} type="button"><span><Play fill="currentColor" size={16} />进入深潜</span><i><ArrowUpRight size={18} /></i></button> : <Link className={styles.primaryAction} href={`/kinetic/day/${data.today}#day-tasks`}><span><Zap size={16} />建立第一条轨迹</span><i><ArrowUpRight size={18} /></i></Link>}
                  <Link className={styles.textAction} href={`/kinetic/day/${data.today}`}>进入今日工作台 <ArrowRight size={16} /></Link>
                </div>
                {data.exams[0] ? <Link className={styles.examSignal} href="/kinetic/mock-exams"><Target size={14} /><span>{data.exams[0].subjectCode || "MILESTONE"} · {data.exams[0].name}</span><strong>{data.exams[0].days === 0 ? "今天" : `${data.exams[0].days} 天`}</strong></Link> : null}
              </section>

              <section className={styles.coreVisual} aria-label={`本周学习动量 ${data.momentum}%`}>
                <div className={styles.orbitSystem}>
                  <span className={styles.ringOne} /><span className={styles.ringTwo} /><span className={styles.ringThree} />
                  <span className={styles.satellite}><Brain size={18} /></span><span className={styles.satelliteTwo}><Zap size={16} /></span>
                  <div className={styles.coreDisc}>
                    <svg viewBox="0 0 180 180" aria-hidden="true"><circle cx="90" cy="90" r="78" /><motion.circle className={styles.progressCircle} cx="90" cy="90" r="78" initial={reduceMotion ? false : { pathLength: 0 }} animate={{ pathLength: Math.min(1,data.momentum / 100) }} /></svg>
                    <div><small>WEEKLY MOMENTUM</small><strong>{data.momentum}<sup>%</sup></strong><span><Flame size={12} />真实学习记录</span></div>
                  </div>
                  <small className={styles.orbitCaptionA}>STUDIED {data.weekly.studiedMinutes}</small><small className={styles.orbitCaptionB}>TARGET {data.weekly.targetMinutes}</small>
                </div>
              </section>

              <aside className={styles.nextCard}>
                <div className={styles.cardGlow} />
                <header><span><Target size={14} />下一条轨迹</span><small>{activeMission ? priorityLabel(activeMission.priority) : "等待建立"}</small></header>
                {activeMission ? <><span className={styles.missionIndex}>{activeMission.index}</span><h2>{activeMission.title}</h2><p>{activeMission.subject}</p><div className={styles.missionMeta}><span><Clock3 size={13} />{activeMission.duration} 分钟</span><span>{activeMission.scheduledTime || activeMission.dueDate || "尚未排时"}</span></div><button onClick={() => openFocus(activeMission)} type="button">从这里开始 <ChevronRight size={16} /></button></> : <><span className={styles.missionIndex}>00</span><h2>今天还没有排定任务</h2><p>先放入一个 25 分钟内可以完成的动作。</p><Link href="/kinetic/tasks">打开任务轨迹 <ChevronRight size={16} /></Link></>}
              </aside>

              <section className={styles.missionStream}>
                <header><div><small>LIVE MISSION STREAM</small><h2>今日任务轨迹</h2></div><p>{openMissions.length} 条开放 · {missions.filter((item) => item.completed).length} 条完成</p></header>
                <div className={styles.missionList}>
                  {missions.map((mission) => <motion.article className={mission.completed ? styles.missionDone : ""} layout key={mission.id}>
                    <button aria-label={mission.completed ? `恢复 ${mission.title}` : `完成 ${mission.title}`} className={styles.checkButton} disabled={pending} onClick={() => completeMission(mission)} type="button">{mission.completed ? <Check size={15} /> : mission.index}<i /></button>
                    <div><span>{mission.subject}</span><h3>{mission.title}</h3></div>
                    <span className={styles.taskSchedule}>{mission.scheduledTime || mission.dueDate || "自由轨道"}</span>
                    <span className={styles.taskPriority} data-priority={mission.priority}>{priorityLabel(mission.priority)}</span>
                    <span className={styles.taskDuration}>{mission.duration}m</span>
                    <button aria-label={`专注 ${mission.title}`} className={styles.focusButton} onClick={() => openFocus(mission)} type="button"><Focus size={15} /></button>
                  </motion.article>)}
                  {!missions.length ? <div className={styles.emptyStream}><Sparkles size={20} /><strong>今天的轨道还是空的</strong><Link href="/kinetic/tasks">去 Inbox 安排任务</Link></div> : null}
                </div>
              </section>

              <aside className={styles.rhythmPanel}>
                <header><div><small>7 DAY RHYTHM</small><h2>学习节律</h2></div><Gauge size={17} /></header>
                <div className={styles.rhythmChart}>{data.weekly.dailyMinutes.map((day,index) => <i key={day.day} style={{ transform: `scaleY(${Math.max(.04,day.minutes / maxDaily)})` }}><span>{day.minutes}</span>{index === data.weekly.dailyMinutes.length - 1 ? <b>NOW</b> : null}</i>)}</div>
                <footer><span>已学习 {data.weekly.studiedMinutes}m</span><span>已排 {data.weekly.plannedMinutes}m</span></footer>
              </aside>
            </>
          ) : null}

          {mode === "map" ? (
            <section className={styles.mapLayout}>
              <div className={styles.mapIntro}><span>KNOWLEDGE ORBITS</span><h1>知识不是目录，<br />是一张<span>活的星图。</span></h1><p>节点大小来自真实知识点规模；掌握度、到期复习和开放错题共同决定当前轨道状态。</p><div><i /><span>稳定</span><i /><span>到期</span><i /><span>有错题</span></div></div>
              <div className={styles.knowledgeMap}>
                <svg viewBox="0 0 100 100" aria-hidden="true">{data.subjects.map((subject) => <path d={`M 50 50 L ${subject.position.x} ${subject.position.y}`} key={subject.code} />)}</svg>
                <div className={styles.mapCore}><small>KNOWLEDGE</small><strong>{data.subjects.reduce((sum,item) => sum + item.points,0)}</strong><span>POINTS</span></div>
                {data.subjects.map((subject) => <button aria-label={`${subject.name}，掌握度 ${subject.mastery}%`} className={activeSubject === subject.code ? styles.mapNodeActive : styles.mapNode} data-alert={subject.due || subject.mistakes ? "true" : "false"} key={subject.code} onClick={() => setActiveSubject(subject.code)} style={{ left: `${subject.position.x}%`, top: `${subject.position.y}%`, width: `${Math.max(58,Math.min(90,58 + subject.points))}px` }} type="button"><span>{subject.code}</span><i /></button>)}
              </div>
              <aside className={styles.subjectInspector}>{activeSubjectData ? <><span>{activeSubjectData.code}</span><small>SELECTED ORBIT</small><h2>{activeSubjectData.name}</h2><strong>{activeSubjectData.mastery}% 掌握</strong><p>{activeSubjectData.points} 个知识点 · {activeSubjectData.due} 个到期 · {activeSubjectData.mistakes} 个开放错题</p><div><span><small>POINTS</small><b>{activeSubjectData.points}</b></span><span><small>DUE</small><b>{activeSubjectData.due}</b></span><span><small>ERROR</small><b>{activeSubjectData.mistakes}</b></span></div><Link href={`/kinetic/subjects/${activeSubjectData.code}`}>进入知识轨道 <ArrowUpRight size={16} /></Link></> : <><h2>还没有知识星体</h2><Link href="/kinetic/subjects">建立第一个科目</Link></>}</aside>
            </section>
          ) : null}

          {mode === "echo" ? (
            <section className={styles.echoLayout}>
              <div className={styles.echoHero}><span>SPACED REPETITION</span><h1>真正的理解，<br />会在时间里<span>留下回声。</span></h1><p>这里只展示真实的到期、失败和开放错题信号。优先处理能改变后续轨迹的薄弱点。</p><Link href={`/kinetic/day/${data.today}#day-reviews`}><Play fill="currentColor" size={15} />开始今日回声</Link><div className={styles.echoPulse}><Brain size={30} /><i /><i /><strong>{pendingReviews}</strong><small>到期待清</small></div></div>
              <div className={styles.echoStack}>
                {data.echoes.map((echo,index) => <article key={echo.id}><span>{String(index + 1).padStart(2,"0")}</span><div><small>{echo.subjectCode} · {echo.tierName}</small><h2>{echo.title}</h2><p>{echo.reasons.join(" · ") || "需要再次提取"}</p></div><div className={styles.echoStrength}><i style={{ transform: `scaleX(${Math.max(.04,echo.mastery / 100)})` }} /><small>掌握 {echo.mastery}%</small></div><strong>{echo.due ? "今天" : echo.openMistakes ? `${echo.openMistakes} 错题` : "观察"}</strong><Link aria-label={`打开 ${echo.title}`} href={`/kinetic/subjects/${echo.subjectCode}?focus=${echo.id}`}><ArrowUpRight size={16} /></Link></article>)}
                {!data.echoes.length ? <div className={styles.emptyEcho}><Sparkles size={24} /><h2>目前没有高优先级回声</h2><p>完成一次有证据的复习后，新的信号会在这里出现。</p></div> : null}
              </div>
              <aside className={styles.echoManifesto}><span>EVIDENCE, NOT FEELING</span><blockquote>“不要问看懂没有，去看一周后能否无提示重建。”</blockquote><p>延迟提取、错题回炉和信心校准共同构成学习结果证据。</p><div><span>今日完成 {data.summary.reviewsDone}</span><span>新增错题 {data.summary.mistakesLogged}</span></div></aside>
            </section>
          ) : null}
        </motion.div>
      </AnimatePresence>

      {data.pluginSignals.length ? <section className={styles.pluginSignals}>{data.pluginSignals.map((signal) => <Link href={signal.href} key={signal.key}><Command size={15} /><div><small>{signal.label}</small><strong>{signal.title}</strong><p>{signal.description}</p></div><b>{signal.count}</b><ArrowUpRight size={16} /></Link>)}</section> : null}

      <AnimatePresence>{focusMission ? <FocusLayer mission={focusMission} running={focusRunning} seconds={focusSeconds} onClose={() => { setFocusRunning(false); setFocusMission(null); }} onReset={() => { setFocusRunning(false); setFocusSeconds(focusMission.duration * 60); }} onToggle={() => setFocusRunning((value) => !value)} /> : null}</AnimatePresence>
      <AnimatePresence>{toast ? <motion.div className={styles.toast} initial={{ opacity: 0, y: 25, scale: .94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12 }} role="status"><Sparkles size={15} />{toast}</motion.div> : null}</AnimatePresence>
    </div>
  );
}

function FocusLayer({ mission, running, seconds, onClose, onReset, onToggle }: {
  mission: KineticHomeData["missions"][number]; running: boolean; seconds: number;
  onClose: () => void; onReset: () => void; onToggle: () => void;
}) {
  const reduceMotion = useReducedMotion();
  return <motion.div className={styles.focusLayer} initial={reduceMotion ? false : { opacity: 0, clipPath: "circle(0% at 50% 50%)" }} animate={{ opacity: 1, clipPath: "circle(100% at 50% 50%)" }} exit={{ opacity: 0, clipPath: "circle(0% at 50% 50%)" }}>
    <div className={styles.focusAtmosphere} aria-hidden="true"><i /><i /><i /></div>
    <button aria-label="退出专注" className={styles.focusClose} onClick={onClose} type="button"><X size={18} />退出</button>
    <small>DEEP FOCUS / {mission.subject}</small><h2>{mission.title}</h2><strong>{formatTimer(seconds)}</strong><p>{running ? "保持当前轨迹。只处理这一件事。" : "准备好后开始；退出不会自动记录学习时长。"}</p>
    <div><button aria-label={running ? "暂停" : "开始"} onClick={onToggle} type="button">{running ? <Pause fill="currentColor" size={25} /> : <Play fill="currentColor" size={25} />}</button><button aria-label="重置" onClick={onReset} type="button"><RotateCcw size={18} /></button></div>
    <span>{running ? "SESSION IN MOTION" : "READY WHEN YOU ARE"}</span>
  </motion.div>;
}

function priorityLabel(priority: 1 | 2 | 3) { return priority === 1 ? "深潜" : priority === 2 ? "稳定" : "轻量"; }
function formatDate(date: string) { return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", weekday: "short", timeZone: "Asia/Shanghai" }).format(new Date(`${date}T00:00:00+08:00`)); }
