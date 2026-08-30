"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="zh-CN">
      <body style={{ alignItems: "center", background: "#f7f1e5", color: "#33291c", display: "grid", font: "15px/1.7 system-ui, sans-serif", justifyItems: "center", minHeight: "100vh", margin: 0, padding: "24px", textAlign: "center" }}>
        <main>
          <h1 style={{ fontSize: "22px", margin: "0 0 10px" }}>页面出了点问题</h1>
          <p style={{ margin: "0 0 18px" }}>你的数据没有丢失。点击下面的按钮重新加载应用。</p>
          <button onClick={reset} style={{ border: "1px solid #b0492f", borderRadius: "8px", background: "#b0492f", color: "#fff7ee", cursor: "pointer", fontSize: "14px", padding: "10px 18px" }} type="button">
            重新加载
          </button>
        </main>
      </body>
    </html>
  );
}
