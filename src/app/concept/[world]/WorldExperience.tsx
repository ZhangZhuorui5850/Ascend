"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowLeft, ArrowUpRight, Binary, BookOpen, BrainCircuit, Braces,
  Brush, Check, CircleDot, Cpu, Droplets, Eye, EyeOff, FileSearch,
  Flame, FlaskConical, Gauge, Hammer, Layers3, Music2,
  Network, Orbit, Pause, Play, RotateCw, ScanLine, Search,
  Sigma, SlidersHorizontal, Snowflake, Sparkles, Star, Sun,
  Thermometer, Volume2, Waves, Workflow, X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ConceptWorld } from "../worlds";
import styles from "./world.module.css";

type WorldProps = { world: ConceptWorld };

export function WorldExperience({ world }: WorldProps) {
  switch (world.slug) {
    case "prism": return <PrismWorld world={world} />;
    case "monolith": return <MonolithWorld world={world} />;
    case "cosmos": return <CosmosWorld world={world} />;
    case "ukiyo": return <UkiyoWorld world={world} />;
    case "cryo": return <CryoWorld world={world} />;
    case "forge": return <ForgeWorld world={world} />;
    case "dreamwave": return <DreamwaveWorld world={world} />;
    case "cipher": return <CipherWorld world={world} />;
    case "synth": return <SynthWorld world={world} />;
    case "inkflow": return <InkflowWorld world={world} />;
    case "axiom": return <AxiomWorld world={world} />;
    case "reactor": return <ReactorWorld world={world} />;
    case "gradient": return <GradientWorld world={world} />;
    case "latent": return <LatentWorld world={world} />;
    case "kernel": return <KernelWorld world={world} />;
    default: return null;
  }
}

function WorldHeader({ world, action }: WorldProps & { action?: React.ReactNode }) {
  return (
    <header className={styles.worldHeader}>
      <Link href="/concept"><ArrowLeft size={16} /><span>ALL WORLDS</span></Link>
      <div className={styles.worldBrand}><i /><strong>{world.name.toUpperCase()}</strong><small>ASCEND EXPERIMENT / {world.number}</small></div>
      <div className={styles.headerAction}>{action}</div>
    </header>
  );
}

function SessionOverlay({ world, title, onClose }: WorldProps & { title: string; onClose: () => void }) {
  const reduceMotion = useReducedMotion();
  const [running, setRunning] = useState(false);
  return (
    <motion.div className={styles.sessionOverlay} initial={reduceMotion ? false : { opacity: 0, clipPath: "circle(0% at 50% 50%)" }}
      animate={{ opacity: 1, clipPath: "circle(100% at 50% 50%)" }} exit={{ opacity: 0, clipPath: "circle(0% at 50% 50%)" }}>
      <div className={styles.overlayAtmosphere} aria-hidden="true"><i /><i /><i /></div>
      <button type="button" className={styles.overlayClose} onClick={onClose}><X size={19} />EXIT</button>
      <small>ACTIVE SESSION / {world.number}</small><h2>{title}</h2><strong>45:00</strong><p>{world.statement}</p>
      <button type="button" className={styles.overlayPlay} onClick={() => setRunning((value) => !value)}>
        {running ? <Pause size={23} fill="currentColor" /> : <Play size={23} fill="currentColor" />}
      </button>
      <span className={styles.overlayStatus}>{running ? "SESSION IN MOTION" : "READY WHEN YOU ARE"}</span>
    </motion.div>
  );
}

function PrismWorld({ world }: WorldProps) {
  const reduceMotion = useReducedMotion();
  const rootRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  const [session, setSession] = useState(false);
  const move = (event: React.PointerEvent<HTMLElement>) => {
    if (reduceMotion || !rootRef.current) return;
    rootRef.current.style.setProperty("--rx", `${(event.clientY / window.innerHeight - .5) * -12}deg`);
    rootRef.current.style.setProperty("--ry", `${(event.clientX / window.innerWidth - .5) * 16}deg`);
    rootRef.current.style.setProperty("--mx", `${event.clientX}px`);
    rootRef.current.style.setProperty("--my", `${event.clientY}px`);
  };
  return (
    <main ref={rootRef} className={`${styles.world} ${styles.prism}`} onPointerMove={move}>
      <div className={styles.prismGlow} aria-hidden="true" />
      <WorldHeader world={world} action={<button type="button"><Sparkles size={16} />REFRACT</button>} />
      <section className={styles.prismHero}>
        <motion.div className={styles.prismCopy} initial={reduceMotion ? false : { opacity: 0, x: -45 }} animate={{ opacity: 1, x: 0 }}>
          <span className={styles.kicker}>SPECTRUM / 07:42</span><h1>让复杂问题，<br />折射成<span>可以看见的光谱。</span></h1><p>{world.description}</p>
          <button type="button" className={styles.prismStart} onClick={() => setSession(true)}>ENTER THE LIGHT <ArrowUpRight size={18} /></button>
        </motion.div>
        <div className={styles.prismObject} aria-label="交互式棱镜">
          <div className={styles.crystal}><i /><i /><i /><span>68<small>%</small></span></div>
          <span className={styles.rayIn} /><span className={styles.rayRed} /><span className={styles.rayBlue} /><span className={styles.rayGreen} />
          <small>MOVE TO CHANGE REFRACTION</small>
        </div>
        <aside className={styles.spectrumPanel}><small>ACTIVE FREQUENCY</small><strong>432<sup>nm</sup></strong><span>理解正在聚焦</span>
          <div>{[38,62,45,84,70,93,58].map((value,index) => <i key={index} style={{ height: `${value}%` }} />)}</div>
        </aside>
      </section>
      <section className={styles.prismTasks}><header><span>THREE BEAMS</span><strong>选择一束光进入</strong></header>
        <div>{world.tasks.map((task,index) => <button type="button" key={task.label} className={active === index ? styles.active : ""} onClick={() => setActive(index)}>
          <span>0{index + 1}</span><div><small>{task.meta}</small><strong>{task.label}</strong></div><i /><ArrowUpRight size={17} /></button>)}</div>
      </section>
      <AnimatePresence>{session && <SessionOverlay world={world} title={world.tasks[active].label} onClose={() => setSession(false)} />}</AnimatePresence>
    </main>
  );
}

