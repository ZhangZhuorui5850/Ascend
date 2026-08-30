"use client";

import { useRouter } from "next/navigation";
import { RotateCcw, TriangleAlert } from "lucide-react";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  return (
    <main className="errorState">
      <span><TriangleAlert size={24} /></span>
      <h1>这个区域暂时没有加载成功</h1>
      <p>你的数据没有丢失。可以立即重试；如果仍然失败，再返回上一页。</p>
      <div className="errorActions">
        <button className="primaryButton" onClick={reset} type="button"><RotateCcw size={15} />重新加载</button>
        <button className="secondaryButton" onClick={() => router.back()} type="button">返回上一页</button>
      </div>
    </main>
  );
}
