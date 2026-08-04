"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowUpRight, Check, Clock3, Grip, Plus, RotateCw, Scissors, Sparkles, Star, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import styles from "./papercut.module.css";

const startingTasks = [
  { id: 1, mark: "A", title: "把状态转移写成一句人话", subject: "动态规划", time: "45 MIN", color: "yellow" },
  { id: 2, mark: "B", title: "不看答案重做最长上升子序列", subject: "错题回炉", time: "30 MIN", color: "blue" },
  { id: 3, mark: "C", title: "画出条件概率的关系图", subject: "概率论", time: "25 MIN", color: "cream" },
];

export function PapercutExperience() {
  const reduceMotion = useReducedMotion();
  const [tasks, setTasks] = useState(startingTasks);
  const [planOpen, setPlanOpen] = useState(false);
  const [sticker, setSticker] = useState("今天只做真正重要的事");
  const [energy, setEnergy] = useState(74);

  const finish = (id: number) => {
    setTasks((current) => current.filter((task) => task.id !== id));
    setEnergy((value) => Math.min(100, value + 8));
  };

  return (
    <main className={styles.desk}>
      <div className={styles.paperNoise} aria-hidden="true" />
      <header className={styles.header}>
        <Link href="/concept"><ArrowLeft size={17} />四个世界</Link>
        <div className={styles.logo}><Scissors size={18} /><span>PAPERCUT!</span></div>
        <button type="button" onClick={() => setPlanOpen(true)}><Plus size={17} />贴一张新纸</button>
      </header>

      <div className={styles.ticker} aria-hidden="true">
        <div>MAKE IT VISIBLE　→　MAKE IT SMALL　→　MAKE IT DONE　✦　MAKE IT VISIBLE　→　MAKE IT SMALL　→　MAKE IT DONE　✦</div>
      </div>

      <section className={styles.hero}>
        <motion.div className={styles.titleBlock} initial={reduceMotion ? false : { opacity: 0, rotate: -4, y: 35 }} animate={{ opacity: 1, rotate: -1, y: 0 }}>
          <span className={styles.dateTape}>FRI · AUG 01 · ISSUE 214</span>
          <h1>今天，<br />动手把<br /><em>难题剪开。</em></h1>
          <p>先理解一小块，再把它贴回完整的知识结构。</p>
        </motion.div>

        <motion.div drag={!reduceMotion} dragConstraints={{ left: -80, right: 80, top: -45, bottom: 65 }} dragElastic={.18}
          className={styles.dragSticker} whileDrag={{ scale: 1.08, rotate: 5 }}>
          <Grip size={15} /><span>{sticker}</span><small>拖动我</small>
        </motion.div>

        <motion.div className={styles.energyDial} initial={reduceMotion ? false : { scale: 0, rotate: -80 }} animate={{ scale: 1, rotate: 7 }}>
          <span>ENERGY</span><strong>{energy}</strong><small>GOOD ENOUGH</small><i style={{ "--energy": `${energy}%` } as React.CSSProperties} />
        </motion.div>

        <motion.button type="button" className={styles.bigAction} onClick={() => setPlanOpen(true)} whileTap={reduceMotion ? undefined : { scale: .94, rotate: -2 }}>
          <span><Star size={18} fill="currentColor" />START WITH</span><strong>动态规划</strong><small>45 MIN · 无干扰</small><ArrowUpRight size={24} />
        </motion.button>

        <div className={styles.starburst} aria-hidden="true"><Sparkles size={28} /><span>3</span><small>THINGS<br />THAT MATTER</small></div>
      </section>

      <section className={styles.board}>
        <div className={styles.boardHeading}><div><small>YOUR CUTTING BOARD</small><h2>把完成的撕下来。</h2></div><span>{tasks.length} / 3 LEFT</span></div>
        <div className={styles.taskStack}>
          <AnimatePresence mode="popLayout">
            {tasks.map((task,index) => (
              <motion.article layout key={task.id} className={`${styles.task} ${styles[task.color]}`}
                initial={reduceMotion ? false : { opacity: 0, y: 50, rotate: index % 2 ? 3 : -3 }} animate={{ opacity: 1, y: 0, rotate: index % 2 ? 1 : -1 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 380, y: -90, rotate: 18, scale: .7 }}>
                <span className={styles.taskMark}>{task.mark}</span>
                <div><small>{task.subject}</small><h3>{task.title}</h3></div>
                <span className={styles.taskTime}><Clock3 size={14} />{task.time}</span>
                <button type="button" onClick={() => finish(task.id)}><Scissors size={16} />撕下来</button>
                <i className={styles.tape} aria-hidden="true" />
              </motion.article>
            ))}
          </AnimatePresence>
          {tasks.length === 0 && <motion.div className={styles.cleared} initial={{ scale: .5, rotate: -15 }} animate={{ scale: 1, rotate: 2 }}>
            <Check size={36} /><strong>桌面清空！</strong><span>今天真正重要的三件事已经闭环。</span>
            <button type="button" onClick={() => { setTasks(startingTasks); setEnergy(74); }}><RotateCw size={15} />重新贴回</button>
          </motion.div>}
        </div>
      </section>

      <section className={styles.scraps}>
        <article><span>01</span><small>昨日留下</small><strong>“状态”不是表格，它是问题在某一刻的完整描述。</strong></article>
        <article><span>02</span><small>今日提醒</small><strong>先独立取回，再重新阅读。困难本身就是信号。</strong></article>
        <motion.div drag={!reduceMotion} dragConstraints={{ left: -45, right: 45, top: -45, bottom: 45 }} className={styles.miniNote}>
          <input aria-label="便签内容" value={sticker} onChange={(event) => setSticker(event.target.value)} /><small>EDIT ME ↗</small>
        </motion.div>
      </section>

      <footer className={styles.footer}><span>ASCEND PAPERCUT / 03</span><span>DRAG · TEAR · REARRANGE</span><span>NO PERFECT DAYS REQUIRED</span></footer>

      <AnimatePresence>{planOpen && <motion.div className={styles.planBackdrop} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={() => setPlanOpen(false)}>
        <motion.section className={styles.planSheet} initial={reduceMotion ? false : { y: "110%", rotate: 5 }} animate={{ y: 0, rotate: -1 }} exit={{ y: "110%", rotate: 4 }}
          onMouseDown={(event) => event.stopPropagation()}>
          <button type="button" className={styles.close} onClick={() => setPlanOpen(false)}><X size={20} /></button>
          <span className={styles.sheetTape} /><small>NOW / 45 MINUTES</small><h2>从状态定义开始，<br />不要急着写方程。</h2>
          <div className={styles.prompt}><span>01</span><p>用一句完整的话写出 <b>dp[i]</b> 到底代表什么。</p></div>
          <div className={styles.prompt}><span>02</span><p>列出这个状态成立需要的全部历史信息。</p></div>
          <button type="button" className={styles.sheetAction} onClick={() => setPlanOpen(false)}>拿走这张纸 <ArrowUpRight size={19} /></button>
        </motion.section>
      </motion.div>}</AnimatePresence>
    </main>
  );
}