function MonolithWorld({ world }: WorldProps) {
  const reduceMotion = useReducedMotion();
  const [inverse, setInverse] = useState(false);
  const [done, setDone] = useState<number[]>([]);
  const [session, setSession] = useState(false);
  return (
    <main className={`${styles.world} ${styles.monolith} ${inverse ? styles.inverted : ""}`}>
      <WorldHeader world={world} action={<button type="button" onClick={() => setInverse((value) => !value)}><RotateCw size={16} />INVERT</button>} />
      <div className={styles.broadcast}><span>DO THE WORK</span><span>NO ZERO DAYS</span><span>FRIDAY / 01 AUG</span><span>DO THE WORK</span></div>
      <section className={styles.monoHero}>
        <motion.div initial={reduceMotion ? false : { x: -90, opacity: 0 }} animate={{ x: 0, opacity: 1 }}><span>ORDER № 214</span><h1>不要优化<br />计划。<em>执行它。</em></h1></motion.div>
        <div className={styles.monoCounter}><small>OPEN BLOCKS</small><strong>{String(3 - done.length).padStart(2,"0")}</strong><i /></div>
        <button type="button" className={styles.monoStart} onClick={() => setSession(true)}><Play size={24} fill="currentColor" /><span>START<br />BLOCK 01</span><ArrowUpRight size={24} /></button>
      </section>
      <section className={styles.monoGrid}>
        {world.tasks.map((task,index) => <motion.article layout key={task.label} className={done.includes(index) ? styles.monoDone : ""}>
          <span className={styles.monoNum}>0{index + 1}</span><small>{task.meta}</small><h2>{task.label}</h2>
          <button type="button" onClick={() => setDone((items) => items.includes(index) ? items.filter((item) => item !== index) : [...items,index])}>
            {done.includes(index) ? <Check size={21} /> : <ArrowUpRight size={21} />}
          </button>
        </motion.article>)}
      </section>
      <footer className={styles.monoFooter}>OUTPUT &gt; INTENTION　/　EVIDENCE &gt; FEELING　/　START BEFORE READY</footer>
      <AnimatePresence>{session && <SessionOverlay world={world} title={world.tasks[0].label} onClose={() => setSession(false)} />}</AnimatePresence>
    </main>
  );
}

function CosmosWorld({ world }: WorldProps) {
  const reduceMotion = useReducedMotion();
  const [planet, setPlanet] = useState(0);
  const [session, setSession] = useState(false);
  return (
    <main className={`${styles.world} ${styles.cosmos}`}>
      <div className={styles.starField} aria-hidden="true">{Array.from({length:34},(_,i) => <i key={i} style={{ "--i": i, "--x": `${(i*37)%97}%`, "--y": `${(i*61)%91}%` } as React.CSSProperties} />)}</div>
      <WorldHeader world={world} action={<button type="button"><Orbit size={16} />AUTO PILOT</button>} />
      <section className={styles.cosmosHero}>
        <motion.div className={styles.cosmosCopy} initial={reduceMotion ? false : { opacity: 0, y: 45 }} animate={{ opacity: 1, y: 0 }}>
          <span>MISSION DAY 14 · COURSE STABLE</span><h1>今天的每一步，<br />都在改变你的<span>轨道。</span></h1><p>{world.description}</p>
          <button type="button" onClick={() => setSession(true)}><Play size={17} fill="currentColor" />BEGIN MISSION</button>
        </motion.div>
        <div className={styles.solarSystem}>
          <div className={styles.sunCore}><strong>86</strong><small>COURSE</small></div>
          {[0,1,2].map((index) => <button type="button" key={index} className={`${styles.planet} ${planet === index ? styles.planetActive : ""}`}
            onClick={() => setPlanet(index)}><span>{index + 1}</span><small>{world.tasks[index].label}</small></button>)}
          <i className={styles.orbitOne} /><i className={styles.orbitTwo} /><i className={styles.orbitThree} />
        </div>
        <aside className={styles.missionCard}><small>SELECTED ORBIT / 0{planet + 1}</small><h2>{world.tasks[planet].label}</h2><span>{world.tasks[planet].meta}</span>
          <div><i style={{ width: `${68 - planet * 14}%` }} /></div><button type="button" onClick={() => setSession(true)}>ENTER ORBIT <ArrowUpRight size={17} /></button>
        </aside>
      </section>
      <div className={styles.cosmosTelemetry}><span>VELOCITY 07.8</span><span>GRAVITY 0.86</span><span>MEMORY FUEL 68%</span><span>NEXT SIGNAL 18:40</span></div>
      <AnimatePresence>{session && <SessionOverlay world={world} title={world.tasks[planet].label} onClose={() => setSession(false)} />}</AnimatePresence>
    </main>
  );
}

function UkiyoWorld({ world }: WorldProps) {
  const reduceMotion = useReducedMotion();
  const [tide, setTide] = useState(46);
  const [active, setActive] = useState(0);
  const [session, setSession] = useState(false);
  return (
    <main className={`${styles.world} ${styles.ukiyo}`} style={{ "--tide": `${tide}%` } as React.CSSProperties}>
      <WorldHeader world={world} action={<button type="button" onClick={() => setTide((value) => value >= 80 ? 28 : value + 13)}><Waves size={16} />潮を進む</button>} />
      <div className={styles.ukiyoSun} aria-hidden="true"><i /><span /></div>
      <div className={styles.waveLayers} aria-hidden="true"><i /><i /><i /></div>
      <section className={styles.ukiyoHero}>
        <motion.div initial={reduceMotion ? false : { opacity: 0, x: -50 }} animate={{ opacity: 1, x: 0 }}><span>令和八年 · 葉月一日</span><h1>順着浪势前进，<br /><em>不与每一次波动对抗。</em></h1><p>{world.description}</p></motion.div>
        <div className={styles.tideMeter}><small>今日潮位</small><strong>{tide}</strong><span>%</span><i /></div>
      </section>
      <section className={styles.fanTasks}>
        {world.tasks.map((task,index) => <motion.button type="button" key={task.label} className={active === index ? styles.fanActive : ""} onClick={() => setActive(index)}
          initial={reduceMotion ? false : { opacity: 0, rotate: -15 }} animate={{ opacity: 1, rotate: (index - 1) * 3 }}>
          <span>〇{index + 1}</span><small>{task.meta}</small><strong>{task.label}</strong><i />
        </motion.button>)}
      </section>
      <button type="button" className={styles.ukiyoStart} onClick={() => setSession(true)}>この波に入る <ArrowUpRight size={18} /></button>
      <AnimatePresence>{session && <SessionOverlay world={world} title={world.tasks[active].label} onClose={() => setSession(false)} />}</AnimatePresence>
    </main>
  );
}

