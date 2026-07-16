"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { BookOpen, Check, Code2, MonitorCog, Plus } from "lucide-react";
import { createSubjectAction } from "@/app/actions/knowledge";
import type { SubjectTrack } from "@/lib/repo/knowledge";

export function SubjectCreate() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [track, setTrack] = useState<SubjectTrack>("written");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
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
      <div className="subjectCreateIntro"><span className="subjectCreateMark"><Plus size={17} /></span><div><span className="sectionKicker">NEW SUBJECT</span><h2>建立一条新的学习主线</h2><p>编号负责快速识别，名称表达真实学习范围。</p></div></div>
      <form className="subjectCreateForm" onSubmit={(event) => void submit(event)}>
        <label className="subjectCodeField"><Code2 size={14} /><span>科目编号</span><input aria-label="科目编号" maxLength={12} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="M8" value={code} /></label>
        <label className="subjectNameField"><BookOpen size={14} /><span>科目名称</span><input aria-label="科目名称" maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="例如：概率论强化" value={name} /></label>
        <div aria-label="科目类型" className="subjectTrackPicker" role="group">
          <button aria-pressed={track === "written"} className={track === "written" ? "active" : undefined} onClick={() => setTrack("written")} type="button"><BookOpen size={13} /><span><strong>笔试</strong><small>推导、论述与计算</small></span>{track === "written" ? <Check size={13} /> : null}</button>
          <button aria-pressed={track === "machine"} className={track === "machine" ? "active" : undefined} onClick={() => setTrack("machine")} type="button"><MonitorCog size={13} /><span><strong>机试</strong><small>编码与上机训练</small></span>{track === "machine" ? <Check size={13} /> : null}</button>
        </div>
        <button className="subjectCreateSubmit" disabled={busy || !code.trim() || !name.trim()} type="submit"><Plus size={15} />{busy ? "创建中…" : "创建学习主线"}</button>
      </form>
      {error ? <p className="formError">{error}</p> : null}
    </section>
  );
}
