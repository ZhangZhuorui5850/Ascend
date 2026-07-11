"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Check, LogOut, Plus, Settings } from "lucide-react";
import { logout, logoutAll, switchAccountAction } from "@/app/actions/auth";
import { useFeedback } from "@/components/FeedbackProvider";
import { UserAvatar } from "@/components/UserAvatar";
import type { DeviceAccount } from "@/lib/auth";

export function AccountMenu({ current, accounts }: { current: DeviceAccount; accounts: DeviceAccount[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const { notify } = useFeedback();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function switchTo(account: DeviceAccount) {
    startTransition(async () => {
      const result = await switchAccountAction(account.userId);
      // 成功时 action 内部 redirect，这里只会拿到失败结果
      if (result && !result.ok) notify(result.error || "切换失败，请重新登录该账号", "error");
    });
  }

  const others = accounts.filter((account) => account.userId !== current.userId);

  return (
    <div className="accountMenu" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`账户菜单，当前 ${current.displayName}`}
        className="accountMenuTrigger"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <UserAvatar avatar={current} size={36} />
      </button>
      {open ? (
        <div className="accountMenuSheet" role="menu">
          <div className="accountMenuCurrent">
            <UserAvatar avatar={current} size={40} />
            <div className="accountMenuIdentity">
              <strong>{current.displayName}</strong>
              <small>{current.email}</small>
            </div>
            <Check size={15} className="accountMenuCheck" />
          </div>
          {others.length ? (
            <div className="accountMenuList" aria-label="切换账号">
              <span className="accountMenuLabel">切换账号</span>
              {others.map((account) => (
                <button disabled={pending} key={account.userId} onClick={() => switchTo(account)} role="menuitem" type="button">
                  <UserAvatar avatar={account} size={30} />
                  <span className="accountMenuIdentity">
                    <strong>{account.displayName}</strong>
                    <small>{account.email}</small>
                  </span>
                </button>
              ))}
            </div>
          ) : null}
          <div className="accountMenuActions">
            <Link href="/login" onClick={() => setOpen(false)} role="menuitem">
              <Plus size={15} />
              添加账号
            </Link>
            {current.role === "user" ? (
              <Link href="/settings" onClick={() => setOpen(false)} role="menuitem">
                <Settings size={15} />
                设置
              </Link>
            ) : null}
            <form action={logout}>
              <button role="menuitem" type="submit">
                <LogOut size={15} />
                退出当前账号
              </button>
            </form>
            {others.length ? (
              <form action={logoutAll}>
                <button className="isDanger" role="menuitem" type="submit">
                  <LogOut size={15} />
                  退出全部账号
                </button>
              </form>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
