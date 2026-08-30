import Link from "next/link";

export default function NotFound() {
  return (
    <main className="errorState">
      <span aria-hidden className="emptySeal">走错</span>
      <h1>这里没有页面</h1>
      <p>地址可能输错了，或者内容已被移动。从下面的入口回到工作区。</p>
      <div className="errorActions">
        <Link className="primaryButton" href="/">回到今天</Link>
        <Link className="secondaryButton" href="/tasks">看任务</Link>
      </div>
    </main>
  );
}
