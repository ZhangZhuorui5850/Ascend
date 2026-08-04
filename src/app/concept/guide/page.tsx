import type { Metadata } from "next";
import { ArrowLeft, ArrowUpRight, Braces, Eye, Gauge, MoveRight, Orbit, Sparkles } from "lucide-react";
import Link from "next/link";
import styles from "./guide.module.css";

export const metadata: Metadata = {
  title: "大胆动态界面设计手册 · Ascend Concept",
  description: "从认知隐喻、视觉语法到交互物理，复用 Ascend 十九套实验主题的设计方法。",
};

const principles = [
  ["01", "从动词开始", "不用“科技感、高级感”指导设计。先选折射、锻造、追踪、下潜这类能直接生成交互的动词。"],
  ["02", "一个世界，一条规律", "布局、材质、文案、数据和反馈服从同一物理规则。单页隐喻越少，世界越可信。"],
  ["03", "大胆旋钮最多开两个", "尺度、对比、不对称、深度、节奏五项中选一到两项拉高，其余保持克制。"],
  ["04", "动效必须有职责", "只保留定向、因果、连续、奖励四类运动。不能解释职责的动效，就是视觉债务。"],
  ["05", "主题进入信息架构", "任务、进度、错误和完成都要被隐喻重写，而不是给通用卡片换一张背景。"],
  ["06", "学科表达必须真实", "证明依赖、搜索轨迹、损失地形、表示探针和缓存层次，本身就是视觉语言。"],
  ["07", "移动端改写故事", "保留先看什么、再做什么、如何反馈；不强行保留桌面的空间几何。"],
  ["08", "通过第十天测试", "连续使用十天后仍能传递状态，而不是成为墙纸；三秒内仍能找到最重要的动作。"],
] as const;

const researchWorlds = [
  { code: "MATH", name: "Axiom", verb: "推导", object: "命题依赖", signal: "证明缺口" },
  { code: "ALGO", name: "Reactor", verb: "运行", object: "访问序列", signal: "不变量" },
  { code: "ML", name: "Gradient", verb: "下降", object: "损失地形", signal: "实验对比" },
  { code: "AI", name: "Latent", verb: "探测", object: "表示空间", signal: "可证伪证据" },
  { code: "SYS", name: "Kernel", verb: "下潜", object: "执行流水线", signal: "机器轨迹" },
] as const;

const workflow = [
  ["选择瞬间", "不要设计“一个首页”，要设计开始深潜、定位失败或更新研究假设的具体瞬间。"],
  ["写反转句", "它不是旧的任务清单，而是一个新的、可以被操作的认知模型。"],
  ["提取动词", "选择三个动作和一种材料；动作生成交互，材料生成视觉。"],
  ["建立映射", "明确任务、进度、错误、完成和下一步在这个世界里分别是什么。"],
  ["只做三种交互", "一个英雄动作证明主题，两个辅助动作证明它不是静态海报。"],
  ["逐层做减法", "依次关闭粒子、光晕、透视和背景运动，只恢复真正增强因果与层级的效果。"],
] as const;

