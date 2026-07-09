"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";
import { createSubjectAction } from "@/app/actions/knowledge";
import type { SubjectTrack } from "@/lib/repo/knowledge";

export function SubjectCreate() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [track, setTrack] = useState<SubjectTrack>("written");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!code.trim() || !name.trim() || busy) return;
    setBusy(true);
    setError("");
    const result = await createSubjectAction({ code: code.trim(), name: name.trim(), track });
    setBusy(false);
    if (result.ok) {
      setCode("");
      setName("");
      router.refresh();
    } else {
      setError(result.error || "创建失败");
    }
  }

  return (
    <section className="card subjectCreate" aria-label="新增科目">
      <div className="sectionTitle"><h2>新增科目</h2></div>
      <div className="subjectCreateForm">
        <input value={code} onChange={(event) => setCode(event.target.value)} placeholder="编号，如 M8 / J1" />
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="科目名称" />
        <select aria-label="科目类型" onChange={(event) => setTrack(event.target.value as SubjectTrack)} value={track}>
          <option value="written">笔试</option>
          <option value="machine">机试</option>
        </select>
        <button disabled={busy || !code.trim() || !name.trim()} onClick={() => void submit()} type="button">
          <Plus size={15} />
          创建
        </button>
      </div>
      {error ? <p className="formError">{error}</p> : null}
    </section>
  );
}