function CryoWorld({ world }: WorldProps) {
  const [temperature, setTemperature] = useState(-18);
  const [active, setActive] = useState(0);
  const [session, setSession] = useState(false);
  const clarity = Math.round(((temperature + 24) / 24) * 100);
  return (
    <main className={`${styles.world} ${styles.cryo}`} style={{ "--clarity": `${clarity}%` } as React.CSSProperties}>
      <div className={styles.frost} aria-hidden="true" />
      <WorldHeader world={world} action={<button type="button"><Snowflake size={16} />CHAMBER 09</button>} />
      <section className={styles.cryoHero}>
        <div className={styles.cryoCopy}><span><Thermometer size={14} />CORE TEMP {temperature}°C</span><h1>慢慢解冻一个<br /><em>冻结太久的问题。</em></h1><p>{world.description}</p></div>
        <div className={styles.iceCore}><div><Snowflake size={36} /><strong>{clarity}</strong><small>CLARITY</small></div><i /><i /></div>
        <aside className={styles.thawControl}><small>THERMAL CONTROL</small><strong>{temperature}°</strong><input aria-label="解冻温度" type="range" min="-24" max="0" value={temperature} onChange={(event) => setTemperature(Number(event.target.value))} />
          <span>拖动以恢复清晰度</span><button type="button" onClick={() => setSession(true)}>BEGIN THAW <ArrowUpRight size={17} /></button></aside>
      </section>
      <section className={styles.crystals}>{world.tasks.map((task,index) => <button type="button" key={task.label} className={active === index ? styles.crystalActive : ""} onClick={() => setActive(index)}>
        <Snowflake size={18} /><span>ICE 0{index + 1}</span><strong>{task.label}</strong><small>{task.meta}</small><i /></button>)}</section>
      <AnimatePresence>{session && <SessionOverlay world={world} title={world.tasks[active].label} onClose={() => setSession(false)} />}</AnimatePresence>
    </main>
  );
}

function ForgeWorld({ world }: WorldProps) {
  const [heat, setHeat] = useState(620);
  const [done, setDone] = useState<number[]>([]);
  const [session, setSession] = useState(false);
  const strike = () => setHeat((value) => value >= 980 ? 620 : value + 90);
  return (
    <main className={`${styles.world} ${styles.forge}`} style={{ "--heat": `${Math.min(100,(heat-400)/6)}%` } as React.CSSProperties}>
      <div className={styles.embers} aria-hidden="true">{Array.from({length:18},(_,i) => <i key={i} style={{ "--i": i, "--x": `${(i*43)%95}%` } as React.CSSProperties} />)}</div>
      <WorldHeader world={world} action={<button type="button" onClick={strike}><Hammer size={16} />STRIKE</button>} />
      <section className={styles.forgeHero}>
        <div><span>FURNACE ONLINE / {heat}°C</span><h1>知识不是被收藏的，<br /><em>它是被锻造出来的。</em></h1><p>{world.description}</p>
          <button type="button" onClick={() => setSession(true)}><Flame size={17} />IGNITE SESSION</button></div>
        <button type="button" className={styles.anvil} onClick={strike}><span className={styles.metal}><i />UNDERSTANDING<strong>{heat}</strong></span><Hammer size={54} /><small>点击锤炼 · CLICK TO STRIKE</small></button>
        <aside className={styles.heatGauge}><small>FURNACE HEAT</small><strong>{heat}</strong><span>°C</span><div><i /></div><p>{heat > 900 ? "锻造窗口已打开" : "继续升温以进入锻造区"}</p></aside>
      </section>
      <section className={styles.forgeTasks}>{world.tasks.map((task,index) => <motion.article layout key={task.label} className={done.includes(index) ? styles.forged : ""}>
        <span>0{index + 1}</span><div><small>{task.meta}</small><h2>{task.label}</h2></div><button type="button" onClick={() => setDone((items) => items.includes(index) ? items.filter((item) => item !== index) : [...items,index])}>
          {done.includes(index) ? <Check /> : <Hammer />}</button></motion.article>)}</section>
      <AnimatePresence>{session && <SessionOverlay world={world} title={world.tasks[0].label} onClose={() => setSession(false)} />}</AnimatePresence>
    </main>
  );
}

function DreamwaveWorld({ world }: WorldProps) {
  const reduceMotion = useReducedMotion();
  const [mood, setMood] = useState<"cloud" | "sunset">("cloud");
  const [session, setSession] = useState(false);
  return (
    <main className={`${styles.world} ${styles.dreamwave} ${mood === "sunset" ? styles.sunset : ""}`}>
      <div className={styles.dreamSky} aria-hidden="true"><i /><i /><i /><span>✦</span><span>☁</span></div>
      <WorldHeader world={world} action={<button type="button" onClick={() => setMood((value) => value === "cloud" ? "sunset" : "cloud")}><Sun size={16} />CHANGE DREAM</button>} />
      <section className={styles.dreamHero}><span>CHANNEL 11 · YOU ARE HERE</span><h1>如果学习是一场梦，<br /><em>你可以决定它的方向。</em></h1><p>{world.description}</p></section>
      <div className={styles.windowDesk}>
        {world.tasks.map((task,index) => <motion.article drag={!reduceMotion} dragConstraints={{left:-80,right:80,top:-60,bottom:80}} dragElastic={.16} key={task.label}
          className={`${styles.dreamWindow} ${styles[`window${index + 1}`]}`} whileDrag={{ scale: 1.05, rotate: index % 2 ? -2 : 2, zIndex: 9 }}>
          <header><i /><i /><i /><span>dream_0{index + 1}.asc</span></header><div><small>{task.meta}</small><h2>{task.label}</h2><p>拖动窗口，重新安排今天的注意力。</p>
            <button type="button" onClick={() => setSession(true)}>OPEN <ArrowUpRight size={16} /></button></div>
        </motion.article>)}
        <motion.div drag={!reduceMotion} className={styles.dreamSticker} whileDrag={{ rotate: 8, scale: 1.08 }}><Star fill="currentColor" /><span>YOU DON&apos;T HAVE<br />TO RUSH.</span></motion.div>
      </div>
      <AnimatePresence>{session && <SessionOverlay world={world} title={world.tasks[0].label} onClose={() => setSession(false)} />}</AnimatePresence>
    </main>
  );
}

