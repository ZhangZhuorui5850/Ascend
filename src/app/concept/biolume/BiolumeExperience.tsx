"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowUpRight, Check, Droplets, Leaf, Moon, Play, Sparkles, Sprout, Sun, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import styles from "./biolume.module.css";

const nodes = [
  { id: "state", label: "状态定义", subject: "动态规划", x: 50, y: 18, size: 84, tone: "lime", health: 82 },
  { id: "transition", label: "状态转移", subject: "动态规划", x: 78, y: 41, size: 70, tone: "aqua", health: 64 },
  { id: "boundary", label: "边界", subject: "数学基础", x: 68, y: 76, size: 60, tone: "amber", health: 41 },
  { id: "complexity", label: "复杂度", subject: "算法分析", x: 30, y: 73, size: 66, tone: "aqua", health: 73 },
  { id: "recall", label: "提取", subject: "记忆策略", x: 18, y: 38, size: 58, tone: "lime", health: 91 },
];

const growthTasks = [
  { id: 1, title: "写出状态的完整语义", detail: "动态规划 · 45 分钟", reward: "+12 生长" },
  { id: 2, title: "无提示重建转移方程", detail: "变式练习 · 30 分钟", reward: "+9 生长" },
  { id: 3, title: "回应 8 个记忆信号", detail: "间隔复习 · 18 分钟", reward: "+6 生长" },
];

