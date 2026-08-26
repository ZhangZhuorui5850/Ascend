"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { ArrowUpRight, Cloud, CloudOff, FileText, Save, Upload } from "lucide-react";
import {
  getAlgorithmCodeVersionsAction,
  getAlgorithmDraftAction,
  readAlgorithmCodeVersionAction,
  saveAlgorithmDraftAction,
} from "@/app/actions/algorithm-judge";
import { useFeedback } from "@/components/FeedbackProvider";
import { RichText } from "@/components/RichText";
import type { AlgorithmProblem } from "@/lib/repo/algorithms";
import type { AlgorithmProblemAsset } from "@/lib/repo/algorithm-assets";
import type { AlgorithmCodeVersion, AlgorithmDraftConflict } from "@/lib/repo/algorithm-submissions";

export function ImportedAlgorithmWorkspace({
  codeStorageAvailable,
  problem,
}: {
  codeStorageAvailable: boolean;
  problem: AlgorithmProblem;
}) {
  const { notify } = useFeedback();
  const initialCode = problem.starterCode.cpp17 || "";
  const codeRef = useRef(initialCode);
  const revisionRef = useRef(0);
  const draftRevisionRef = useRef(0);
  const saveRef = useRef({ active: false, pending: false, notifyWhenDone: false });
  const [code, setCode] = useState(initialCode);
  const [syncState, setSyncState] = useState(codeStorageAvailable ? "正在读取云端草稿…" : "代码加密存储待配置");
  const [saving, setSaving] = useState(false);
  const [draftConflict, setDraftConflict] = useState<AlgorithmDraftConflict | null>(null);
  const [uploading, setUploading] = useState(false);
  const [assets, setAssets] = useState<AlgorithmProblemAsset[]>([]);
  const [versions, setVersions] = useState<AlgorithmCodeVersion[]>([]);

  useEffect(() => {
    if (!codeStorageAvailable) return;
    let cancelled = false;
    const requestedRevision = revisionRef.current;
    startTransition(async () => {
      const result = await getAlgorithmDraftAction({ problemId: problem.id, language: "cpp17" });
      if (cancelled) return;
      if (!result.ok) {
        setSyncState(result.error || "草稿读取失败");
        return;
      }
      if (result.sourceCode !== undefined && revisionRef.current === requestedRevision) {
        codeRef.current = result.sourceCode;
        setCode(result.sourceCode);
        draftRevisionRef.current = result.revision ?? 0;
        setDraftConflict(null);
        setSyncState(result.updatedAt ? `已同步 ${formatTime(result.updatedAt)}` : "已载入云端草稿");
      } else {
        draftRevisionRef.current = 0;
        setSyncState("当前使用 C++ 作答模板");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [codeStorageAvailable, problem.id]);

  useEffect(() => {
    if (!codeStorageAvailable) return;
    startTransition(async () => {
      const result = await getAlgorithmCodeVersionsAction({ problemId: problem.id, language: "cpp17" });
      if (result.ok && result.versions) setVersions(result.versions);
    });
  }, [codeStorageAvailable, problem.id]);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/algorithm/problems/${problem.id}/assets`, { cache: "no-store" })
      .then((response) => response.json())
      .then((result) => {
        if (!cancelled && result.ok && Array.isArray(result.assets)) setAssets(result.assets);
      });
    return () => {
      cancelled = true;
    };
  }, [problem.id]);

  useEffect(() => {
    if (!codeStorageAvailable || !code.trim() || draftConflict) return;
    const timer = window.setTimeout(() => {
      void save(true);
    }, 2_000);
    return () => window.clearTimeout(timer);
    // The debounce always saves the latest rendered code snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, codeStorageAvailable, draftConflict, problem.id]);

  async function save(silent = false) {
    if (!codeStorageAvailable || !codeRef.current.trim()) return;
    if (saveRef.current.active) {
      saveRef.current.pending = true;
      saveRef.current.notifyWhenDone ||= !silent;
      return;
    }
    saveRef.current.active = true;
    saveRef.current.notifyWhenDone = !silent;
    setSaving(true);
    try {
      do {
        saveRef.current.pending = false;
        const sourceCode = codeRef.current;
        setSyncState("保存中…");
        const result = await saveAlgorithmDraftAction({
          problemId: problem.id,
          language: "cpp17",
          sourceCode,
          baseRevision: draftRevisionRef.current,
          operationId: `draft:${crypto.randomUUID()}`,
        });
        if (!result.ok) {
          if (result.code === "DRAFT_CONFLICT" && result.conflict) {
            setDraftConflict(result.conflict);
            setSyncState(`云端 v${result.conflict.revision} 已更新`);
          } else {
            setSyncState(result.error || "保存失败");
          }
          if (saveRef.current.notifyWhenDone) notify(result.error || "代码草稿保存失败", "error");
          return;
        }
        draftRevisionRef.current = result.revision ?? draftRevisionRef.current;
        setDraftConflict(null);
        setSyncState(result.savedAt ? `已同步 ${formatTime(result.savedAt)}` : "已同步");
      } while (saveRef.current.pending);
      if (saveRef.current.notifyWhenDone) notify("代码草稿已保存并生成版本", "success");
      void refreshVersions();
    } finally {
      saveRef.current.active = false;
      saveRef.current.notifyWhenDone = false;
      setSaving(false);
    }
  }

  async function loadCloudDraft(): Promise<void> {
    const result = await getAlgorithmDraftAction({ problemId: problem.id, language: "cpp17" });
    if (!result.ok || result.sourceCode === undefined) {
      notify(result.error || "云端草稿读取失败", "error");
      return;
    }
    revisionRef.current += 1;
    codeRef.current = result.sourceCode;
    setCode(result.sourceCode);
    draftRevisionRef.current = result.revision ?? 0;
    setDraftConflict(null);
    setSyncState(`已载入云端 v${result.revision ?? 0}`);
  }

  async function saveLocalAfterConflict(): Promise<void> {
    if (!draftConflict) return;
    draftRevisionRef.current = draftConflict.revision;
    setDraftConflict(null);
    await save(false);
  }

  async function refreshVersions() {
    if (!codeStorageAvailable) return;
    const result = await getAlgorithmCodeVersionsAction({ problemId: problem.id, language: "cpp17" });
    if (result.ok && result.versions) setVersions(result.versions);
  }

  async function restoreVersion(version: AlgorithmCodeVersion) {
    const result = await readAlgorithmCodeVersionAction({ versionId: version.id });
    if (!result.ok || result.sourceCode === undefined) {
      notify(result.error || "代码版本恢复失败", "error");
      return;
    }
    revisionRef.current += 1;
    codeRef.current = result.sourceCode;
    setCode(result.sourceCode);
    setSyncState(`已载入 v${version.revision}，等待保存`);
    notify(`已载入代码版本 v${version.revision}`, "success");
  }

  async function uploadAsset(file: File | undefined) {
    if (!file || uploading) return;
    setUploading(true);
    const body = new FormData();
    body.set("file", file);
    body.set("role", "reference");
    const response = await fetch(`/api/algorithm/problems/${problem.id}/assets`, { method: "POST", body });
    const result = await response.json().catch(() => ({}));
    setUploading(false);
    if (!response.ok || !result.ok) {
      notify(result.error || "题目资料上传失败", "error");
      return;
    }
    setAssets(result.assets || []);
    notify("资料已进入算法网盘并关联当前题目", "success");
  }

  return (
    <section className="importedAlgorithmWorkspace">
      <div className="importedAlgorithmStatement">
        <header>
          <div>
            <span className="sectionKicker">PROBLEM</span>
            <h4>题面</h4>
          </div>
          {isExternalUrl(problem.sourceUrl) ? (
            <a href={problem.sourceUrl} rel="noreferrer" target="_blank">
              打开原题 <ArrowUpRight size={13} />
            </a>
          ) : null}
        </header>
        <RichText block text={problem.statementMarkdown} />
      </div>
      <div className="importedAlgorithmEditor">
        <header>
          <div>
            <span className="sectionKicker">ONLINE DRAFT</span>
            <h4>main.cpp</h4>
          </div>
          <span data-ready={codeStorageAvailable}>
            {codeStorageAvailable ? <Cloud size={13} /> : <CloudOff size={13} />}
            {syncState}
          </span>
        </header>
        <textarea
          aria-label={`${problem.title} C++ 代码`}
          onChange={(event) => {
            revisionRef.current += 1;
            codeRef.current = event.target.value;
            setCode(event.target.value);
            setSyncState(codeStorageAvailable ? "等待同步" : "代码加密存储待配置");
          }}
          spellCheck={false}
          value={code}
        />
        <footer>
          <small>浏览器草稿与 VS Code 将共享同一份云端版本。</small>
          {draftConflict ? (
            <span className="algorithmDraftConflictActions">
              <button className="secondaryButton" onClick={() => void loadCloudDraft()} type="button">
                载入云端 v{draftConflict.revision}
              </button>
              <button className="secondaryButton" onClick={() => void saveLocalAfterConflict()} type="button">
                保留本地并保存
              </button>
            </span>
          ) : (
            <button
              className="secondaryButton"
              disabled={!codeStorageAvailable || saving}
              onClick={() => void save(false)}
              type="button"
            >
              <Save size={14} />
              {saving ? "保存中…" : "保存版本"}
            </button>
          )}
        </footer>
      </div>
      <div className="importedAlgorithmAssets">
        <header>
          <div>
            <span className="sectionKicker">CONNECTED FILES</span>
            <h4>关联资料</h4>
          </div>
          <label className="secondaryButton">
            <Upload size={14} />
            {uploading ? "上传中…" : "上传资料"}
            <input disabled={uploading} onChange={(event) => void uploadAsset(event.target.files?.[0])} type="file" />
          </label>
        </header>
        <div>
          {assets.map((asset) => (
            <a href={`/api/assets/${asset.id}/file`} key={`${asset.id}:${asset.role}`} target="_blank">
              <FileText size={15} />
              <span>
                <strong>{asset.name}</strong>
                <small>
                  {formatBytes(asset.size)} · {asset.role}
                </small>
              </span>
            </a>
          ))}
          {!assets.length ? <p>题解笔记、PDF、错误样例和参考资料会集中显示在这里。</p> : null}
        </div>
      </div>
      {versions.length ? (
        <div className="importedAlgorithmVersions">
          <header>
            <div>
              <span className="sectionKicker">VERSION HISTORY</span>
              <h4>代码版本</h4>
            </div>
            <small>最近 {versions.length} 个版本</small>
          </header>
          <div>
            {versions.slice(0, 12).map((version) => (
              <button key={version.id} onClick={() => void restoreVersion(version)} type="button">
                <strong>
                  v{version.revision} · {version.label}
                </strong>
                <small>
                  {version.deviceName || "网页"} · {formatTime(version.createdAt)}
                </small>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function isExternalUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "刚刚"
    : date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / 1024 / 1024).toFixed(1)} MiB`;
}
