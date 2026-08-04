import Link from "next/link";
import styles from "./index.module.css";

const proposals = [
  {
    slug: "alpine",
    mark: "A",
    name: "峰线 Alpine",
    thesis: "极简专注",
    description: "一页一事，让文字、顺序与留白替你挡住噪声。",
    density: "低",
    motion: "极弱",
    pages: ["首页", "每日工作台"],
    swatches: ["#f7f6f1", "#191b21", "#4058d6"],
  },
  {
    slug: "command",
    mark: "B",
    name: "指挥舱 Command",
    thesis: "信息密集仪表盘",
    description: "把冲刺期的容量、风险、排期和进展压进一屏。",
    density: "极高",
    motion: "弱",
    pages: ["首页", "每日工作台", "日历"],
    swatches: ["#0b111d", "#182236", "#f2b84b"],
  },
  {
    slug: "editorial",
    mark: "C",
    name: "编辑部 Editorial",
    thesis: "杂志叙事",
    description: "把晨间计划与晚间复盘编排成一份可翻阅的日刊。",
    density: "中",
    motion: "中",
    pages: ["首页", "每日工作台"],
    swatches: ["#f2eadc", "#352b22", "#8b2635"],
  },
  {
    slug: "bento",
    mark: "D",
    name: "便当格 Bento",
    thesis: "卡片拼贴",
    description: "用大小不同的模块块面建立清晰、可触摸的视觉秩序。",
    density: "中",
    motion: "中",
    pages: ["首页", "日历"],
    swatches: ["#f7f0dd", "#d8e8d0", "#f1b7aa"],
  },
  {
    slug: "terminal",
    mark: "E",
    name: "终端 Terminal",
    thesis: "CLI 键盘流",
    description: "让任务、复习与记录都像命令回显一样快速、明确。",
    density: "高",
    motion: "极弱",
    pages: ["首页", "每日工作台"],
    swatches: ["#07100c", "#0e2118", "#6cf6a8"],
  },
] as const;

export default function ProposalsIndexPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.back} href="/redesign">
          ← 山径方案
        </Link>
        <p className={styles.eyebrow}>ASCEND · INTERFACE STUDIES / 01</p>
        <h1>
          同一组学习数据，
          <br />
          五种截然不同的工作方式。
        </h1>
        <p className={styles.lead}>
          这是纯前端可运行提案。所有任务 mock 均按当前 repo 的 PlannerTask snake_case
          返回结构约束；页面不读取数据库，也不会写入真实学习记录。
        </p>
      </header>

      <section aria-label="设计方案" className={styles.grid}>
        {proposals.map((proposal) => (
          <article className={styles.card} key={proposal.slug}>
            <div className={styles.cardTop}>
              <span className={styles.mark}>{proposal.mark}</span>
              <div aria-label="方案配色" className={styles.swatches}>
                {proposal.swatches.map((color) => (
                  <i key={color} style={{ background: color }} />
                ))}
              </div>
            </div>
            <p className={styles.thesis}>{proposal.thesis}</p>
            <h2>{proposal.name}</h2>
            <p className={styles.description}>{proposal.description}</p>
            <dl>
              <div>
                <dt>密度</dt>
                <dd>{proposal.density}</dd>
              </div>
              <div>
                <dt>动效</dt>
                <dd>{proposal.motion}</dd>
              </div>
              <div>
                <dt>覆盖</dt>
                <dd>{proposal.pages.join(" · ")}</dd>
              </div>
            </dl>
            <Link className={styles.open} href={`/proposals/${proposal.slug}`}>
              打开方案 <span aria-hidden>↗</span>
            </Link>
          </article>
        ))}
      </section>

      <section className={styles.matrix}>
        <div>
          <p className={styles.eyebrow}>COMPARISON MATRIX</p>
          <h2>横向比较，不只是在换颜色</h2>
        </div>
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>方案</th>
                <th>核心范式</th>
                <th>信息密度</th>
                <th>主要交互</th>
                <th>更适合</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>峰线</th>
                <td>单焦点文字流</td>
                <td>低</td>
                <td>j / k / space</td>
                <td>容易分心的深度学习</td>
              </tr>
              <tr>
                <th>指挥舱</th>
                <td>指标与时间并置</td>
                <td>极高</td>
                <td>筛选、下钻、悬停</td>
                <td>冲刺期全盘掌控</td>
              </tr>
              <tr>
                <th>编辑部</th>
                <td>日刊叙事</td>
                <td>中</td>
                <td>翻页、段落批注</td>
                <td>晨间计划与晚间复盘</td>
              </tr>
              <tr>
                <th>便当格</th>
                <td>模块化拼贴</td>
                <td>中</td>
                <td>卡片展开、日期筹码</td>
                <td>视觉整理与概览</td>
              </tr>
              <tr>
                <th>终端</th>
                <td>命令流</td>
                <td>高</td>
                <td>⌘K、j / k / x</td>
                <td>高频键盘操作</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
