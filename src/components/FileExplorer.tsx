"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChangeEvent, DragEvent, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  FileText,
  Folder,
  FolderInput,
  FolderPlus,
  HardDrive,
  ImageIcon,
  Loader2,
  Eye,
  Pencil,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  createFolderAction,
  deleteAssetAction,
  deleteFolderAction,
  moveAssetAction,
  moveFolderAction,
  renameAssetAction,
  renameFolderAction,
} from "@/app/actions/library";
import type { ExplorerFile, ExplorerState, ExplorerTreeNode } from "@/lib/repo/library";
import { MAX_UPLOAD_BYTES } from "@/lib/limits";
import { assetFileUrl } from "@/lib/asset-url";
import { AssetViewer, previewKind } from "@/components/AssetViewer";
import { useFeedback } from "@/components/FeedbackProvider";

type SortKey = "name" | "size" | "day";

type DragPayload = { kind: "file"; id: number } | { kind: "folder"; path: string };
type MoveTarget = { kind: "file"; id: number; name: string } | { kind: "folder"; path: string; name: string };

export function FileExplorer({ explorer, searchQuery, searchResults, usage }: {
  explorer: ExplorerState;
  searchQuery: string;
  searchResults: ExplorerFile[] | null;
  usage?: { usedBytes: number; quotaBytes: number };
}) {
  const router = useRouter();
  const { confirm, notify } = useFeedback();
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null);
  const [previewFile, setPreviewFile] = useState<ExplorerFile | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [renamingFile, setRenamingFile] = useState<number | null>(null);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [moveTarget, setMoveTarget] = useState<MoveTarget | null>(null);
  const [moveDestination, setMoveDestination] = useState("");
  const dragRef = useRef<DragPayload | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const files = searchResults ?? explorer.files;
  const isSearch = searchResults !== null;

  const sortedFiles = useMemo(() => {
    const copy = [...files];
    copy.sort((a, b) => {
      let compare = 0;
      if (sortKey === "name") compare = a.original_name.localeCompare(b.original_name, "zh-CN");
      if (sortKey === "size") compare = a.size - b.size;
      if (sortKey === "day") compare = a.day.localeCompare(b.day) || a.created_at.localeCompare(b.created_at);
      return sortAsc ? compare : -compare;
    });
    return copy;
  }, [files, sortKey, sortAsc]);

  const selectedFile = sortedFiles.find((file) => file.id === selectedFileId) || null;
  const folderOptions = useMemo(() => flattenFolders(explorer.tree), [explorer.tree]);

  function openFolder(path: string) {
    setSelectedFileId(null);
    router.push(path ? `/assets?folder=${encodeURIComponent(path)}` : "/assets");
  }

  function report(result: { ok: boolean; error?: string }) {
    setError(result.ok ? "" : result.error || "操作失败");
    if (result.ok) router.refresh();
    else notify(result.error || "操作失败", "error");
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((current) => !current);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  async function submitNewFolder() {
    const name = folderName.trim();
    if (!name) {
      setCreatingFolder(false);
      return;
    }
    const result = await createFolderAction({ parentPath: explorer.currentPath, name });
    if (result.ok) {
      setFolderName("");
      setCreatingFolder(false);
    }
    report(result);
  }

  async function handleRenameFolder(path: string, name: string) {
    setRenamingFolder(null);
    const trimmed = name.trim();
    if (!trimmed) return;
    const result = await renameFolderAction({ path, name: trimmed });
    report(result);
  }

  async function handleDeleteFolder(path: string, name: string) {
    const accepted = await confirm({ title: `删除“${name}”？`, description: "只能删除空文件夹。这个操作无法撤销。", confirmLabel: "删除文件夹", danger: true });
    if (!accepted) return;
    const result = await deleteFolderAction(path);
    report(result);
    if (result.ok) notify("文件夹已删除");
  }

  async function handleDeleteFile(file: ExplorerFile) {
    const accepted = await confirm({ title: `删除“${file.original_name}”？`, description: "文件记录会从资料库移除，关联关系也会解除。", confirmLabel: "删除文件", danger: true });
    if (!accepted) return;
    setSelectedFileId(null);
    const result = await deleteAssetAction(file.id);
    report(result);
    if (result.ok) notify("文件已从资料库移除");
  }

  async function handleRenameFile(file: ExplorerFile, name: string) {
    setRenamingFile(null);
    const trimmed = name.trim();
    if (!trimmed || trimmed === file.original_name) return;
    report(await renameAssetAction({ assetId: file.id, name: trimmed }));
  }

  async function handleDropOn(targetPath: string, event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    const payload = dragRef.current;
    dragRef.current = null;
    if (!payload) return;
    if (payload.kind === "file") {
      report(await moveAssetAction({ assetId: payload.id, folderPath: targetPath }));
    } else if (payload.path !== targetPath) {
      report(await moveFolderAction({ path: payload.path, newParentPath: targetPath }));
    }
  }

  async function submitMove() {
    if (!moveTarget) return;
    const result = moveTarget.kind === "file"
      ? await moveAssetAction({ assetId: moveTarget.id, folderPath: moveDestination })
      : await moveFolderAction({ path: moveTarget.path, newParentPath: moveDestination });
    if (result.ok) {
      setMoveTarget(null);
      setMoveDestination("");
      notify(`已移动“${moveTarget.name}”`);
    }
    report(result);
  }

  async function uploadFiles(event: ChangeEvent<HTMLInputElement>) {
    const list = Array.from(event.target.files || []);
    event.target.value = "";
    if (!list.length) return;
    setUploading(list.length);
    const failures: string[] = [];
    for (const file of list) {
      if (file.size > MAX_UPLOAD_BYTES) {
        failures.push(`${file.name}：超过 20MB 上限`);
        setUploading((current) => Math.max(0, current - 1));
        continue;
      }
      try {
        const formData = new FormData();
        formData.append("file", file, file.name);
        formData.append("folderPath", explorer.currentPath);
        const response = await fetch("/api/assets", { method: "POST", body: formData });
        if (!response.ok) {
          const text = await response.text();
          failures.push(`${file.name}：${text || "上传失败"}`);
        }
      } catch {
        failures.push(`${file.name}：网络错误`);
      }
      setUploading((current) => Math.max(0, current - 1));
    }
    if (failures.length) {
      notify(`${failures.length} 个文件上传失败：${failures[0]}${failures.length > 1 ? " 等" : ""}`, "error");
    } else if (list.length) {
      notify(`已上传 ${list.length} 个文件`);
    }
    router.refresh();
  }

  return (
    <section className="driveExplorer" aria-label="资料库资源管理器">
      <aside className="driveTree" aria-label="文件夹树">
        <button
          className={!explorer.currentPath && !isSearch ? "driveTreeRoot active" : "driveTreeRoot"}
          onClick={() => openFolder("")}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => void handleDropOn("", event)}
          type="button"
        >
          <HardDrive size={16} />
          <span>资料库</span>
          <small>{explorer.totalFiles}</small>
        </button>
        <div className="driveTreeList">
          {explorer.tree.map((node) => (
            <TreeNode
              activePath={isSearch ? " " : explorer.currentPath}
              dragRef={dragRef}
              key={node.path}
              node={node}
              onDrop={handleDropOn}
              onOpen={openFolder}
            />
          ))}
        </div>
        {usage ? <QuotaMeter quotaBytes={usage.quotaBytes} usedBytes={usage.usedBytes} /> : null}
      </aside>

      <div className="driveMain">
        <div className="driveToolbar">
          <div className="drivePath" aria-label="当前位置">
            <button onClick={() => openFolder("")} type="button">资料库</button>
            {explorer.breadcrumbs.map((crumb) => (
              <button key={crumb.path} onClick={() => openFolder(crumb.path)} type="button">
                <ChevronRight size={13} />
                {crumb.name}
              </button>
            ))}
            {isSearch ? <span className="drivePathSearch"><ChevronRight size={13} />搜索“{searchQuery}”</span> : null}
          </div>
          <div className="driveActions">
            <form action="/assets" className="driveSearch" role="search">
              <Search size={14} />
              <input defaultValue={searchQuery} key={searchQuery} name="q" placeholder="搜索文件名" />
              {searchQuery ? (
                <Link aria-label="清除搜索" className="driveSearchClear" href="/assets">
                  <X size={13} />
                </Link>
              ) : null}
            </form>
            <button className="secondaryButton" onClick={() => setCreatingFolder(true)} type="button">
              <FolderPlus size={15} />
              新建文件夹
            </button>
            <button className="primaryButton" onClick={() => fileInputRef.current?.click()} type="button">
              {uploading ? <Loader2 className="spin" size={15} /> : <Upload size={15} />}
              上传到当前目录
            </button>
          </div>
        </div>
        {error ? <p className="formError">{error}</p> : null}

        <div className="driveContent">
          <div className="driveListPanel">
            <div className="driveTable" role="table" aria-label="当前文件夹内容">
              <div className="driveTableHead" role="row">
                <button onClick={() => toggleSort("name")} type="button">
                  名称{sortKey === "name" ? (sortAsc ? " ↑" : " ↓") : ""}
                </button>
                <span>归属</span>
                <button onClick={() => toggleSort("size")} type="button">
                  大小{sortKey === "size" ? (sortAsc ? " ↑" : " ↓") : ""}
                </button>
                <button onClick={() => toggleSort("day")} type="button">
                  日期{sortKey === "day" ? (sortAsc ? " ↑" : " ↓") : ""}
                </button>
                <span aria-hidden />
              </div>

              {creatingFolder ? (
                <div className="driveRow creating" role="row">
                  <span className="driveName">
                    <Folder size={16} />
                    <input
                      autoFocus
                      onBlur={() => void submitNewFolder()}
                      onChange={(event) => setFolderName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void submitNewFolder();
                        if (event.key === "Escape") {
                          setFolderName("");
                          setCreatingFolder(false);
                        }
                      }}
                      placeholder="文件夹名称"
                      value={folderName}
                    />
                  </span>
                  <span /><span /><span /><span />
                </div>
              ) : null}

              {!isSearch
                ? explorer.folders.map((folder) => (
                    <div
                      className="driveRow"
                      draggable
                      key={folder.path}
                      onDragOver={(event) => event.preventDefault()}
                      onDragStart={() => {
                        dragRef.current = { kind: "folder", path: folder.path };
                      }}
                      onDrop={(event) => void handleDropOn(folder.path, event)}
                      role="row"
                    >
                      {renamingFolder === folder.path ? (
                        <span className="driveName">
                          <Folder size={16} />
                          <input
                            autoFocus
                            defaultValue={folder.name}
                            onBlur={(event) => void handleRenameFolder(folder.path, event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") (event.target as HTMLInputElement).blur();
                              if (event.key === "Escape") setRenamingFolder(null);
                            }}
                          />
                        </span>
                      ) : (
                        <button className="driveName asButton" onClick={() => openFolder(folder.path)} type="button">
                          <Folder size={16} />
                          {folder.name}
                        </button>
                      )}
                      <span className="driveDim">文件夹</span>
                      <span className="driveDim">{folder.fileCount} 个文件</span>
                      <span />
                      <span className="driveRowTools">
                        <button
                          aria-label={`移动文件夹 ${folder.name}`}
                          onClick={() => {
                            setMoveDestination("");
                            setMoveTarget({ kind: "folder", path: folder.path, name: folder.name });
                          }}
                          type="button"
                        >
                          <FolderInput size={14} />
                        </button>
                        <button aria-label="重命名文件夹" onClick={() => setRenamingFolder(folder.path)} type="button">
                          <Pencil size={13} />
                        </button>
                        <button
                          aria-label="删除文件夹"
                          className="iconDanger"
                          onClick={() => void handleDeleteFolder(folder.path, folder.name)}
                          type="button"
                        >
                          <Trash2 size={13} />
                        </button>
                      </span>
                    </div>
                  ))
                : null}

              {sortedFiles.map((file) => (
                <div
                  className={selectedFile?.id === file.id ? "driveRow active" : "driveRow"}
                  draggable
                  key={file.id}
                  onClick={() => setSelectedFileId(file.id)}
                  onDragStart={() => {
                    dragRef.current = { kind: "file", id: file.id };
                  }}
                  role="row"
                >
                  {renamingFile === file.id ? (
                    <span className="driveName">
                      {file.mime_type.startsWith("image/") ? <ImageIcon size={16} /> : <FileText size={16} />}
                      <input
                        autoFocus
                        defaultValue={file.original_name}
                        onBlur={(event) => void handleRenameFile(file, event.target.value)}
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") (event.target as HTMLInputElement).blur();
                          if (event.key === "Escape") setRenamingFile(null);
                        }}
                      />
                    </span>
                  ) : (
                    <button
                      aria-label={`打开 ${file.original_name}`}
                      className="driveName asButton"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (previewKind(file) !== "none") setPreviewFile(file);
                        else window.open(assetFileUrl(file.id), "_blank", "noopener");
                      }}
                      type="button"
                    >
                      {file.mime_type.startsWith("image/") ? <ImageIcon size={16} /> : <FileText size={16} />}
                      {file.original_name}
                    </button>
                  )}
                  <span className="driveDim">
                    {file.subject_code || ""}
                    {file.knowledge_titles ? ` · ${file.knowledge_titles}` : ""}
                    {isSearch && file.folder_path ? ` · ${file.folder_path}` : ""}
                  </span>
                  <span className="driveDim">{formatSize(file.size)}</span>
                  <span className="driveDim">{file.day}</span>
                  <span className="driveRowTools">
                    {previewKind(file) !== "none" ? (
                      <button aria-label={`预览 ${file.original_name}`} onClick={(event) => { event.stopPropagation(); setPreviewFile(file); }} type="button">
                        <Eye size={14} />
                      </button>
                    ) : null}
                    <button
                      aria-label={`移动 ${file.original_name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        setMoveDestination(file.folder_path || "");
                        setMoveTarget({ kind: "file", id: file.id, name: file.original_name });
                      }}
                      type="button"
                    >
                      <FolderInput size={14} />
                    </button>
                    <button
                      aria-label="重命名文件"
                      onClick={(event) => {
                        event.stopPropagation();
                        setRenamingFile(file.id);
                      }}
                      type="button"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      aria-label="删除文件"
                      className="iconDanger"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleDeleteFile(file);
                      }}
                      type="button"
                    >
                      <Trash2 size={13} />
                    </button>
                  </span>
                </div>
              ))}
            </div>

            {!sortedFiles.length && (isSearch || !explorer.folders.length) ? (
              <p className="empty">
                {isSearch ? "没有匹配的文件。" : "这个文件夹是空的。上传文件或新建子文件夹。"}
              </p>
            ) : null}
          </div>

          <aside className="driveDetails" aria-label="文件详情">
            {selectedFile ? (
              <>
                {selectedFile.mime_type.startsWith("image/") ? (
                  <button className="drivePreviewButton" onClick={() => setPreviewFile(selectedFile)} type="button">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img alt={selectedFile.original_name} className="drivePreview" src={assetFileUrl(selectedFile.id)} />
                  </button>
                ) : (
                  <FileText size={36} />
                )}
                <h2>{selectedFile.original_name}</h2>
                <dl>
                  <div><dt>类型</dt><dd>{selectedFile.mime_type || "文件"}</dd></div>
                  <div><dt>大小</dt><dd>{formatSize(selectedFile.size)}</dd></div>
                  <div><dt>位置</dt><dd>{selectedFile.folder_path || "根目录"}</dd></div>
                  <div><dt>入库日期</dt><dd>{selectedFile.day}</dd></div>
                  {selectedFile.subject_code ? <div><dt>科目</dt><dd>{selectedFile.subject_code}</dd></div> : null}
                  {selectedFile.knowledge_titles ? <div><dt>知识点</dt><dd>{selectedFile.knowledge_titles}</dd></div> : null}
                </dl>
                {previewKind(selectedFile) !== "none" ? (
                  <button className="primaryButton" onClick={() => setPreviewFile(selectedFile)} type="button">
                    预览
                  </button>
                ) : null}
                <a className="secondaryButton" href={assetFileUrl(selectedFile.id)} rel="noopener" target="_blank">
                  打开原文件
                </a>
              </>
            ) : (
              <p className="empty">选择一个文件查看详情。可使用“移动”按钮选择目标文件夹，桌面端也支持拖动。</p>
            )}
          </aside>
        </div>
      </div>
      <input hidden multiple onChange={(event) => void uploadFiles(event)} ref={fileInputRef} type="file" />
      {previewFile ? <AssetViewer file={previewFile} onClose={() => setPreviewFile(null)} /> : null}
      {moveTarget ? (
        <div className="dialogBackdrop" role="presentation">
          <section aria-labelledby="move-title" aria-modal="true" className="moveDialog" role="dialog">
            <div>
              <h2 id="move-title">移动“{moveTarget.name}”</h2>
              <p>选择目标文件夹。移动文件夹时不能选择它自身或它的子目录。</p>
            </div>
            <label className="field">
              <span>目标位置</span>
              <select onChange={(event) => setMoveDestination(event.target.value)} value={moveDestination}>
                <option value="">资料库根目录</option>
                {folderOptions.map((folder) => (
                  <option disabled={moveTarget.kind === "folder" && (folder.path === moveTarget.path || folder.path.startsWith(`${moveTarget.path}/`))} key={folder.path} value={folder.path}>
                    {`${"　".repeat(folder.depth)}${folder.name}`}
                  </option>
                ))}
              </select>
            </label>
            <footer>
              <button className="secondaryButton" onClick={() => setMoveTarget(null)} type="button">取消</button>
              <button className="primaryButton" onClick={() => void submitMove()} type="button">移动</button>
            </footer>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function flattenFolders(nodes: ExplorerTreeNode[], depth = 0): Array<{ path: string; name: string; depth: number }> {
  return nodes.flatMap((node) => [
    { path: node.path, name: node.name, depth },
    ...flattenFolders(node.children, depth + 1),
  ]);
}

function TreeNode({ node, activePath, onOpen, onDrop, dragRef }: {
  node: ExplorerTreeNode;
  activePath: string;
  onOpen: (path: string) => void;
  onDrop: (path: string, event: DragEvent<HTMLElement>) => Promise<void>;
  dragRef: React.MutableRefObject<DragPayload | null>;
}) {
  return (
    <div className="driveTreeBranch">
      <button
        className={activePath === node.path ? "driveTreeItem active" : "driveTreeItem"}
        draggable
        onClick={() => onOpen(node.path)}
        onDragOver={(event) => event.preventDefault()}
        onDragStart={(event) => {
          event.stopPropagation();
          dragRef.current = { kind: "folder", path: node.path };
        }}
        onDrop={(event) => void onDrop(node.path, event)}
        type="button"
      >
        <Folder size={15} />
        <span>{node.name}</span>
        <small>{node.fileCount || ""}</small>
      </button>
      {node.children.length ? (
        <div className="driveTreeChildren">
          {node.children.map((child) => (
            <TreeNode activePath={activePath} dragRef={dragRef} key={child.path} node={child} onDrop={onDrop} onOpen={onOpen} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function QuotaMeter({ usedBytes, quotaBytes }: { usedBytes: number; quotaBytes: number }) {
  const ratio = quotaBytes > 0 ? Math.min(1, usedBytes / quotaBytes) : 0;
  const percent = Math.round(ratio * 100);
  const tight = ratio >= 0.85;
  return (
    <div className={tight ? "quotaMeter tight" : "quotaMeter"} title={`已用 ${formatSize(usedBytes)} / ${formatSize(quotaBytes)}`}>
      <div className="quotaTrack">
        <span style={{ width: `${Math.max(2, percent)}%` }} />
      </div>
      <small>
        空间 {formatSize(usedBytes)} / {formatSize(quotaBytes)}{tight ? " · 快满了" : ""}
      </small>
    </div>
  );
}

function formatSize(size: number): string {
  if (size >= 1024 * 1024 * 1024) return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
}
