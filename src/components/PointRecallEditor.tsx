"use client";

import { useState } from "react";
import { Check, Save } from "lucide-react";
import { updatePointAction } from "@/app/actions/knowledge";
import type { PointRow } from "@/lib/repo/knowledge";

export function PointRecallEditor({ point, subjectCode, report }: {
  point: Pick<PointRow, "id" | "prompt" | "answer">;
  subjectCode: string;
  report: (result: { ok: boolean; error?: string }) => void;
}) {
  return <PointRecallEditorForm key={`${point.id}:${point.prompt}:${point.answer}`} point={point} report={report} subjectCode={subjectCode} />;
}

function PointRecallEditorForm({ point, subjectCode, report }: {
  point: Pick<PointRow, "id" | "prompt" | "answer">;
  subjectCode: string;
  report: (result: { ok: boolean; error?: string }) => void;
}) {
  const [prompt, setPrompt] = useState(point.prompt);
  const [answer, setAnswer] = useState(point.answer);
  const [baseline, setBaseline] = useState({ prompt: point.prompt, answer: point.answer });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirty = prompt.trim() !== baseline.prompt || answer.trim() !== baseline.answer;

  async function save() {
    if (!dirty || saving) return;
    setSaving(true);
    let result: { ok: boolean; error?: string };
    try {
      result = await updatePointAction({
        id: point.id,
        prompt: prompt.trim(),
        answer: answer.trim(),
        subjectCode,
      });
    } catch {
      result = { ok: false, error: "网络异常，回忆卡未保存" };
    }
    setSaving(false);
    if (result.ok) {
      setBaseline({ prompt: prompt.trim(), answer: answer.trim() });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1800);
    }
    report(result);
  }

  return (
    <section aria-label="主动回忆内容" className="recallEditor">
      <div className="recallField recallPromptField">
        <div className="recallFieldHead">
          <span className="recallSide">问</span>
          <label htmlFor={`prompt-${point.id}`}>检索问题</label>
          <small>复习时先看到这里</small>
        </div>
        <textarea
          id={`prompt-${point.id}`}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void save();
          }}
          placeholder="例如：矩阵可逆有哪些等价条件？每个条件怎样互相推出？"
          rows={3}
          value={prompt}
        />
      </div>
      <div className="recallField recallAnswerField">
        <div className="recallFieldHead">
          <span className="recallSide">答</span>
          <label htmlFor={`answer-${point.id}`}>答案骨架</label>
          <small>保留得分点与易错边界</small>
        </div>
        <textarea
          id={`answer-${point.id}`}
          onChange={(event) => setAnswer(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void save();
          }}
          placeholder="关键定义\n推导步骤\n最终结论\n容易混淆的条件"
          rows={7}
          value={answer}
        />
      </div>
      <footer className="recallEditorFooter">
        <span className={dirty ? "recallSaveState dirty" : "recallSaveState"}>
          {saved ? <><Check size={13} />已保存</> : dirty ? "有修改待保存" : "内容已同步"}
        </span>
        <button className="recallSaveButton" disabled={!dirty || saving} onClick={() => void save()} type="button">
          <Save size={14} />
          {saving ? "保存中…" : "保存回忆卡"}
        </button>
      </footer>
    </section>
  );
}