export default function ConceptGuidePage() {
  return (
    <main className={styles.page}>
      <div className={styles.atmosphere} aria-hidden="true"><i /><i /><i /></div>

      <header className={styles.header}>
        <Link href="/concept"><ArrowLeft size={16} />十九个世界</Link>
        <span>ASCEND / DESIGN PLAYBOOK / 2026</span>
        <span className={styles.headerStatus}><i />REUSABLE METHOD</span>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroIndex}><span>00</span><i /></div>
        <div className={styles.heroCopy}>
          <p>THE METHOD BEHIND THE MOTION</p>
          <h1>大胆不是<br />让页面<span>更吵。</span></h1>
          <strong>而是让一条准确的规则，贯穿整个世界。</strong>
        </div>
        <div className={styles.heroOrbit} aria-hidden="true">
          <i /><i /><i />
          <span><Sparkles size={25} /></span>
          <small>ONE LAW<br />EVERY LAYER</small>
        </div>
        <aside className={styles.manifesto}>
          <small>GENERATIVE FORMULA</small>
          <ol>
            <li><span>01</span>产品动作</li>
            <li><span>02</span>认知隐喻</li>
            <li><span>03</span>视觉语法</li>
            <li><span>04</span>交互物理</li>
            <li><span>05</span>状态反馈</li>
          </ol>
        </aside>
      </section>

      <section className={styles.definition}>
        <span>SKIN</span><MoveRight size={34} /><span>WORLD</span>
        <p>换肤改变颜色与圆角；世界改变用户如何理解任务、如何操作它，以及完成时究竟发生了什么。</p>
      </section>

      <section className={styles.principles}>
        <header className={styles.sectionHeader}>
          <div><small>01 / OPERATING PRINCIPLES</small><h2>八条生成规则</h2></div>
          <Gauge size={28} />
        </header>
        <div className={styles.principleGrid}>
          {principles.map(([number, title, body]) => (
            <article key={number}>
              <span>{number}</span><h3>{title}</h3><p>{body}</p><i />
            </article>
          ))}
        </div>
      </section>

      <section className={styles.boldness}>
        <div className={styles.boldCopy}>
          <small>02 / BOLDNESS CONTROL</small>
          <h2>五个旋钮，<br />最多拧高<span>两个。</span></h2>
          <p>尺度、对比、不对称、深度、节奏。大胆来自明确取舍，不来自效果堆叠。</p>
          <div className={styles.ratio}><strong>70</strong><span>安静工作面</span><strong>20</strong><span>主题结构</span><strong>10</strong><span>惊艳时刻</span></div>
        </div>
        <div className={styles.dials} aria-label="大胆程度的五个设计旋钮">
          {[["SCALE",82],["CONTRAST",74],["ASYMMETRY",28],["DEPTH",36],["TEMPO",18]].map(([label, value]) => (
            <div key={String(label)}><span>{label}</span><i><b style={{ transform: `scaleX(${Number(value) / 100})` }} /></i><strong>{value}</strong></div>
          ))}
          <small>EXAMPLE PROFILE / MONOLITH</small>
        </div>
      </section>

      <section className={styles.disciplines}>
        <header className={styles.sectionHeader}>
          <div><small>03 / DISCIPLINE AS INTERFACE</small><h2>专业内容本身，就是视觉语言</h2></div>
          <Orbit size={30} />
        </header>
        <div className={styles.worldTable}>
          <div className={styles.tableHead}><span>FIELD</span><span>WORLD</span><span>VERB</span><span>OBJECT</span><span>SIGNAL</span></div>
          {researchWorlds.map((world) => (
            <Link key={world.code} href={`/concept/${world.name.toLowerCase()}`}>
              <span>{world.code}</span><strong>{world.name}</strong><span>{world.verb}</span><span>{world.object}</span><span>{world.signal}</span><ArrowUpRight size={17} />
            </Link>
          ))}
        </div>
        <p className={styles.disciplineNote}><Braces size={18} /> 不使用随机公式雨、字符雨或注意力热图充当“专业感”。每个图形都应该对应一个真实概念或操作。</p>
      </section>

      <section className={styles.workflow}>
        <header className={styles.sectionHeader}>
          <div><small>04 / SIX-STEP WORKFLOW</small><h2>下一套主题，从这里开始</h2></div>
          <Eye size={29} />
        </header>
        <ol>
          {workflow.map(([title, body], index) => (
            <li key={title}><span>0{index + 1}</span><div><h3>{title}</h3><p>{body}</p></div><i /></li>
          ))}
        </ol>
      </section>

      <section className={styles.closing}>
        <small>THE REUSABLE CORE</small>
        <h2>用准确的认知隐喻<br />重写信息结构，<br />再用有因果的动效<span>让它可感知。</span></h2>
        <div>
          <Link href="/concept">返回十九个世界 <ArrowUpRight size={18} /></Link>
          <p>完整方法、十九套主题映射、主题画布与评审清单：<code>docs/design/concept-design-playbook.md</code></p>
        </div>
      </section>
    </main>
  );
}
