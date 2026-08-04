"use client";

import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  Code2,
  FlaskConical,
  Puzzle,
  ShieldCheck,
} from "lucide-react";
import { startTransition, useState } from "react";
import {
  requestAlgorithmPilotAction,
  savePluginOrderAction,
  setPluginEnabledAction,
} from "@/app/actions/plugins";
import { useFeedback } from "@/components/FeedbackProvider";
import type { AlgorithmPilotEnrollment } from "@/lib/repo/algorithm-pilot";
import type { WorkspacePlugin } from "@/lib/repo/plugins";

const PERMISSION_LABELS: Record<string, string> = {
  "core.tasks.write": "创建训练任务",
  "core.study-events.write": "记录学习活动",
  "core.analytics.contribute": "贡献学习指标",
  "plugin.algorithms.data": "保存算法训练数据",
  "provider.network": "访问外部题目链接",
};

export function ExtensionsManager({
  initial,
  compact = false,
  routePrefix = "",
}: {
  initial: WorkspacePlugin[];
  compact?: boolean;
  routePrefix?: string;
}) {
  const { notify } = useFeedback();
  const [plugins, setPlugins] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);

  function toggle(pluginId: string) {
    if (busyId) return;
    const previous = plugins;
    const target = plugins.find((plugin) => plugin.manifest.id === pluginId);
    if (!target) return;
    const enabled = !target.enabled;
    setPlugins((current) => current.map((plugin) => (
      plugin.manifest.id === pluginId
        ? { ...plugin, enabled, state: enabled ? "enabled" : "disabled" }
        : plugin
    )));
    setBusyId(pluginId);
    startTransition(async () => {
      const result = await setPluginEnabledAction({ pluginId, enabled });
      setBusyId(null);
      if (!result.ok) {
        setPlugins(previous);
        notify(result.error || "扩展设置保存失败", "error");
        return;
      }
      notify(enabled ? "扩展已启用" : "扩展已停用，数据仍保留", "success");
    });
  }

  function move(pluginId: string, delta: -1 | 1) {
    if (busyId) return;
    const index = plugins.findIndex((plugin) => plugin.manifest.id === pluginId);
    const targetIndex = index + delta;
    if (index < 0 || targetIndex < 0 || targetIndex >= plugins.length) return;
    const previous = plugins;
    const next = [...plugins];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    setPlugins(next);
    setBusyId(pluginId);
    startTransition(async () => {
      const result = await savePluginOrderAction({
        pluginIds: next.map((plugin) => plugin.manifest.id),
      });
      setBusyId(null);
      if (!result.ok) {
        setPlugins(previous);
        notify(result.error || "扩展排序保存失败", "error");
      }
    });
  }

  return (
    <div className={compact ? "extensionsManager compact" : "extensionsManager"}>
      <div className="extensionsTrustNote">
        <ShieldCheck size={18} />
        <div>
          <strong>仅支持受信任内置扩展</strong>
          <p>启用只会开放经过仓库审查的功能，不会安装第三方脚本。停用后入口与操作关闭，已有数据保留。</p>
        </div>
      </div>
      <div className="extensionsGrid">
        {plugins.map((plugin, index) => {
          const Icon = plugin.manifest.icon === "code-2" ? Code2 : Puzzle;
          return (
            <article className={plugin.enabled ? "extensionCard enabled" : "extensionCard"} key={plugin.manifest.id}>
              <header>
                <span className="extensionIcon"><Icon size={21} /></span>
                <div>
                  <span className="extensionState">{plugin.enabled ? "已启用" : "可用扩展"}</span>
                  <h3>{plugin.manifest.name}</h3>
                </div>
                <label className="settingsModuleSwitch">
                  <input
                    aria-label={`${plugin.enabled ? "停用" : "启用"}${plugin.manifest.name}`}
                    checked={plugin.enabled}
                    disabled={busyId !== null}
                    onChange={() => toggle(plugin.manifest.id)}
                    type="checkbox"
                  />
                  <span />
                </label>
              </header>
              <p>{plugin.manifest.description}</p>
              <div className="extensionPermissions">
                {plugin.manifest.permissions.map((permission) => (
                  <span key={permission}>{PERMISSION_LABELS[permission] || permission}</span>
                ))}
              </div>
              {plugin.manifest.id === "algorithms" && plugin.enabled ? (
                <AlgorithmPilotRequest initial={plugin.pilotEnrollment} />
              ) : null}
              <footer>
                <div className="extensionOrder">
                  <button
                    aria-label={`上移${plugin.manifest.name}`}
                    disabled={busyId !== null || index === 0}
                    onClick={() => move(plugin.manifest.id, -1)}
                    type="button"
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    aria-label={`下移${plugin.manifest.name}`}
                    disabled={busyId !== null || index === plugins.length - 1}
                    onClick={() => move(plugin.manifest.id, 1)}
                    type="button"
                  >
                    <ArrowDown size={14} />
                  </button>
                </div>
                {plugin.enabled ? (
                  <Link href={`${routePrefix}${plugin.manifest.route}`}>
                    打开扩展 <ArrowRight size={14} />
                  </Link>
                ) : (
                  <small>启用后加入导航</small>
                )}
              </footer>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function AlgorithmPilotRequest({
  initial,
}: {
  initial?: AlgorithmPilotEnrollment;
}) {
  const { notify } = useFeedback();
  const [enrollment, setEnrollment] = useState<AlgorithmPilotEnrollment>(initial || {
    status: "not_requested",
    consentVersion: null,
    consentedAt: null,
    requestedAt: null,
    approvedAt: null,
    pausedAt: null,
    cohort: null,
  });
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState(false);
  const canRequest = enrollment.status === "not_requested" || enrollment.status === "paused";

  function requestPilot(): void {
    if (!consent || pending || !canRequest) return;
    setPending(true);
    startTransition(async () => {
      const result = await requestAlgorithmPilotAction({ consent });
      setPending(false);
      if (!result.ok || !result.enrollment) {
        notify(result.error || "试点申请失败", "error");
        return;
      }
      setEnrollment(result.enrollment);
      setConsent(false);
      notify("试点申请已提交，需管理员批准后才能在线评测", "success");
    });
  }

  return (
    <section className="algorithmPilotRequest" data-status={enrollment.status}>
      <header>
        <FlaskConical size={16} />
        <div>
          <strong>隔离 Judge 小规模试点</strong>
          <span>{pilotStatusLabel(enrollment.status)}</span>
        </div>
        {enrollment.status === "approved" ? <CheckCircle2 size={17} /> : null}
      </header>
      {canRequest ? (
        <>
          <label>
            <input
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              type="checkbox"
            />
            <span>
              我理解代码会发送到独立 Judge；学习证据会保留，代码密文按管理员设置擦除。
              试点可能因安全或稳定性原因暂停。
            </span>
          </label>
          <button
            className="secondaryButton"
            disabled={!consent || pending}
            onClick={requestPilot}
            type="button"
          >
            {pending ? "提交中…" : enrollment.status === "paused" ? "重新申请试点" : "申请加入试点"}
          </button>
        </>
      ) : (
        <p>
          {enrollment.status === "requested"
            ? "申请已记录。批准前仍可浏览题目、使用提示和保存草稿。"
            : `已获批${enrollment.cohort ? ` · ${enrollment.cohort}` : ""}。管理员可在异常时暂停在线评测。`}
        </p>
      )}
    </section>
  );
}

function pilotStatusLabel(status: AlgorithmPilotEnrollment["status"]): string {
  if (status === "requested") return "等待管理员批准";
  if (status === "approved") return "已批准";
  if (status === "paused") return "已暂停";
  return "尚未申请";
}
