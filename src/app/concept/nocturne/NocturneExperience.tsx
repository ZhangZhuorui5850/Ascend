"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowUpRight, Check, Command, Headphones, Pause, Play, Radio, Volume2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import styles from "./nocturne.module.css";

const sessions = [
  { id: 1, time: "08:30", label: "DEEP CURRENT", title: "动态规划：从状态定义重新进入", length: "45 MIN", progress: 72 },
  { id: 2, time: "10:20", label: "MEMORY TIDE", title: "无提示提取昨日三个关键结论", length: "24 MIN", progress: 38 },
  { id: 3, time: "15:00", label: "LIGHT DRIFT", title: "整理概率论中的条件关系", length: "30 MIN", progress: 12 },
];

function ParticleField({ still }: { still: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let frame = 0;
    let width = 0;
    let height = 0;
    const pointer = { x: -1000, y: -1000 };
    const particles = Array.from({ length: 52 }, (_, index) => ({
      x: (index * 97.3) % 1000,
      y: (index * 53.7) % 700,
      vx: Math.sin(index * 1.7) * 0.16,
      vy: Math.cos(index * 1.2) * 0.12,
      radius: 0.7 + (index % 4) * 0.38,
    }));
    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      particles.forEach((particle) => { particle.x %= width; particle.y %= height; });
    };
    const move = (event: PointerEvent) => { pointer.x = event.clientX; pointer.y = event.clientY; };
    const draw = () => {
      context.clearRect(0, 0, width, height);
      particles.forEach((particle, index) => {
        const dx = pointer.x - particle.x;
        const dy = pointer.y - particle.y;
        const distance = Math.max(Math.hypot(dx, dy), 1);
        if (!still && distance < 180) {
          particle.vx -= (dx / distance) * 0.006;
          particle.vy -= (dy / distance) * 0.006;
        }
        if (!still) {
          particle.x += particle.vx;
          particle.y += particle.vy;
          particle.vx *= 0.995;
          particle.vy *= 0.995;
        }
        if (particle.x < -10) particle.x = width + 10;
        if (particle.x > width + 10) particle.x = -10;
        if (particle.y < -10) particle.y = height + 10;
        if (particle.y > height + 10) particle.y = -10;
        context.beginPath();
        context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        context.fillStyle = index % 7 === 0 ? "rgba(154,255,214,.72)" : "rgba(207,202,255,.38)";
        context.fill();
      });
      if (!still) frame = window.requestAnimationFrame(draw);
    };
    resize();
    draw();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", move);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", move);
    };
  }, [still]);
  return <canvas ref={canvasRef} className={styles.particles} aria-hidden="true" />;
}

