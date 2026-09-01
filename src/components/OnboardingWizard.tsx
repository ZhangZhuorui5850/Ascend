"use client";

import { startTransition, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Plus } from "lucide-react";
import { completeOnboardingAction } from "@/app/actions/settings";
import { todayKey } from "@/lib/dates";
import type { AppSettings } from "@/lib/repo/settings";
import styles from "./OnboardingWizard.module.css";

type SubjectOption = { code: string; name: string };

export function OnboardingWizard({ initial, subjects }: { initial: AppSettings; subjects: SubjectOption[] }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [subjectCode, setSubjectCode] = useState(initial.enabledSubjectCodes[0] ?? subjects[0]?.code ?? "");
  const [creatingSubject, setCreatingSubject] = useState(!subjects.length);
  const [newSubjectCode, setNewSubjectCode] = useState("");
  const [newSubjectName, setNewSubjectName] = useState("");
  const [goal, setGoal] = useState(initial.learningGoal);
  const [firstTask, setFirstTask] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mutationId = useRef<string | null>(null);
  const steps = ["学习", "目标", "第一件事"];

  function next() {
    setError("");
    if (step === 0) {
      if (creatingSubject && (!newSubjectCode.trim() || !newSubjectName.trim())) {
        setError("请填写新科目的编号和名称");
        return;
      }
      if (!creatingSubject && !subjectCode) {
        setError("请选择一个当前科目");
        return;
      }
    }
    if (step === 1 && !goal.trim()) {
      setError("请写下最近最重要的目标");
      return;
    }
    setStep((current) => Math.min(2, current + 1));
  }

  function finish() {
    if (busy || !firstTask.trim()) {
      if (!firstTask.trim()) setError("请写下今天第一件要完成的事");
      return;
    }
    mutationId.current ??= crypto.randomUUID();
    setBusy(true);
    setError("");
    startTransition(async () => {
      try {
        const result = await completeOnboardingAction({
          clientMutationId: mutationId.current!,
          day: todayKey(),
          learningGoal: goal,
          subject: creatingSubject
            ? { code: newSubjectCode, name: newSubjectName }
            : { code: subjectCode },
          firstTaskTitle: firstTask,
        });
        if (!result.ok) {
          setError(result.error || "保存失败，可以重试");
          return;
        }
        router.push("/", { transitionTypes: ["nav-forward"] });
      } catch (reason) {
        console.error("完成引导失败", reason);
        setError("网络异常，内容未丢失，可以重试");
      } finally {
        setBusy(false);
      }
    });
  }

  return (
    <section className={styles.card}>
      <ol aria-label="开始使用进度" className={styles.steps}>
        {steps.map((label, index) => (
          <li aria-current={index === step ? "step" : undefined} data-done={index < step} key={label}>
            <span>{index < step ? <Check aria-hidden size={14} /> : index + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <div className={styles.pane}>
          <p className={styles.kicker}>STEP 1 · 学习</p>
          <h1>你准备学什么？</h1>
          <p className={styles.description}>先选一条当前主线。章节、考试和高级设置都可以以后再补。</p>
          {!creatingSubject && subjects.length ? (
            <div className={styles.subjects} role="radiogroup" aria-label="选择当前科目">
              {subjects.map((subject) => (
                <button
                  aria-checked={subjectCode === subject.code}
                  key={subject.code}
                  onClick={() => setSubjectCode(subject.code)}
                  role="radio"
                  type="button"
                >
                  <strong>{subject.name}</strong>
                  <span>{subject.code}</span>
                  {subjectCode === subject.code ? <Check aria-hidden size={17} /> : null}
                </button>
              ))}
            </div>
          ) : (
            <div className={styles.newSubject}>
              <label><span>科目编号</span><input autoFocus maxLength={20} onChange={(event) => setNewSubjectCode(event.target.value.toUpperCase())} placeholder="例如 CS" value={newSubjectCode} /></label>
              <label><span>科目名称</span><input maxLength={80} onChange={(event) => setNewSubjectName(event.target.value)} placeholder="例如 计算机基础" value={newSubjectName} /></label>
            </div>
          )}
          {subjects.length ? (
            <button className={styles.switchMode} onClick={() => setCreatingSubject((current) => !current)} type="button">
              <Plus aria-hidden size={15} />
              {creatingSubject ? "选择已有科目" : "创建新科目"}
            </button>
          ) : null}
        </div>
      ) : null}

      {step === 1 ? (
        <div className={styles.pane}>
          <p className={styles.kicker}>STEP 2 · 目标</p>
          <h1>最近最重要的目标是什么？</h1>
          <p className={styles.description}>写一个能帮助你判断取舍的短期目标。</p>
          <label className={styles.mainField}>
            <span>当前目标</span>
            <textarea autoFocus maxLength={120} onChange={(event) => setGoal(event.target.value)} placeholder="例如：四周内完成线性代数一轮复习" rows={4} value={goal} />
          </label>
        </div>
      ) : null}

      {step === 2 ? (
        <div className={styles.pane}>
          <p className={styles.kicker}>STEP 3 · 第一件事</p>
          <h1>今天第一件要完成的事是什么？</h1>
          <p className={styles.description}>它会成为一条真实的 25 分钟任务，并出现在 Today 的 NOW。</p>
          <label className={styles.mainField}>
            <span>第一件事</span>
            <input autoFocus maxLength={500} onChange={(event) => {
              setFirstTask(event.target.value);
              mutationId.current = null;
            }} onKeyDown={(event) => {
              if (event.key === "Enter") finish();
            }} placeholder="例如：完成矩阵第一节的 10 道练习" value={firstTask} />
          </label>
        </div>
      ) : null}

      {error ? <p aria-live="polite" className={styles.error}>{error}</p> : null}
      <div className={styles.actions}>
        {step > 0 ? (
          <button className={styles.secondary} onClick={() => {
            setError("");
            setStep((current) => current - 1);
          }} type="button"><ArrowLeft aria-hidden size={16} />上一步</button>
        ) : <span />}
        {step < 2 ? (
          <button className={styles.primary} onClick={next} type="button">下一步<ArrowRight aria-hidden size={16} /></button>
        ) : (
          <button className={styles.primary} disabled={busy || !firstTask.trim()} onClick={finish} type="button">
            {busy ? "保存中…" : "进入今天"}<ArrowRight aria-hidden size={16} />
          </button>
        )}
      </div>
    </section>
  );
}