export function BiolumeExperience() {
  const reduceMotion = useReducedMotion();
  const [phase, setPhase] = useState<"night" | "dawn">("night");
  const [activeNode, setActiveNode] = useState(nodes[0]);
  const [done, setDone] = useState<number[]>([]);
  const [vitality, setVitality] = useState(76);
  const [detailOpen, setDetailOpen] = useState(false);
  const growth = useMemo(() => 68 + done.length * 7, [done]);

  const complete = (id: number) => {
    setDone((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    setVitality((value) => Math.min(99, value + (done.includes(id) ? -4 : 5)));
  };

  return (
    <main className={styles.garden} data-phase={phase}>
      <div className={styles.atmosphere} aria-hidden="true"><i /><i /><i /></div>
      <div className={styles.spores} aria-hidden="true">{Array.from({ length: 18 }, (_, index) => <i key={index}
        style={{ "--i": index, "--left": `${(index * 47) % 97}%` } as React.CSSProperties} />)}</div>
      <header className={styles.header}>
        <Link href="/concept"><ArrowLeft size={16} />ALL WORLDS</Link>
        <div className={styles.brand}><Leaf size={18} /><span>BIOLUME</span><small>LEARNING ECOSYSTEM</small></div>
        <button type="button" className={styles.phaseToggle} onClick={() => setPhase((value) => value === "night" ? "dawn" : "night")}>
          {phase === "night" ? <Moon size={15} /> : <Sun size={15} />}<span>{phase === "night" ? "NIGHT" : "DAWN"}</span>
        </button>
      </header>

      <section className={styles.hero}>
        <motion.div className={styles.heroCopy} initial={reduceMotion ? false : { opacity: 0, y: 35 }} animate={{ opacity: 1, y: 0 }}>
          <span className={styles.eyebrow}><i />ECOSYSTEM HEALTH / {vitality}%</span>
          <h1>知识会在<br />被使用时<span>发光。</span></h1>
          <p>今天不需要浇灌所有地方。找到正在变暗的连接，让它重新长出自己的路径。</p>
          <div className={styles.heroActions}>
            <button type="button" className={styles.growButton} onClick={() => setDetailOpen(true)}><Play size={17} fill="currentColor" />开始一次生长</button>
            <button type="button" className={styles.waterButton} onClick={() => setVitality((value) => Math.min(99, value + 3))}><Droplets size={17} />补充养分</button>
          </div>
        </motion.div>

        <section className={styles.rootMap} aria-label="知识根系图">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {nodes.map((node,index) => {
              const next = nodes[(index + 1) % nodes.length];
              return <motion.path key={node.id} d={`M ${node.x} ${node.y} Q ${50 + (index % 2 ? 12 : -10)} ${48 + index * 2} ${next.x} ${next.y}`}
                initial={reduceMotion ? false : { pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: activeNode.id === node.id ? .95 : .3 }} />;
            })}
            {nodes.slice(0,3).map((node,index) => <motion.path key={`root-${node.id}`} d={`M 50 50 Q ${node.x} ${58 + index * 5} ${node.x} 100`}
              initial={reduceMotion ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} />)}
          </svg>
          <div className={styles.heart}><span>VITALITY</span><strong>{vitality}</strong><i /><small>CONNECTED</small></div>
          {nodes.map((node,index) => <motion.button type="button" key={node.id} className={`${styles.node} ${styles[node.tone]} ${activeNode.id === node.id ? styles.nodeActive : ""}`}
            style={{ left: `${node.x}%`, top: `${node.y}%`, width: node.size, height: node.size }} onClick={() => setActiveNode(node)}
            initial={reduceMotion ? false : { opacity: 0, scale: .2 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 170, damping: 17, delay: reduceMotion ? 0 : index * .07 }}>
            <span>{node.label}</span><i /><small>{node.health}</small>
          </motion.button>)}
          <span className={styles.mapLabel}>LIVE ROOT NETWORK · 42 CONNECTIONS</span>
        </section>

        <motion.aside className={styles.nodeCard} layout key={activeNode.id} initial={reduceMotion ? false : { opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }}>
          <div className={styles.nodeCardTop}><span><Sprout size={15} />ACTIVE GROWTH</span><i /></div>
          <small>{activeNode.subject}</small><h2>{activeNode.label}</h2><strong>{activeNode.health}%</strong>
          <p>这条连接正在形成。一次无提示提取，会比重新阅读带来更多有效生长。</p>
          <div className={styles.healthBar}><i style={{ width: `${activeNode.health}%` }} /></div>
          <button type="button" onClick={() => setDetailOpen(true)}>进入这条根系 <ArrowUpRight size={17} /></button>
        </motion.aside>
      </section>

      <section className={styles.cultivation}>
        <header><div><small>TODAY&apos;S CULTIVATION</small><h2>今天只培育三件事。</h2></div><div className={styles.growthCount}><span>GROWTH</span><strong>{growth}</strong><i>%</i></div></header>
        <div className={styles.taskGrid}>{growthTasks.map((task,index) => (
          <motion.article layout key={task.id} className={done.includes(task.id) ? styles.taskDone : ""} whileHover={reduceMotion ? undefined : { y: -7 }}>
            <span className={styles.taskIndex}>0{index + 1}</span><div className={styles.seed} aria-hidden="true"><i /><i /></div>
            <small>{task.detail}</small><h3>{task.title}</h3><span className={styles.reward}>{task.reward}</span>
            <button type="button" onClick={() => complete(task.id)} aria-label={done.includes(task.id) ? `恢复 ${task.title}` : `完成 ${task.title}`}>
              {done.includes(task.id) ? <Check size={18} /> : <Droplets size={18} />}
            </button>
          </motion.article>
        ))}</div>
      </section>

      <section className={styles.memoryBed}>
        <div><Sparkles size={18} /><span>MEMORY BLOOM</span><strong>8</strong><small>signals ready to be recalled</small></div>
        <p>状态定义正在接近遗忘边缘。<br /><b>现在回忆，连接会更牢固。</b></p>
        <button type="button" onClick={() => setDetailOpen(true)}>回应信号 <ArrowUpRight size={17} /></button>
      </section>

      <footer className={styles.footer}><span><i />ECOSYSTEM SYNCHRONIZED</span><span>ROOTS 42 · BLOOMS 08 · VITALITY {vitality}</span><span>ASCEND / BIOLUME 04</span></footer>

      <AnimatePresence>{detailOpen && <motion.div className={styles.detailBackdrop} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={() => setDetailOpen(false)}>
        <motion.section className={styles.detail} initial={reduceMotion ? false : { scale: .72, opacity: 0, borderRadius: "50%" }} animate={{ scale: 1, opacity: 1, borderRadius: "34px" }} exit={{ scale: .8, opacity: 0 }}
          onMouseDown={(event) => event.stopPropagation()}>
          <div className={styles.detailGlow} aria-hidden="true" /><button type="button" className={styles.close} onClick={() => setDetailOpen(false)}><X size={19} /></button>
          <span className={styles.detailLabel}><i />GROWTH SESSION / READY</span><h2>{activeNode.label}</h2><p>关闭材料，用自己的话回答：</p>
          <blockquote>“这个概念解决了什么问题？它成立需要哪些信息？”</blockquote>
          <div className={styles.detailMeta}><span>预计 18 分钟</span><span>完成后生长 +12</span></div>
          <button type="button" className={styles.detailAction} onClick={() => setDetailOpen(false)}><Play size={18} fill="currentColor" />开始生长</button>
        </motion.section>
      </motion.div>}</AnimatePresence>
    </main>
  );
}
