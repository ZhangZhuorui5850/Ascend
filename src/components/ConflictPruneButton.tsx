"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ConflictPruneButton({ resolvedBefore }: { resolvedBefore: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isPruning, setPruning] = useState(false);

  async function prune() {
    setPruning(true);
    setMessage("");
    const response = await fetch("/api/conflicts/prune", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resolvedBefore }),
    });
    const payload = (await response.json()) as { deleted?: number; error?: string };
    setPruning(false);
    if (!response.ok) {
      setMessage(payload.error || "清理失败");
      return;
    }
    setMessage(`已清理 ${payload.deleted ?? 0} 条已解决冲突`);
    router.refresh();
  }

  return (
    <div className="pruneControl">
      <button className="secondaryButton" disabled={isPruning} onClick={prune} type="button">
        {isPruning ? "清理中..." : "清理 30 天前已解决冲突"}
      </button>
      {message ? <small>{message}</small> : null}
    </div>
  );
}