function CipherWorld({ world }: WorldProps) {
  const [revealed, setRevealed] = useState<number[]>([]);
  const [active, setActive] = useState(0);
  const [session, setSession] = useState(false);
  return (
    <main className={`${styles.world} ${styles.cipher}`}>
      <WorldHeader world={world} action={<button type="button"><Search size={16} />SEARCH FILES</button>} />
      <div className={styles.classified}>CLASSIFIED　/　CASE 214　/　AUTHORIZED EYES ONLY　/　CLASSIFIED　/　CASE 214</div>
      <section className={styles.cipherHero}>
        <div><span>COGNITIVE INVESTIGATION BUREAU</span><h1>每个错误，<br />都留下了<span>证据。</span></h1><p>{world.description}</p><button type="button" onClick={() => setSession(true)}><FileSearch size={17} />OPEN INVESTIGATION</button></div>
        <div className={styles.casePhoto}><span>CASE<br /><strong>214</strong></span><i /><i /><small>SUBJECT: DYNAMIC PROGRAMMING</small></div>
        <aside className={styles.caseSummary}><small>CASE STATUS</small><strong>{revealed.length}/3</strong><span>EVIDENCE REVEALED</span><div><i style={{ width: `${revealed.length / 3 * 100}%` }} /></div><p>真正的原因藏在被跳过的推理步骤里。</p></aside>
      </section>
      <section className={styles.evidenceBoard}><svg viewBox="0 0 100 35" preserveAspectRatio="none" aria-hidden="true"><path d="M 17 18 C 30 2, 36 30, 50 17 S 72 5, 84 18" /></svg>
        {world.tasks.map((task,index) => <motion.article layout key={task.label} className={active === index ? styles.evidenceActive : ""} onClick={() => setActive(index)}>
          <span>EVIDENCE {String.fromCharCode(65 + index)}</span><h2 className={revealed.includes(index) ? "" : styles.redacted}>{task.label}</h2><small>{task.meta}</small>
          <button type="button" onClick={(event) => { event.stopPropagation(); setRevealed((items) => items.includes(index) ? items.filter((item) => item !== index) : [...items,index]); }}>
            {revealed.includes(index) ? <EyeOff size={17} /> : <Eye size={17} />}{revealed.includes(index) ? "REDACT" : "REVEAL"}
          </button><i className={styles.pin} />
        </motion.article>)}
      </section>
      <AnimatePresence>{session && <SessionOverlay world={world} title={world.tasks[active].label} onClose={() => setSession(false)} />}</AnimatePresence>
    </main>
  );
}

function SynthWorld({ world }: WorldProps) {
  const [steps, setSteps] = useState(() => [true,false,true,true,false,true,false,true,false,true,true,false,true,false,true,false]);
  const [playing, setPlaying] = useState(false);
  const [session, setSession] = useState(false);
  return (
    <main className={`${styles.world} ${styles.synth}`}>
      <WorldHeader world={world} action={<button type="button"><SlidersHorizontal size={16} />MIXER</button>} />
      <section className={styles.synthHero}>
        <div><span>ASC-13 / PATTERN 214</span><h1>不要等状态出现，<br /><em>先编出自己的节奏。</em></h1><p>{world.description}</p></div>
        <div className={styles.turntable}><i /><i /><div><Music2 size={28} /><strong>96</strong><small>BPM</small></div></div>
        <button type="button" className={styles.masterPlay} onClick={() => setPlaying((value) => !value)}>{playing ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}<span>{playing ? "PAUSE" : "PLAY"}<small>MASTER SEQUENCE</small></span></button>
      </section>
      <section className={`${styles.sequencer} ${playing ? styles.sequencePlaying : ""}`}>
        <header><span>STEP SEQUENCER / TODAY</span><div><CircleDot size={14} />LIVE</div></header>
        <div className={styles.stepNumbers}>{steps.map((_,index) => <span key={index}>{String(index + 1).padStart(2,"0")}</span>)}</div>
        {world.tasks.map((task,row) => <div className={styles.track} key={task.label}>
          <button type="button" className={styles.trackLabel} onClick={() => setSession(true)}><span>0{row + 1}</span><div><strong>{task.label}</strong><small>{task.meta}</small></div><Volume2 size={15} /></button>
          <div className={styles.steps}>{steps.map((on,index) => <button type="button" key={index} className={on && index % 3 === row ? styles.stepOn : ""}
            aria-label={`${task.label} 第 ${index + 1} 拍`} onClick={() => setSteps((current) => current.map((value,i) => i === index ? !value : value))}><i /></button>)}</div>
        </div>)}
      </section>
      <div className={styles.synthFooter}><span>SWING 58%</span><span>FOCUS 45:00</span><span>OUTPUT +3.2 dB</span><span>MEMORY SEND 68%</span></div>
      <AnimatePresence>{session && <SessionOverlay world={world} title={world.tasks[0].label} onClose={() => setSession(false)} />}</AnimatePresence>
    </main>
  );
}

function InkCanvas({ still }: { still: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let width = window.innerWidth;
    let height = window.innerHeight;
    let drawing = false;
    let last = { x: 0, y: 0 };
    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio, 2);
      width = window.innerWidth; height = window.innerHeight;
      canvas.width = width * ratio; canvas.height = height * ratio;
      canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
      context.setTransform(ratio,0,0,ratio,0,0);
    };
    const start = (event: PointerEvent) => { drawing = true; last = { x: event.clientX, y: event.clientY }; };
    const move = (event: PointerEvent) => {
      if (still || !drawing) return;
      const speed = Math.min(Math.hypot(event.clientX-last.x,event.clientY-last.y),28);
      context.beginPath(); context.moveTo(last.x,last.y); context.lineTo(event.clientX,event.clientY);
      context.lineWidth = Math.max(2,18-speed*.48); context.lineCap = "round"; context.strokeStyle = "rgba(24,24,22,.18)"; context.stroke();
      last = { x: event.clientX, y: event.clientY };
    };
    const stop = () => { drawing = false; };
    resize(); window.addEventListener("resize",resize); canvas.addEventListener("pointerdown",start); canvas.addEventListener("pointermove",move); window.addEventListener("pointerup",stop);
    return () => { window.removeEventListener("resize",resize); canvas.removeEventListener("pointerdown",start); canvas.removeEventListener("pointermove",move); window.removeEventListener("pointerup",stop); };
  },[still]);
  return <canvas ref={ref} className={styles.inkCanvas} aria-label="可书写的水墨画布" />;
}

