"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowRight, ArrowUpRight, BookOpen, Brain, Check, ChevronRight,
  Clock3, Command, Flame, Focus, Gauge, Orbit, Pause, Play,
  RotateCcw, Search, Sparkles, Target, X, Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { initialMissions, orbitNodes, reviewSignals, rhythm, type Mission } from "./mock";
import styles from "./kinetic.module.css";

type ViewMode = "pulse" | "map" | "echo";
type TiltHandler = (event: React.PointerEvent<HTMLElement>) => void;

const viewLabels: Record<ViewMode, string> = {
  pulse: "今日脉冲",
  map: "知识星图",
  echo: "复习回声",
};

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function energyLabel(energy: Mission["energy"]) {
  return energy === "deep" ? "深潜" : energy === "steady" ? "稳定" : "轻量";
}

export function KineticExperience() {
  const reduceMotion = useReducedMotion();
  const surfaceRef = useRef<HTMLElement>(null);
  const [mode, setMode] = useState<ViewMode>("pulse");
  const [missions, setMissions] = useState(initialMissions);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);
  const [focusRunning, setFocusRunning] = useState(false);
  const [focusSeconds, setFocusSeconds] = useState(45 * 60);
  const [clock, setClock] = useState("--:--");
  const [activeOrbit, setActiveOrbit] = useState("algorithms");
  const [toast, setToast] = useState<string | null>(null);

  const openMissions = useMemo(() => missions.filter((mission) => !mission.completed), [missions]);
  const activeMission = openMissions[0] ?? missions[0];

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2200);
  }, []);

  useEffect(() => {
    const update = () => setClock(new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(new Date()));
    update();
    const timer = window.setInterval(update, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!focusOpen || !focusRunning || focusSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setFocusSeconds((current) => {
        if (current <= 1) {
          setFocusRunning(false);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [focusOpen, focusRunning, focusSeconds]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
      if (event.key === "Escape") {
        setPaletteOpen(false);
        setFocusOpen(false);
        setFocusRunning(false);
      }
      if (!typing && event.key.toLowerCase() === "f") setFocusOpen(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const completeMission = (id: string) => {
    setMissions((current) => current.map((mission) => (
      mission.id === id ? { ...mission, completed: !mission.completed } : mission
    )));
    showToast("轨迹已更新 · 动量 +12");
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (reduceMotion || !surfaceRef.current) return;
    const x = (event.clientX / window.innerWidth) * 100;
    const y = (event.clientY / window.innerHeight) * 100;
    surfaceRef.current.style.setProperty("--pointer-x", `${x}%`);
    surfaceRef.current.style.setProperty("--pointer-y", `${y}%`);
    surfaceRef.current.style.setProperty("--drift-x", `${(x - 50) * 0.08}px`);
    surfaceRef.current.style.setProperty("--drift-y", `${(y - 50) * 0.08}px`);
  };

  const handleTilt: TiltHandler = (event) => {
    if (reduceMotion) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    event.currentTarget.style.setProperty("--rotate-x", `${y * -5}deg`);
    event.currentTarget.style.setProperty("--rotate-y", `${x * 7}deg`);
  };

  const resetTilt: TiltHandler = (event) => {
    event.currentTarget.style.setProperty("--rotate-x", "0deg");
    event.currentTarget.style.setProperty("--rotate-y", "0deg");
  };

  const switchView = (nextMode: ViewMode) => {
    setMode(nextMode);
    showToast(`已切换至${viewLabels[nextMode]}`);
  };

  return (
    <main ref={surfaceRef} className={styles.surface} onPointerMove={handlePointerMove}>
      <div className={styles.ambient} aria-hidden="true">
        <span className={styles.auroraOne} /><span className={styles.auroraTwo} />
        <span className={styles.auroraThree} /><span className={styles.cursorLight} />
        <span className={styles.grain} />
      </div>

      <motion.header className={styles.topbar}
        initial={reduceMotion ? false : { opacity: 0, y: -24 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>
        <a className={styles.brand} href="#top" aria-label="Kinetic Field 首页">
          <span className={styles.brandMark} aria-hidden="true"><span /><span /><span /></span>
          <span><strong>ASCEND</strong><small>KINETIC FIELD / 01</small></span>
        </a>
        <nav className={styles.viewNav} aria-label="概念视图">
          {(Object.keys(viewLabels) as ViewMode[]).map((view) => (
            <button key={view} type="button" className={mode === view ? styles.viewActive : ""}
              onClick={() => switchView(view)}>
              {mode === view && <motion.span layoutId="active-view" className={styles.navPill}
                transition={{ type: "spring", stiffness: 360, damping: 30 }} />}
              <span>{viewLabels[view]}</span>
            </button>
          ))}
        </nav>
        <div className={styles.topActions}>
          <button type="button" className={styles.commandButton} onClick={() => setPaletteOpen(true)}>
            <Search size={15} /><span>快速抵达</span><kbd>⌘ K</kbd>
          </button>
          <div className={styles.avatar} aria-label="当前学习者"><span>ZR</span><i /></div>
        </div>
      </motion.header>

      <div id="top" className={styles.content}>
        <AnimatePresence mode="wait">
          <motion.section key={mode} className={styles.stage}
            initial={reduceMotion ? false : { opacity: 0, filter: "blur(14px)", y: 18 }}
            animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, filter: "blur(10px)", y: -12 }}
            transition={{ duration: 0.46, ease: [0.22, 1, 0.36, 1] }}>
            {mode === "pulse" && <PulseView missions={missions} activeMission={activeMission}
              openCount={openMissions.length} clock={clock} reduceMotion={Boolean(reduceMotion)}
              onComplete={completeMission} onFocus={() => setFocusOpen(true)}
              onTilt={handleTilt} onTiltEnd={resetTilt} />}
            {mode === "map" && <MapView activeOrbit={activeOrbit} reduceMotion={Boolean(reduceMotion)}
              onOrbitChange={setActiveOrbit} onTilt={handleTilt} onTiltEnd={resetTilt} />}
            {mode === "echo" && <EchoView reduceMotion={Boolean(reduceMotion)}
              onTilt={handleTilt} onTiltEnd={resetTilt} />}
          </motion.section>
        </AnimatePresence>
      </div>

      <div className={styles.statusRail} aria-label="当前状态">
        <span><i className={styles.liveDot} />系统在线</span><span>连续学习 14 天</span>
        <span>本周动量 86%</span><span className={styles.railMarquee}>理解 → 提取 → 反馈 → 迁移 → 间隔复习</span>
      </div>

      <AnimatePresence>{paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)}
        onFocus={() => { setPaletteOpen(false); setFocusOpen(true); }}
        onView={(view) => { setPaletteOpen(false); switchView(view); }} />}</AnimatePresence>
      <AnimatePresence>{focusOpen && <FocusLayer mission={activeMission} seconds={focusSeconds}
        running={focusRunning} onToggle={() => setFocusRunning((running) => !running)}
        onReset={() => { setFocusRunning(false); setFocusSeconds(45 * 60); }}
        onClose={() => { setFocusRunning(false); setFocusOpen(false); }} />}</AnimatePresence>
      <AnimatePresence>{toast && <motion.div className={styles.toast} role="status"
        initial={{ opacity: 0, y: 24, scale: 0.92 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.96 }}><Sparkles size={16} />{toast}</motion.div>}</AnimatePresence>
    </main>
  );
}

type SharedViewProps = { reduceMotion: boolean; onTilt: TiltHandler; onTiltEnd: TiltHandler };

function PulseView({ missions, activeMission, openCount, clock, reduceMotion, onComplete, onFocus, onTilt, onTiltEnd }:
  SharedViewProps & { missions: Mission[]; activeMission: Mission; openCount: number; clock: string;
    onComplete: (id: string) => void; onFocus: () => void }) {
  return <>
    <section className={styles.heroCopy}>
      <motion.div className={styles.eyebrow} initial={reduceMotion ? false : { opacity: 0, x: -28 }}
        animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.08 }}>
        <span>01 AUG / FRIDAY</span><i /><span>{clock}</span>
      </motion.div>
      <motion.h1 initial={reduceMotion ? false : { opacity: 0, y: 36 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12, duration: 0.72, ease: [0.16, 1, 0.3, 1] }}>
        把今天的<span className={styles.wordShift}>势能</span><br />变成真正的理解。
      </motion.h1>
      <motion.p initial={reduceMotion ? false : { opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24 }}>
        系统已根据精力、遗忘曲线和昨日承诺，重新编排了今日轨迹。不追赶清单，只推进最有价值的一步。
      </motion.p>
      <motion.div className={styles.heroActions} initial={reduceMotion ? false : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.32 }}>
        <button type="button" className={styles.primaryAction} onClick={onFocus}>
          <span><Play size={17} fill="currentColor" />进入深潜</span><i><ArrowUpRight size={18} /></i>
        </button>
        <button type="button" className={styles.textAction}
          onClick={() => document.getElementById("mission-stream")?.scrollIntoView({ behavior: "smooth" })}>
          查看完整轨迹 <ArrowRight size={17} />
        </button>
      </motion.div>
    </section>

    <motion.section className={styles.coreVisual}
      initial={reduceMotion ? false : { opacity: 0, scale: 0.84, rotate: -4 }} animate={{ opacity: 1, scale: 1, rotate: 0 }}
      transition={{ delay: 0.18, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}>
      <div className={styles.orbitSystem} aria-label="今日完成度 68%">
        <span className={styles.orbitRingOne} /><span className={styles.orbitRingTwo} /><span className={styles.orbitRingThree} />
        <span className={styles.orbitSatellite}><Brain size={19} /></span>
        <span className={styles.orbitSatelliteTwo}><Zap size={17} /></span>
        <div className={styles.coreDisc}>
          <svg viewBox="0 0 180 180" aria-hidden="true"><circle cx="90" cy="90" r="78" className={styles.coreTrack} />
            <motion.circle cx="90" cy="90" r="78" className={styles.coreProgress}
              initial={reduceMotion ? false : { pathLength: 0 }} animate={{ pathLength: 0.68 }}
              transition={{ delay: 0.5, duration: 1.4, ease: [0.16, 1, 0.3, 1] }} /></svg>
          <div className={styles.coreNumber}><small>TODAY&apos;S MOMENTUM</small><strong>68<sup>%</sup></strong>
            <span><Flame size={13} />高效区间</span></div>
        </div>
        <span className={styles.coreCaptionTop}>FOCUS 03</span><span className={styles.coreCaptionBottom}>ENERGY 86</span>
      </div>
    </motion.section>

    <motion.aside className={styles.nextCard} onPointerMove={onTilt} onPointerLeave={onTiltEnd}
      initial={reduceMotion ? false : { opacity: 0, x: 36 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.28 }}>
      <div className={styles.cardGlow} /><div className={styles.cardTopline}><span><Target size={15} />下一条轨迹</span>
        <span className={styles.energyTag}>{energyLabel(activeMission.energy)}</span></div>
      <span className={styles.cardIndex}>{activeMission.index}</span><h2>{activeMission.title}</h2><p>{activeMission.subject}</p>
      <div className={styles.missionMeta}><span><Clock3 size={14} />{activeMission.duration} 分钟</span><span>{activeMission.progress}% 已建立</span></div>
      <div className={styles.progressLine}><motion.span initial={reduceMotion ? false : { scaleX: 0 }}
        animate={{ scaleX: activeMission.progress / 100 }} transition={{ delay: 0.58, duration: 0.8 }} /></div>
      <button type="button" onClick={onFocus}>从断点继续 <ChevronRight size={17} /></button>
    </motion.aside>

    <section id="mission-stream" className={styles.missionStream}>
      <div className={styles.sectionHeading}><div><span>TRAJECTORY / TODAY</span><h2>今日轨迹</h2></div><p>{openCount} 条待推进</p></div>
      <div className={styles.missionList}><AnimatePresence initial={false}>{missions.map((mission, index) => (
        <motion.article layout key={mission.id} className={`${styles.missionRow} ${mission.completed ? styles.missionDone : ""}`}
          initial={reduceMotion ? false : { opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: reduceMotion ? 0 : index * 0.06 }}>
          <button type="button" className={styles.checkButton} onClick={() => onComplete(mission.id)}
            aria-label={mission.completed ? `恢复 ${mission.title}` : `完成 ${mission.title}`}>
            <span>{mission.completed ? <Check size={16} /> : mission.index}</span>{!mission.completed && <i />}
          </button>
          <div className={styles.missionText}><span>{mission.subject}</span><h3>{mission.title}</h3></div>
          <div className={styles.rowProgress}><span><i style={{ width: `${mission.progress}%` }} /></span><strong>{mission.progress}%</strong></div>
          <span className={`${styles.energyDot} ${styles[mission.energy]}`}>{energyLabel(mission.energy)}</span>
          <span className={styles.duration}>{mission.duration}&apos;</span><ArrowUpRight className={styles.rowArrow} size={18} />
        </motion.article>
      ))}</AnimatePresence></div>
    </section>

    <aside className={styles.rhythmPanel} onPointerMove={onTilt} onPointerLeave={onTiltEnd}>
      <div className={styles.sectionHeadingCompact}><div><span>RHYTHM</span><h2>认知节律</h2></div><Gauge size={20} /></div>
      <div className={styles.rhythmChart} aria-label="今日认知节律图">{rhythm.map((value, index) => (
        <motion.i key={`${value}-${index}`} initial={reduceMotion ? false : { scaleY: 0 }} animate={{ scaleY: value / 100 }}
          transition={{ delay: 0.4 + index * 0.035, duration: 0.6 }} />))}<span className={styles.nowMarker}>NOW</span></div>
      <div className={styles.rhythmFooter}><span>08:00</span><span>当前处于深度窗口</span><span>22:00</span></div>
    </aside>
  </>;
}

function MapView({ activeOrbit, reduceMotion, onOrbitChange, onTilt, onTiltEnd }: SharedViewProps & {
  activeOrbit: string; onOrbitChange: (id: string) => void }) {
  const active = orbitNodes.find((node) => node.id === activeOrbit) ?? orbitNodes[0];
  return <div className={styles.mapLayout}>
    <section className={styles.mapIntro}><div className={styles.eyebrow}><span>KNOWLEDGE / LIVING MAP</span><i /><span>42 NODES</span></div>
      <h1>知识不是清单，<br /><span>它是一片会呼吸的场。</span></h1>
      <p>节点越亮，近期提取越稳定；轨道越近，迁移关系越强。点击任意节点查看下一次最有效行动。</p>
      <div className={styles.mapLegend}><span><i className={styles.legendHot} />急需巩固</span>
        <span><i className={styles.legendWarm} />正在建立</span><span><i className={styles.legendCool} />长期稳定</span></div>
    </section>
    <section className={styles.knowledgeMap} aria-label="交互式知识星图">
      <svg className={styles.connectionLayer} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {orbitNodes.map((node, index) => { const next = orbitNodes[(index + 1) % orbitNodes.length]; return (
          <motion.path key={node.id} d={`M ${node.x} ${node.y} Q 50 50 ${next.x} ${next.y}`}
            initial={reduceMotion ? false : { pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: node.id === activeOrbit ? 0.9 : 0.28 }}
            transition={{ delay: index * 0.12, duration: 1.1 }} />); })}
      </svg>
      <div className={styles.mapCore}><span>LEARNING</span><strong>86</strong><small>network health</small></div>
      {orbitNodes.map((node, index) => <motion.button type="button" key={node.id}
        className={`${styles.mapNode} ${styles[node.tone]} ${activeOrbit === node.id ? styles.mapNodeActive : ""}`}
        style={{ left: `${node.x}%`, top: `${node.y}%`, width: node.size, height: node.size }} onClick={() => onOrbitChange(node.id)}
        initial={reduceMotion ? false : { opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.18 + index * 0.09, type: "spring", stiffness: 240, damping: 18 }}
        whileHover={reduceMotion ? undefined : { scale: 1.12 }}><span>{node.label}</span><i /></motion.button>)}
    </section>
    <motion.aside className={styles.nodeInspector} onPointerMove={onTilt} onPointerLeave={onTiltEnd} layout>
      <span className={styles.inspectorNumber}>0{orbitNodes.findIndex((node) => node.id === active.id) + 1}</span>
      <div className={styles.cardTopline}><span><Orbit size={15} />当前节点</span><span className={styles.energyTag}>LIVE</span></div>
      <h2>{active.label}</h2><strong>{active.detail}</strong><p>过去 7 天发生 14 次有效连接，其中 3 条可以在今天通过变式练习进一步强化。</p>
      <div className={styles.inspectorStats}><span><small>连接</small><b>14</b></span><span><small>待提取</small><b>03</b></span><span><small>稳定度</small><b>72%</b></span></div>
      <button type="button">进入节点 <ArrowUpRight size={17} /></button>
    </motion.aside>
    <div className={styles.mapTicker}><span>TRANSFER SIGNAL</span><strong>动态规划</strong><ArrowRight size={16} /><strong>图论</strong><i /><span>NEXT REVIEW</span><strong>18:40</strong></div>
  </div>;
}

function EchoView({ reduceMotion, onTilt, onTiltEnd }: SharedViewProps) {
  return <div className={styles.echoLayout}>
    <section className={styles.echoHero}><div className={styles.eyebrow}><span>MEMORY / ECHO</span><i /><span>3 SIGNALS</span></div>
      <h1>让遗忘<br /><span>发出声音。</span></h1><p>系统不问“你看过没有”，只追踪“你是否还能独立取回”。今天有三个信号值得回应。</p>
      <div className={styles.echoPulse} aria-hidden="true">{[0, 1, 2, 3].map((index) => <motion.span key={index}
        animate={reduceMotion ? undefined : { scale: [0.8, 1.5], opacity: [0.65, 0] }}
        transition={{ delay: index * 0.55, duration: 2.2, repeat: Infinity, ease: "easeOut" }} />)}<Brain size={38} /></div>
    </section>
    <section className={styles.signalStack}>{reviewSignals.map((signal, index) => <motion.article key={signal.label}
      className={styles.signalCard} onPointerMove={onTilt} onPointerLeave={onTiltEnd}
      initial={reduceMotion ? false : { opacity: 0, x: 48, rotate: 2 }} animate={{ opacity: 1, x: 0, rotate: 0 }}
      transition={{ delay: index * 0.1, duration: 0.55 }}>
      <span className={styles.signalIndex}>0{index + 1}</span><div><small>{signal.subject}</small><h2>{signal.label}</h2></div>
      <div className={styles.signalStrength}><span style={{ "--strength": `${signal.strength}%` } as React.CSSProperties} /><small>记忆强度 {signal.strength}%</small></div>
      <span className={styles.signalDue}>{signal.urgency}</span><button type="button" aria-label={`开始复习 ${signal.label}`}><ArrowUpRight size={18} /></button>
    </motion.article>)}</section>
    <aside className={styles.echoManifesto} onPointerMove={onTilt} onPointerLeave={onTiltEnd}><BookOpen size={20} /><span>RECALL PRINCIPLE</span>
      <blockquote>“不是再次阅读，而是在没有提示时重建答案。”</blockquote><p>今日提取负荷适中，预计 34 分钟完成。</p></aside>
  </div>;
}

function CommandPalette({ onClose, onFocus, onView }: { onClose: () => void; onFocus: () => void; onView: (view: ViewMode) => void }) {
  return <motion.div className={styles.modalBackdrop} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
    <motion.div className={styles.palette} initial={{ opacity: 0, scale: 0.9, y: -24, filter: "blur(12px)" }}
      animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, scale: 0.94, y: -12 }}
      transition={{ type: "spring", stiffness: 360, damping: 28 }} onMouseDown={(event) => event.stopPropagation()}>
      <div className={styles.paletteSearch}><Search size={20} /><input autoFocus placeholder="输入一个意图，而不是寻找一个页面…" aria-label="命令搜索" /><kbd>ESC</kbd></div>
      <div className={styles.paletteBody}><span className={styles.paletteLabel}>建议动作</span>
        <button type="button" onClick={onFocus}><Focus size={18} /><span><strong>开始 45 分钟深潜</strong><small>从上次断点继续</small></span><kbd>F</kbd></button>
        <button type="button" onClick={() => onView("map")}><Orbit size={18} /><span><strong>打开知识星图</strong><small>查看概念之间的连接</small></span><ChevronRight size={17} /></button>
        <button type="button" onClick={() => onView("echo")}><Brain size={18} /><span><strong>回应复习回声</strong><small>3 个信号等待提取</small></span><ChevronRight size={17} /></button>
        <span className={styles.paletteLabel}>快速记录</span>
        <button type="button"><Sparkles size={18} /><span><strong>记录刚刚理解的内容</strong><small>自动连接到当前知识节点</small></span><Command size={16} /></button>
      </div><div className={styles.paletteFooter}><span><i />本地优先 · 即时同步</span><span>↑↓ 导航　↵ 选择</span></div>
    </motion.div>
  </motion.div>;
}

