"use client";

import { startTransition, useState } from "react";
import { CheckCircle2, Laptop, ShieldCheck } from "lucide-react";
import { approveAlgorithmDevicePairingAction } from "@/app/actions/algorithms";
import type { AlgorithmDevicePairing } from "@/lib/repo/algorithm-device-pairings";

export function AlgorithmDevicePairingApproval({ pairing }: { pairing: AlgorithmDevicePairing }) {
  const [state, setState] = useState(pairing.status);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function approve() {
    if (busy || state !== "pending") return;
    setBusy(true);
    setError("");
    startTransition(async () => {
      const result = await approveAlgorithmDevicePairingAction({ userCode: pairing.userCode });
      setBusy(false);
      if (!result.ok) {
        setError(result.error || "设备授权失败");
        return;
      }
      setState("approved");
    });
  }

  return (
    <section className="algorithmPairingCard card" data-status={state}>
      <header>
        <span className="algorithmPairingIcon">
          <Laptop size={24} />
        </span>
        <div>
          <span className="sectionKicker">VS CODE DEVICE PAIRING</span>
          <h1>连接 Ascend Practice</h1>
          <p>确认这台 VS Code 可以访问当前工作区的算法题、草稿和训练记录。</p>
        </div>
      </header>
      <dl>
        <div>
          <dt>设备</dt>
          <dd>{pairing.deviceName}</dd>
        </div>
        <div>
          <dt>运行环境</dt>
          <dd>{pairing.environment || pairing.platform || "VS Code"}</dd>
        </div>
        <div>
          <dt>配对码</dt>
          <dd className="algorithmPairingCode">{pairing.userCode}</dd>
        </div>
      </dl>
      <div className="algorithmPairingPermission">
        <ShieldCheck size={18} />
        <span>权限范围：读取算法题、同步代码草稿、写入训练结果。设备可在算法工作台随时撤销。</span>
      </div>
      {state === "pending" ? (
        <button className="primaryButton" disabled={busy} onClick={approve} type="button">
          <ShieldCheck size={16} />
          {busy ? "授权中…" : "允许此设备"}
        </button>
      ) : state === "approved" || state === "consumed" ? (
        <div className="algorithmPairingSuccess">
          <CheckCircle2 size={20} />
          <div>
            <strong>设备已授权</strong>
            <span>返回 VS Code，连接会自动完成。</span>
          </div>
        </div>
      ) : (
        <p className="algorithmPairingExpired">配对码已过期，请从 VS Code 重新发起连接。</p>
      )}
      {error ? (
        <p className="formError" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