export function NocturneExperience() {
  const reduceMotion = useReducedMotion();
  const shellRef = useRef<HTMLElement>(null);
  const [selected, setSelected] = useState(0);
  const [completed, setCompleted] = useState<number[]>([]);
  const [focusOpen, setFocusOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [intensity, setIntensity] = useState<"deep" | "soft">("deep");

  const onPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (reduceMotion || !shellRef.current) return;
    shellRef.current.style.setProperty("--mx", `${event.clientX}px`);
    shellRef.current.style.setProperty("--my", `${event.clientY}px`);
    shellRef.current.style.setProperty("--px", `${(event.clientX / window.innerWidth - .5) * 18}px`);
    shellRef.current.style.setProperty("--py", `${(event.clientY / window.innerHeight - .5) * 14}px`);
  };

  return (
    <main ref={shellRef} className={styles.shell} data-intensity={intensity} onPointerMove={onPointerMove}>
      <ParticleField still={Boolean(reduceMotion)} />
      <div className={styles.liquidBackdrop} aria-hidden="true"><i /><i /><i /></div>
      <span className={styles.pointerHalo} aria-hidden="true" />

      <header className={styles.header}>
        <Link href="/concept" className={styles.back}><ArrowLeft size={16} /> ALL WORLDS</Link>
        <div className={styles.wordmark}><i /><span>NOCTURNE</span><small>IMMERSIVE STUDY SYSTEM</small></div>
        <div className={styles.headerActions}>
          <button type="button" onClick={() => setIntensity((value) => value === "deep" ? "soft" : "deep")}>
            <span className={styles.modeDot} />{intensity === "deep" ? "DEEP" : "SOFT"}
          </button>
          <button type="button" aria-label="打开命令"><Command size={16} /></button>
        </div>
      </header>

      <section className={styles.hero}>
        <motion.div className={styles.heroText} initial={reduceMotion ? false : { opacity: 0, x: -50 }} animate={{ opacity: 1, x: 0 }}>
          <span className={styles.overline}><Radio size={13} /> SIGNAL 02 / LIVE</span>
          <h1>沉入问题，<br />直到噪声<span>消失。</span></h1>
          <p>今夜不需要更多信息，只需要让一个问题变得足够清晰。</p>
          <button type="button" className={styles.begin} onClick={() => setFocusOpen(true)}>
            <Play size={18} fill="currentColor" /><span>BEGIN IMMERSION<small>45 MIN · DYNAMIC PROGRAMMING</small></span><ArrowUpRight size={19} />
          </button>
        </motion.div>

        <motion.div className={styles.liquidCore} initial={reduceMotion ? false : { opacity: 0, scale: .68 }} animate={{ opacity: 1, scale: 1 }}>
          <span className={styles.depthRing} /><span className={styles.depthRingTwo} />
          <div className={styles.liquidOrb}><i /><i /><div><small>CURRENT DEPTH</small><strong>72</strong><span>FLOW STATE</span></div></div>
          <span className={styles.orbLabelOne}>COGNITION</span><span className={styles.orbLabelTwo}>08:42</span>
        </motion.div>

        <aside className={styles.nowPanel}>
          <div className={styles.panelTop}><span>NOW PLAYING</span><Headphones size={16} /></div>
          <h2>{sessions[selected].title}</h2><p>{sessions[selected].label}</p>
          <div className={styles.waveform} aria-hidden="true">{[3,7,5,12,8,16,11,6,14,9,4,10,15,7,12,5,9,3].map((height,index) => <i key={index} style={{ height: height * 2 }} />)}</div>
          <div className={styles.panelMeta}><span>{sessions[selected].progress}% COMPLETE</span><span>{sessions[selected].length}</span></div>
          <button type="button" onClick={() => setPlaying((value) => !value)}>{playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}{playing ? "PAUSE CURRENT" : "RESUME CURRENT"}</button>
        </aside>
      </section>

      <section className={styles.sequence}>
        <div className={styles.sequenceTitle}><span>THE CURRENT / TODAY</span><strong>03</strong></div>
        <div className={styles.sessionList}>
          {sessions.map((session,index) => (
            <motion.article layout key={session.id} className={`${styles.session} ${selected === index ? styles.sessionActive : ""} ${completed.includes(session.id) ? styles.sessionDone : ""}`}
              whileHover={reduceMotion ? undefined : { x: 8 }}>
              <button type="button" className={styles.sessionSelect} onClick={() => setSelected(index)} aria-label={`选择 ${session.title}`} />
              <span className={styles.sessionTime}>{session.time}</span><span className={styles.sessionNumber}>0{index + 1}</span>
              <span className={styles.sessionCopy}><small>{session.label}</small><strong>{session.title}</strong></span>
              <span className={styles.sessionLength}>{session.length}</span>
              <span className={styles.sessionProgress}><i style={{ width: `${session.progress}%` }} /></span>
              <button type="button" className={styles.sessionCheck} aria-label={completed.includes(session.id) ? `恢复 ${session.title}` : `完成 ${session.title}`}
                onClick={() => setCompleted((items) => items.includes(session.id) ? items.filter((id) => id !== session.id) : [...items, session.id])}>
                {completed.includes(session.id) ? <Check size={15} /> : <ArrowUpRight size={15} />}
              </button>
            </motion.article>
          ))}
        </div>
      </section>

      <footer className={styles.footer}><span><i /> AMBIENT ENGINE ONLINE</span><span>MOVE TO DISTORT THE FIELD</span><span>ASCEND / 02</span></footer>

      <AnimatePresence>{focusOpen && <motion.div className={styles.focus} initial={{ opacity: 0, scale: 1.12, filter: "blur(30px)" }} animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }} exit={{ opacity: 0, scale: .96 }}>
        <div className={styles.focusRings} aria-hidden="true"><i /><i /><i /></div>
        <button type="button" className={styles.focusClose} onClick={() => setFocusOpen(false)}><X size={18} />EXIT</button>
        <span className={styles.focusLabel}>IMMERSION / 01</span><h2>动态规划：<br />从状态定义重新进入</h2>
        <strong className={styles.focusTime}>45:00</strong><p>先写出状态的完整语义，再触碰转移方程。</p>
        <button type="button" className={styles.focusPlay} onClick={() => setPlaying((value) => !value)}>{playing ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}</button>
        <div className={styles.focusSound}><Volume2 size={14} /><span><i /></span><small>DEEP CURRENT</small></div>
      </motion.div>}</AnimatePresence>
    </main>
  );
}
