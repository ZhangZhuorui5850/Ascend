"use client";

import { useEffect } from "react";
import type { FolderOption, MoveTarget } from "@/components/file-explorer/explorer-utils";

/** “移动到…”目标文件夹选择对话框；触屏与键盘均可达（Escape / 点击遮罩关闭）。 */
export function MoveDialog({ target, destination, folderOptions, onDestinationChange, onCancel, onSubmit }: {
  target: MoveTarget;
  destination: string;
  folderOptions: FolderOption[];
  onDestinationChange: (path: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onCancel]);

  return (
    <div
      className="dialogBackdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
      role="presentation"
    >
      <section aria-labelledby="move-title" aria-modal="true" className="moveDialog" role="dialog">
        <div>
          <h2 id="move-title">移动“{target.name}”</h2>
          <p>选择目标文件夹。移动文件夹时不能选择它自身或它的子目录。</p>
        </div>
        <label className="field">
          <span>目标位置</span>
          <select onChange={(event) => onDestinationChange(event.target.value)} value={destination}>
            <option value="">资料库根目录</option>
            {folderOptions.map((folder) => (
              <option disabled={target.kind === "folder" && (folder.path === target.path || folder.path.startsWith(`${target.path}/`))} key={folder.path} value={folder.path}>
                {`${"　".repeat(folder.depth)}${folder.name}`}
              </option>
            ))}
          </select>
        </label>
        <footer>
          <button className="secondaryButton" onClick={onCancel} type="button">取消</button>
          <button className="primaryButton" onClick={onSubmit} type="button">移动</button>
        </footer>
      </section>
    </div>
  );
}
