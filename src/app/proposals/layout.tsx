import type { Metadata } from "next";
import styles from "./layout.module.css";

export const metadata: Metadata = {
  title: "Ascend · 前端方向提案",
  description: "五套基于同一组学习数据契约的可运行前端方案。",
};

export default function ProposalsLayout({ children }: { children: React.ReactNode }) {
  return <div className={styles.scope}>{children}</div>;
}