function FocusLayer({ mission, seconds, running, onToggle, onReset, onClose }: { mission: Mission; seconds: number; running: boolean;
  onToggle: () => void; onReset: () => void; onClose: () => void }) {
  const progress = 1 - seconds / (45 * 60);
  return <motion.div className={styles.focusLayer} initial={{ clipPath: "circle(0% at 50% 50%)" }}
    animate={{ clipPath: "circle(100% at 50% 50%)" }} exit={{ clipPath: "circle(0% at 50% 50%)" }}
    transition={{ duration: 0.72, ease: [0.76, 0, 0.24, 1] }}>
    <div className={styles.focusAtmosphere} aria-hidden="true"><i /><i /><i /></div>
    <header><span><i />DEEP DIVE / ACTIVE FIELD</span><button type="button" onClick={onClose}><X size={20} />退出</button></header>
    <div className={styles.focusContent}><span className={styles.focusSubject}>{mission.subject}</span><h2>{mission.title}</h2>
      <div className={styles.timerOrb}><svg viewBox="0 0 240 240" aria-hidden="true"><circle cx="120" cy="120" r="108" />
        <motion.circle cx="120" cy="120" r="108" initial={false} animate={{ pathLength: progress }} transition={{ duration: 0.5 }} /></svg>
        <strong>{formatTime(seconds)}</strong><small>{running ? "保持在问题里" : "准备好后开始"}</small></div>
      <div className={styles.timerActions}><button type="button" className={styles.timerSecondary} onClick={onReset}><RotateCcw size={18} /></button>
        <button type="button" className={styles.timerPrimary} onClick={onToggle}>{running ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}</button>
        <button type="button" className={styles.timerSecondary}><Sparkles size={18} /></button></div>
      <p className={styles.focusHint}>快捷键 F 进入 · ESC 随时退出 · 过程会自动保存</p>
    </div>
  </motion.div>;
}
