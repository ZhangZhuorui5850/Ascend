import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { newWorlds } from "./worlds";
import styles from "./concept.module.css";

const concepts = [
  {
    slug: "kinetic",
    number: "01",
    name: "Kinetic Field",
    cn: "动量场",
    description: "明亮的空间化学习操作系统。轨道、脉冲、视差与沉浸式专注构成一套运动语言。",
    tags: ["Spatial", "Momentum", "Light"],
  },
  {
    slug: "nocturne",
    number: "02",
    name: "Nocturne",
    cn: "黑曜潮汐",
    description: "电影化深色界面。液态光场、实时粒子、景深和缓慢呼吸塑造高沉浸学习舱。",
    tags: ["Cinematic", "Liquid", "Dark"],
  },
  {
    slug: "papercut",
    number: "03",
    name: "Papercut",
    cn: "纸上爆破",
    description: "高饱和触觉拼贴。任务可以撕下，便签可以拖动，排版像一张持续变化的工作桌。",
    tags: ["Tactile", "Collage", "Playful"],
  },
  {
    slug: "biolume",
    number: "04",
    name: "Biolume",
    cn: "生物光域",
    description: "会生长的学习生态。知识是根系，复习是养分，完成一次练习就点亮一枚新芽。",
    tags: ["Organic", "Growth", "Ambient"],
  },
  ...newWorlds,
];

export default function ConceptIndexPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brand}><i /><span>ASCEND / EXPERIMENTAL INTERFACES</span></div>
        <span>NINETEEN MOTION SYSTEMS · 2026</span>
      </header>
      <section className={styles.intro}>
        <p>THE MOTION EDITION</p>
        <h1>不是十九张皮肤，<br />是十九种完全不同的<span>思考方式。</span></h1>
        <div><span>选择一个世界进入</span><i /></div>
      </section>
      <section className={styles.grid}>
        {concepts.map((concept) => (
          <Link key={concept.slug} href={`/concept/${concept.slug}`} className={`${styles.card} ${styles[concept.slug]}`}>
            <div className={styles.visual} aria-hidden="true">
              <span /><span /><span /><span />
            </div>
            <div className={styles.cardTop}><span>{concept.number}</span><ArrowUpRight size={19} /></div>
            <div className={styles.cardBody}>
              <small>{concept.cn}</small><h2>{concept.name}</h2><p>{concept.description}</p>
              <div>{concept.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
            </div>
          </Link>
        ))}
      </section>
      <footer>每套方案独立实现 · 支持桌面 / 平板 / 手机 · 尊重减少动效设置</footer>
    </main>
  );
}