function InkflowWorld({ world }: WorldProps) {
  const reduceMotion = useReducedMotion();
  const [active, setActive] = useState(0);
  const [session, setSession] = useState(false);
  const [inked, setInked] = useState<number[]>([]);
  return (
    <main className={`${styles.world} ${styles.inkflow}`}>
      <InkCanvas still={Boolean(reduceMotion)} />
      <WorldHeader world={world} action={<button type="button"><Brush size={16} />按住画布落墨</button>} />
      <div className={styles.inkWash} aria-hidden="true"><i /><i /><i /></div>
      <section className={styles.inkHero}>
        <motion.div initial={reduceMotion ? false : { opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}><span>登峰 · 墨流十四</span><h1>留白不是空，<br /><em>它让真正重要的东西出现。</em></h1><p>{world.description}</p>
          <button type="button" onClick={() => setSession(true)}>落下第一笔 <ArrowUpRight size={18} /></button></motion.div>
        <div className={styles.enso}><i /><strong>68</strong><small>今日墨量</small></div>
        <blockquote>“缓慢地理解，<br />也是一种前进。”<small>— 今日批注</small></blockquote>
      </section>
      <section className={styles.inkTasks}><header><span>今日三笔</span><i /></header>{world.tasks.map((task,index) => <motion.article layout key={task.label}
        className={`${active === index ? styles.inkActive : ""} ${inked.includes(index) ? styles.inkDone : ""}`}>
        <button type="button" className={styles.inkSelect} onClick={() => setActive(index)} aria-label={`选择 ${task.label}`} />
        <span>{["一","二","三"][index]}</span><div><small>{task.meta}</small><strong>{task.label}</strong></div><i />
        <button type="button" className={styles.inkComplete} onClick={() => setInked((items) => items.includes(index) ? items.filter((item) => item !== index) : [...items,index])}
          aria-label={inked.includes(index) ? `恢复 ${task.label}` : `完成 ${task.label}`}>
          {inked.includes(index) ? <Check size={17} /> : <Droplets size={17} />}
        </button>
      </motion.article>)}</section>
      <AnimatePresence>{session && <SessionOverlay world={world} title={world.tasks[active].label} onClose={() => setSession(false)} />}</AnimatePresence>
    </main>
  );
}

function AxiomWorld({ world }: WorldProps) {
  const reduceMotion = useReducedMotion();
  const [rigorous, setRigorous] = useState(false);
  const [revealed, setRevealed] = useState<number[]>([0]);
  const [active, setActive] = useState(0);
  const [session, setSession] = useState(false);
  const toggleProof = (index: number) => setRevealed((items) =>
    items.includes(index) ? items.filter((item) => item !== index) : [...items, index]
  );
  return (
    <main className={`${styles.world} ${styles.axiom} ${rigorous ? styles.axiomRigorous : ""}`}>
      <div className={styles.axiomNotation} aria-hidden="true">{["∀ ε > 0", "∃ δ > 0", "∇f(x*) = 0", "P(A|B)", "λ ∈ σ(T)"].map((item,index) => <span key={item} style={{ "--i": index } as React.CSSProperties}>{item}</span>)}</div>
      <WorldHeader world={world} action={<button type="button" onClick={() => setRigorous((value) => !value)}><Sigma size={17} />{rigorous ? "INTUITION" : "RIGOUR"}</button>} />
      <section className={styles.axiomHero}>
        <motion.div initial={reduceMotion ? false : { opacity: 0, y: 35 }} animate={{ opacity: 1, y: 0 }}>
          <span>DOCTORAL NOTEBOOK / PROOF № 15</span>
          <h1>把直觉写成<br /><em>可以被检验的证明。</em></h1>
          <p>{world.description}</p>
          <button type="button" onClick={() => setSession(true)}><BookOpen size={17} />OPEN PROOF SESSION <ArrowUpRight size={17} /></button>
        </motion.div>
        <div className={styles.axiomCurve} aria-label="收敛函数示意图">
          <svg viewBox="0 0 520 390" role="img" aria-label="逐渐收敛到不动点的函数曲线">
            <defs><linearGradient id="axiom-line" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#3157d8" /><stop offset="1" stopColor="#ff5a72" /></linearGradient></defs>
            {Array.from({length:7},(_,index) => <line key={`x-${index}`} x1="45" y1={55 + index * 45} x2="480" y2={55 + index * 45} />)}
            {Array.from({length:9},(_,index) => <line key={`y-${index}`} x1={45 + index * 54} y1="35" x2={45 + index * 54} y2="345" />)}
            <path d="M45 315 C115 80 165 332 245 175 S385 88 478 52" />
            <path className={styles.axiomDiagonal} d="M45 330 L478 35" />
            <motion.circle r="9" fill="#ff5a72" initial={reduceMotion ? false : { cx: 65, cy: 280 }} animate={{ cx: rigorous ? 401 : 285, cy: rigorous ? 86 : 146 }} />
          </svg>
          <div><small>CONTRACTION MAP</small><strong>x<sub>n+1</sub> = T(x<sub>n</sub>)</strong><span>{rigorous ? "假设已显式化 · 边界已检查" : "直觉草图 · 等待形式化"}</span></div>
        </div>
        <aside className={styles.theoremCard}>
          <span>THEOREM OF THE DAY</span><strong>15.4</strong><h2>Banach<br />不动点定理</h2><p>完备度量空间中的压缩映射存在唯一不动点。</p><div><i style={{ width: `${revealed.length / 3 * 100}%` }} /></div><small>{revealed.length}/3 LEMMAS VERIFIED</small>
        </aside>
      </section>
      <section className={styles.proofDesk}>
        <header><div><span>PROOF DEPENDENCY GRAPH</span><strong>从假设到结论，不跳过任何一座桥</strong></div><p>{rigorous ? "RIGOROUS MODE / ON" : "EXPLORATION MODE / ON"}</p></header>
        <div className={styles.proofLayout}>
          <nav>{world.tasks.map((task,index) => <button type="button" key={task.label} className={active === index ? styles.proofNavActive : ""} onClick={() => setActive(index)}><span>0{index + 1}</span><div><strong>{task.label}</strong><small>{task.meta}</small></div><ArrowUpRight size={16} /></button>)}</nav>
          <div className={styles.proofGraph}>
            <svg viewBox="0 0 100 62" preserveAspectRatio="none" aria-hidden="true"><path d="M18 31 C32 31 31 13 47 13 S64 31 79 31" /><path d="M18 31 C32 31 31 49 47 49 S64 31 79 31" /></svg>
            {["假设 H", "引理 L₁", "引理 L₂", "结论 Q"].map((label,index) => {
              const proofIndex = index === 3 ? 2 : Math.max(0,index - 1);
              const visible = index === 0 || revealed.includes(proofIndex);
              const conclusionReady = revealed.includes(0) && revealed.includes(1);
              const reveal = () => {
                if (index > 0 && (index < 3 || conclusionReady)) toggleProof(proofIndex);
              };
              return <motion.button type="button" layout key={label} className={`${styles.proofNode} ${visible ? styles.proofNodeReady : ""}`} onClick={reveal}><small>{index === 0 ? "GIVEN" : index === 3 ? "THEREFORE" : `STEP 0${index}`}</small><strong>{label}</strong><span>{visible ? ["d(Tx,Ty) ≤ qd(x,y)", "序列为 Cauchy", "极限保持不变", "∃! x*: Tx*=x*"][index] : index === 3 && !conclusionReady ? "先完成两条引理" : "点击展开论证"}</span>{visible && index > 0 ? <Check size={16} /> : <CircleDot size={16} />}</motion.button>;
            })}
          </div>
        </div>
      </section>
      <AnimatePresence>{session && <SessionOverlay world={world} title={world.tasks[active].label} onClose={() => setSession(false)} />}</AnimatePresence>
    </main>
  );
}

function ReactorWorld({ world }: WorldProps) {
  const [strategy, setStrategy] = useState<"BFS" | "DFS" | "A*">("BFS");
  const [step, setStep] = useState(0);
  const [active, setActive] = useState(0);
  const [session, setSession] = useState(false);
  const nodes = [
    { id: "A", x: 12, y: 48 }, { id: "B", x: 28, y: 20 }, { id: "C", x: 31, y: 72 },
    { id: "D", x: 51, y: 39 }, { id: "E", x: 55, y: 78 }, { id: "F", x: 72, y: 18 },
    { id: "G", x: 78, y: 58 }, { id: "H", x: 91, y: 36 },
  ];
  const orders = { BFS: [0,1,2,3,4,5,6,7], DFS: [0,1,3,5,7,6,4,2], "A*": [0,2,4,6,7,5,3,1] };
  const order = orders[strategy];
  const visited = order.slice(0,step + 1);
  const edges = [[0,1],[0,2],[1,3],[2,3],[2,4],[3,5],[3,6],[4,6],[5,7],[6,7]];
  const selectStrategy = (value: "BFS" | "DFS" | "A*") => { setStrategy(value); setStep(0); };
  return (
    <main className={`${styles.world} ${styles.reactor}`} style={{ "--reactor-step": step } as React.CSSProperties}>
      <div className={styles.reactorGrid} aria-hidden="true" />
      <WorldHeader world={world} action={<button type="button" onClick={() => setStep((value) => value >= nodes.length - 1 ? 0 : value + 1)}><ScanLine size={17} />STEP TRACE</button>} />
      <section className={styles.reactorHero}>
        <div className={styles.reactorCopy}><span>ALGORITHM CHAMBER / GRAPH G(V,E)</span><h1>让每一步搜索，<br /><em>都留下可解释的轨迹。</em></h1><p>{world.description}</p><button type="button" onClick={() => setSession(true)}><Play size={17} fill="currentColor" />ENTER REACTOR</button></div>
        <div className={styles.graphStage}>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{edges.map(([from,to],index) => <motion.line key={index} x1={nodes[from].x} y1={nodes[from].y} x2={nodes[to].x} y2={nodes[to].y} className={visited.includes(from) && visited.includes(to) ? styles.edgeVisited : ""} />)}</svg>
          {nodes.map((node,index) => <motion.button type="button" key={node.id} className={`${styles.graphNode} ${visited.includes(index) ? styles.graphVisited : ""} ${order[step] === index ? styles.graphCurrent : ""}`} style={{ left: `${node.x}%`, top: `${node.y}%` }} onClick={() => setStep(Math.max(0,order.indexOf(index)))} animate={order[step] === index ? { scale: [1,1.16,1] } : { scale: 1 }}><span>{node.id}</span><small>{visited.includes(index) ? String(visited.indexOf(index) + 1).padStart(2,"0") : "—"}</small></motion.button>)}
          <div className={styles.graphCore}><Network size={24} /><strong>{strategy}</strong><span>FRONTIER {Math.min(step + 2,8)}</span></div>
        </div>
        <aside className={styles.reactorPanel}><header><Gauge size={18} /><span>EXECUTION MONITOR</span></header><strong>{String(step + 1).padStart(2,"0")}<small>/08</small></strong><p>CURRENT NODE <b>{nodes[order[step]].id}</b></p><div><i style={{ width: `${(step + 1) / 8 * 100}%` }} /></div><dl><div><dt>TIME</dt><dd>{strategy === "BFS" ? "O(V+E)" : strategy === "DFS" ? "O(V+E)" : "O(E log V)"}</dd></div><div><dt>MEMORY</dt><dd>{strategy === "DFS" ? "O(H)" : "O(V)"}</dd></div></dl><button type="button" onClick={() => setStep((value) => value >= 7 ? 0 : value + 1)}>NEXT TRANSITION <ArrowUpRight size={16} /></button></aside>
      </section>
      <section className={styles.algorithmBench}>
        <header><div><span>SEARCH STRATEGY</span>{(["BFS","DFS","A*"] as const).map((item) => <button type="button" key={item} className={strategy === item ? styles.strategyActive : ""} onClick={() => selectStrategy(item)}>{item}</button>)}</div><p>VISITED {visited.map((index) => nodes[index].id).join(" → ")}</p></header>
        <div>{world.tasks.map((task,index) => <button type="button" key={task.label} className={active === index ? styles.algorithmActive : ""} onClick={() => setActive(index)}><span>0{index + 1}</span><div><small>{task.meta}</small><strong>{task.label}</strong></div><i><b style={{ width: `${[78,56,69][index]}%` }} /></i><ArrowUpRight size={17} /></button>)}</div>
      </section>
      <AnimatePresence>{session && <SessionOverlay world={world} title={world.tasks[active].label} onClose={() => setSession(false)} />}</AnimatePresence>
    </main>
  );
}

function GradientWorld({ world }: WorldProps) {
  const reduceMotion = useReducedMotion();
  const [optimizer, setOptimizer] = useState<"SGD" | "MOMENTUM" | "ADAM">("ADAM");
  const [rate, setRate] = useState(0.024);
  const [active, setActive] = useState(0);
  const [session, setSession] = useState(false);
  const progress = Math.min(1,rate / 0.08);
  const epoch = Math.round(8 + progress * 42);
  const loss = Math.max(0.032,1.284 - progress * 1.19 - (optimizer === "ADAM" ? .05 : optimizer === "MOMENTUM" ? .025 : 0));
  const paths = {
    SGD: "M80 300 C160 90 185 315 270 170 S395 102 485 63",
    MOMENTUM: "M80 300 C155 225 172 120 252 195 S358 128 485 63",
    ADAM: "M80 300 C165 277 210 230 285 164 S405 92 485 63",
  };
  return (
    <main className={`${styles.world} ${styles.gradient}`} style={{ "--rate": progress } as React.CSSProperties}>
      <div className={styles.gradientMesh} aria-hidden="true"><i /><i /><i /></div>
      <WorldHeader world={world} action={<button type="button" onClick={() => setOptimizer((value) => value === "SGD" ? "MOMENTUM" : value === "MOMENTUM" ? "ADAM" : "SGD")}><FlaskConical size={17} />NEW RUN</button>} />
      <section className={styles.gradientHero}>
        <motion.div className={styles.gradientCopy} initial={reduceMotion ? false : { opacity: 0, x: -40 }} animate={{ opacity: 1, x: 0 }}><span>EXPERIMENT / LOSS LANDSCAPE 17</span><h1>不要只看最终精度，<br /><em>去观察模型如何抵达它。</em></h1><p>{world.description}</p><button type="button" onClick={() => setSession(true)}><Play size={17} fill="currentColor" />LAUNCH TRAINING</button></motion.div>
        <div className={styles.lossLandscape}>
          <svg viewBox="0 0 560 390" role="img" aria-label={`${optimizer} 优化器损失地形`}>
            {[0,1,2,3,4,5].map((index) => <ellipse key={index} cx="340" cy="172" rx={52 + index * 42} ry={25 + index * 26} transform={`rotate(-18 340 172)`} />)}
            <path className={styles.trainingPath} d={paths[optimizer]} />
            <motion.circle r="11" fill="#c8ff36" stroke="#111318" strokeWidth="5" animate={{ cx: 80 + progress * 405, cy: 300 - progress * 237 }} />
          </svg>
          <div className={styles.lossBadge}><small>LIVE LOSS</small><strong>{loss.toFixed(3)}</strong><span>EPOCH {String(epoch).padStart(2,"0")} / 50</span></div>
          <div className={styles.landscapeLegend}><span><i />LOW LOSS</span><span><i />HIGH CURVATURE</span><span>θ₁ × θ₂</span></div>
        </div>
        <aside className={styles.optimizerPanel}><header><SlidersHorizontal size={18} /><span>OPTIMIZER LAB</span></header><div className={styles.optimizerTabs}>{(["SGD","MOMENTUM","ADAM"] as const).map((item) => <button type="button" key={item} className={optimizer === item ? styles.optimizerActive : ""} onClick={() => setOptimizer(item)}>{item}</button>)}</div><label><span>LEARNING RATE</span><strong>{rate.toFixed(3)}</strong><input aria-label="学习率" type="range" min="0.001" max="0.08" step="0.001" value={rate} onChange={(event) => setRate(Number(event.target.value))} /></label><dl><div><dt>GRAD NORM</dt><dd>{(2.8 - progress * 2.1).toFixed(2)}</dd></div><div><dt>VAL ACC</dt><dd>{(68 + progress * 23).toFixed(1)}%</dd></div><div><dt>PLATEAU</dt><dd>{optimizer === "SGD" ? "LIKELY" : "CLEAR"}</dd></div></dl><button type="button" onClick={() => setSession(true)}>OPEN RUN 042 <ArrowUpRight size={16} /></button></aside>
      </section>
      <section className={styles.experimentRuns}><header><div><span>EXPERIMENT QUEUE</span><strong>假设必须先于指标被写下</strong></div><span>3 CONTROLLED RUNS</span></header><div>{world.tasks.map((task,index) => <motion.button layout type="button" key={task.label} className={active === index ? styles.runActive : ""} onClick={() => setActive(index)}><span>RUN / 0{index + 1}</span><h2>{task.label}</h2><small>{task.meta}</small><div><i style={{ width: `${[82,47,63][index]}%` }} /></div><footer><span>{["REPRODUCIBLE","IN QUEUE","REVIEWING"][index]}</span><ArrowUpRight size={17} /></footer></motion.button>)}</div></section>
      <AnimatePresence>{session && <SessionOverlay world={world} title={world.tasks[active].label} onClose={() => setSession(false)} />}</AnimatePresence>
    </main>
  );
}

function LatentWorld({ world }: WorldProps) {
  const reduceMotion = useReducedMotion();
  const [token, setToken] = useState(2);
  const [temperature, setTemperature] = useState(0.7);
  const [active, setActive] = useState(0);
  const [session, setSession] = useState(false);
  const tokens = ["模", "型", "如", "何", "理", "解"];
  const embeddings = Array.from({length:14},(_,index) => ({ x: 12 + (index * 37) % 78, y: 12 + (index * 53) % 72, group: index % 3 }));
  return (
    <main className={`${styles.world} ${styles.latent}`} style={{ "--temperature": temperature } as React.CSSProperties}>
      <div className={styles.latentField} aria-hidden="true">{embeddings.map((point,index) => <i key={index} style={{ "--x": `${point.x}%`, "--y": `${point.y}%`, "--group": point.group, "--i": index } as React.CSSProperties} />)}</div>
      <WorldHeader world={world} action={<button type="button" onClick={() => setToken((value) => (value + 1) % tokens.length)}><BrainCircuit size={17} />SHIFT PROBE</button>} />
      <section className={styles.latentHero}>
        <motion.div className={styles.latentCopy} initial={reduceMotion ? false : { opacity: 0, y: 35 }} animate={{ opacity: 1, y: 0 }}><span>REPRESENTATION SCIENCE / OBSERVATORY 18</span><h1>模型不是黑箱，<br /><em>它是一片等待测量的空间。</em></h1><p>{world.description}</p><button type="button" onClick={() => setSession(true)}><BrainCircuit size={17} />START OBSERVATION</button></motion.div>
        <div className={styles.embeddingScope} aria-label="潜空间表示簇">
          <div className={styles.scopeRings}><i /><i /><i /></div>
          {embeddings.map((point,index) => <motion.button type="button" aria-label={`潜空间样本 ${index + 1}`} key={index} className={`${styles.embeddingPoint} ${index % tokens.length === token ? styles.embeddingSelected : ""}`} style={{ left: `${point.x}%`, top: `${point.y}%`, "--group": point.group } as React.CSSProperties} onClick={() => setToken(index % tokens.length)} animate={index % tokens.length === token ? { scale: [1,1.35,1] } : { scale: 1 }} />)}
          <div className={styles.probeBeam}><ScanLine size={20} /><strong>z[{token}]</strong><span>semantic direction</span></div>
        </div>
        <aside className={styles.probePanel}><header><Eye size={18} /><span>ACTIVE PROBE</span></header><small>SELECTED TOKEN</small><strong>{tokens[token]}</strong><p>Layer 18 · Head 07<br />方向性置信度 {(84 + token * 2.1).toFixed(1)}%</p><label><span>TEMPERATURE</span><b>{temperature.toFixed(1)}</b><input aria-label="采样温度" type="range" min="0.1" max="1.2" step="0.1" value={temperature} onChange={(event) => setTemperature(Number(event.target.value))} /></label><button type="button" onClick={() => setSession(true)}>FREEZE EVIDENCE <ArrowUpRight size={16} /></button></aside>
      </section>
      <section className={styles.attentionLab}>
        <header><div><span>ATTENTION MICROSCOPE</span><strong>点击词元，观察信息流向如何重排</strong></div><p>HEAD 07 / LAYER 18</p></header>
        <div className={styles.attentionWorkspace}>
          <div className={styles.tokenRail}>{tokens.map((item,index) => <button type="button" key={item} className={token === index ? styles.tokenActive : ""} onClick={() => setToken(index)}><span>{item}</span><small>t{index + 1}</small></button>)}</div>
          <div className={styles.attentionMatrix} role="grid" aria-label="注意力矩阵">{tokens.flatMap((_,row) => tokens.map((__,column) => { const weight = ((((row + 1) * (column + 3) + (token + 1) * 7) % 10) + 1) / 10; return <button type="button" role="gridcell" aria-label={`词元 ${row + 1} 到 ${column + 1}，权重 ${weight}`} key={`${row}-${column}`} style={{ "--weight": Math.min(1,weight * (1.35 - temperature * .25)) } as React.CSSProperties} onClick={() => setToken(column)}><span>{weight.toFixed(1)}</span></button>; }))}</div>
          <div className={styles.hypothesisStack}>{world.tasks.map((task,index) => <button type="button" key={task.label} className={active === index ? styles.hypothesisActive : ""} onClick={() => setActive(index)}><span>HYPOTHESIS 0{index + 1}</span><strong>{task.label}</strong><small>{task.meta}</small><i><b style={{ width: `${[72,58,84][index]}%` }} /></i></button>)}</div>
        </div>
      </section>
      <AnimatePresence>{session && <SessionOverlay world={world} title={world.tasks[active].label} onClose={() => setSession(false)} />}</AnimatePresence>
    </main>
  );
}

function KernelWorld({ world }: WorldProps) {
  const [cycle, setCycle] = useState(0);
  const [trace, setTrace] = useState(true);
  const [active, setActive] = useState(0);
  const [session, setSession] = useState(false);
  const stages = ["SOURCE", "COMPILE", "CACHE", "CPU", "COMMIT"];
  const nextCycle = () => setCycle((value) => value >= stages.length - 1 ? 0 : value + 1);
  return (
    <main className={`${styles.world} ${styles.kernel} ${trace ? styles.kernelTracing : ""}`} style={{ "--cycle": cycle } as React.CSSProperties}>
      <div className={styles.kernelNoise} aria-hidden="true" />
      <WorldHeader world={world} action={<button type="button" onClick={() => setTrace((value) => !value)}><Binary size={17} />{trace ? "TRACE ON" : "TRACE OFF"}</button>} />
      <section className={styles.kernelHero}>
        <div className={styles.kernelCopy}><span>SYSTEMS LAB / RING 0 / TRACE 019</span><h1>理解抽象，<br /><em>要一路追到机器真正执行的地方。</em></h1><p>{world.description}</p><button type="button" onClick={() => setSession(true)}><Cpu size={17} />ENTER KERNEL ROOM</button></div>
        <div className={styles.cpuDie} aria-label="处理器核心剖面"><div className={styles.dieGrid}>{Array.from({length:16},(_,index) => <i key={index} className={index <= cycle * 3 ? styles.dieActive : ""} />)}</div><div className={styles.dieCore}><Cpu size={38} /><strong>{240 - cycle * 37}</strong><small>CYCLES</small></div><span className={styles.busTop} /><span className={styles.busRight} /><span className={styles.busBottom} /><span className={styles.busLeft} /></div>
        <aside className={styles.systemMonitor}><header><ScanLine size={17} /><span>LIVE SYSTEM TRACE</span></header><strong>0x{(4096 + cycle * 197).toString(16).toUpperCase()}</strong><p>CURRENT STAGE <b>{stages[cycle]}</b></p><div className={styles.binaryStream}>{Array.from({length:48},(_,index) => <i key={index}>{(index + cycle) % 3 === 0 ? "1" : "0"}</i>)}</div><dl><div><dt>L1 HIT</dt><dd>{92 - cycle * 2}%</dd></div><div><dt>IPC</dt><dd>{(1.2 + cycle * .34).toFixed(2)}</dd></div><div><dt>STALL</dt><dd>{cycle === 2 ? "MISS" : "NONE"}</dd></div></dl><button type="button" onClick={nextCycle}>NEXT CLOCK <ArrowUpRight size={16} /></button></aside>
      </section>
      <section className={styles.pipelineLab}>
        <header><div><span>INSTRUCTION PIPELINE</span><strong>一条指令穿过的五层现实</strong></div><p>CLOCK CYCLE / {String(cycle + 1).padStart(2,"0")}</p></header>
        <div className={styles.pipeline}>{stages.map((stage,index) => <button type="button" key={stage} className={`${index < cycle ? styles.pipelinePassed : ""} ${index === cycle ? styles.pipelineActive : ""}`} onClick={() => setCycle(index)}><span>0{index + 1}</span><div>{[<Braces key="source" />,<Workflow key="compile" />,<Layers3 key="cache" />,<Cpu key="cpu" />,<Check key="commit" />][index]}<strong>{stage}</strong></div><small>{["main.tsx","IR / ASM","L1 / L2","EXECUTE","VISIBLE"][index]}</small><i /></button>)}</div>
      </section>
      <section className={styles.schedulerBoard}>
        <header><span>LEARNING PROCESS SCHEDULER</span><p>PRIORITY QUEUE / 03 READY</p></header>
        <div>{world.tasks.map((task,index) => <motion.button layout type="button" key={task.label} className={active === index ? styles.processActive : ""} onClick={() => setActive(index)}><span>PID {214 + index}</span><div><strong>{task.label}</strong><small>{task.meta}</small></div><i><b style={{ width: `${[76,48,62][index]}%` }} /></i><em>{["RUNNING","READY","WAITING"][index]}</em></motion.button>)}</div>
      </section>
      <AnimatePresence>{session && <SessionOverlay world={world} title={world.tasks[active].label} onClose={() => setSession(false)} />}</AnimatePresence>
    </main>
  );
}
