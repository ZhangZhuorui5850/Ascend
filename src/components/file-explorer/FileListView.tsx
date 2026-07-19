"use client";

import type { DragEvent, MutableRefObject } from "react";
import { Eye, FileText, Folder, FolderInput, ImageIcon, Pencil, Trash2 } from "lucide-react";
import type { ExplorerFile, ExplorerFolder } from "@/lib/repo/library";
import { assetFileUrl } from "@/lib/asset-url";
import { previewKind } from "@/components/AssetViewer";
import type { DragPayload, SortKey } from "@/components/file-explorer/explorer-utils";
import { formatSize } from "@/components/file-explorer/explorer-utils";

/** 中间列表/网格视图：表头排序、新建文件夹行、文件夹行、文件行。状态与写操作全部由壳组件持有。 */
export function FileListView({
  viewMode,
  isSearch,
  folders,
  files,
  sortKey,
  sortAsc,
  onToggleSort,
  creatingFolder,
  folderName,
  onFolderNameChange,
  onSubmitNewFolder,
  onCancelNewFolder,
  renamingFolder,
  onStartRenameFolder,
  onCancelRenameFolder,
  onSubmitRenameFolder,
  renamingFile,
  onStartRenameFile,
  onCancelRenameFile,
  onSubmitRenameFile,
  selectedFileId,
  onSelectFile,
  selectedIds,
  onToggleSelected,
  onOpenFolder,
  onPreview,
  onMoveFolder,
  onMoveFile,
  onDeleteFolder,
  onDeleteFile,
  dragRef,
  onDropOn,
}: {
  viewMode: "list" | "grid";
  isSearch: boolean;
  folders: ExplorerFolder[];
  files: ExplorerFile[];
  sortKey: SortKey;
  sortAsc: boolean;
  onToggleSort: (key: SortKey) => void;
  creatingFolder: boolean;
  folderName: string;
  onFolderNameChange: (value: string) => void;
  onSubmitNewFolder: () => void;
  onCancelNewFolder: () => void;
  renamingFolder: string | null;
  onStartRenameFolder: (path: string) => void;
  onCancelRenameFolder: () => void;
  onSubmitRenameFolder: (path: string, name: string) => void;
  renamingFile: number | null;
  onStartRenameFile: (id: number) => void;
  onCancelRenameFile: () => void;
  onSubmitRenameFile: (file: ExplorerFile, name: string) => void;
  selectedFileId: number | null;
  onSelectFile: (id: number) => void;
  selectedIds: Set<number>;
  onToggleSelected: (id: number) => void;
  onOpenFolder: (path: string) => void;
  onPreview: (file: ExplorerFile) => void;
  onMoveFolder: (folder: ExplorerFolder) => void;
  onMoveFile: (file: ExplorerFile) => void;
  onDeleteFolder: (path: string, name: string) => void;
  onDeleteFile: (file: ExplorerFile) => void;
  dragRef: MutableRefObject<DragPayload | null>;
  onDropOn: (path: string, event: DragEvent<HTMLElement>) => Promise<void>;
}) {
  return (
    <div className="driveListPanel">
      <div className={viewMode === "grid" ? "driveTable gridMode" : "driveTable"} role="table" aria-label="当前文件夹内容">
        <div className="driveTableHead" role="row">
          <button onClick={() => onToggleSort("name")} type="button">
            名称{sortKey === "name" ? (sortAsc ? " ↑" : " ↓") : ""}
          </button>
          <span>归属</span>
          <button onClick={() => onToggleSort("size")} type="button">
            大小{sortKey === "size" ? (sortAsc ? " ↑" : " ↓") : ""}
          </button>
          <button onClick={() => onToggleSort("day")} type="button">
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
                onBlur={() => onSubmitNewFolder()}
                onChange={(event) => onFolderNameChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onSubmitNewFolder();
                  if (event.key === "Escape") onCancelNewFolder();
                }}
                placeholder="文件夹名称"
                value={folderName}
              />
            </span>
            <span /><span /><span /><span />
          </div>
        ) : null}

        {!isSearch
          ? folders.map((folder) => (
              <div
                className="driveRow"
                draggable
                key={folder.path}
                onDragOver={(event) => event.preventDefault()}
                onDragStart={() => {
                  dragRef.current = { kind: "folder", path: folder.path };
                }}
                onDrop={(event) => void onDropOn(folder.path, event)}
                role="row"
              >
                {renamingFolder === folder.path ? (
                  <span className="driveName">
                    <Folder size={16} />
                    <input
                      autoFocus
                      defaultValue={folder.name}
                      onBlur={(event) => onSubmitRenameFolder(folder.path, event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") (event.target as HTMLInputElement).blur();
                        if (event.key === "Escape") onCancelRenameFolder();
                      }}
                    />
                  </span>
                ) : (
                  <button className="driveName asButton" onClick={() => onOpenFolder(folder.path)} type="button">
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
                    onClick={() => onMoveFolder(folder)}
                    type="button"
                  >
                    <FolderInput size={14} />
                  </button>
                  <button aria-label="重命名文件夹" onClick={() => onStartRenameFolder(folder.path)} type="button">
                    <Pencil size={13} />
                  </button>
                  <button
                    aria-label="删除文件夹"
                    className="iconDanger"
                    onClick={() => onDeleteFolder(folder.path, folder.name)}
                    type="button"
                  >
                    <Trash2 size={13} />
                  </button>
                </span>
              </div>
            ))
          : null}

        {files.map((file) => (
          <div
            className={`${selectedFileId === file.id ? "driveRow active" : "driveRow"}${selectedIds.has(file.id) ? " selected" : ""}`}
            draggable
            key={file.id}
            onClick={() => onSelectFile(file.id)}
            onDragStart={() => {
              dragRef.current = { kind: "file", id: file.id };
            }}
            role="row"
          >
            {renamingFile === file.id ? (
              <span className="driveName">
                <input aria-label={`选择 ${file.original_name}`} checked={selectedIds.has(file.id)} onChange={() => onToggleSelected(file.id)} onClick={(event) => event.stopPropagation()} type="checkbox" />
                {file.mime_type.startsWith("image/") ? <ImageIcon size={16} /> : <FileText size={16} />}
                <input
                  autoFocus
                  defaultValue={file.original_name}
                  onBlur={(event) => onSubmitRenameFile(file, event.target.value)}
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") (event.target as HTMLInputElement).blur();
                    if (event.key === "Escape") onCancelRenameFile();
                  }}
                />
              </span>
            ) : (
              <button
                aria-label={`打开 ${file.original_name}`}
                className="driveName asButton"
                onClick={(event) => {
                  event.stopPropagation();
                  if (previewKind(file) !== "none") onPreview(file);
                  else window.open(assetFileUrl(file.id), "_blank", "noopener");
                }}
                type="button"
              >
                <input aria-label={`选择 ${file.original_name}`} checked={selectedIds.has(file.id)} onChange={() => onToggleSelected(file.id)} onClick={(event) => event.stopPropagation()} type="checkbox" />
                {viewMode === "grid" && file.mime_type.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt="" src={assetFileUrl(file.id)} />
                ) : file.mime_type.startsWith("image/") ? <ImageIcon size={16} /> : <FileText size={16} />}
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
                <button aria-label={`预览 ${file.original_name}`} onClick={(event) => { event.stopPropagation(); onPreview(file); }} type="button">
                  <Eye size={14} />
                </button>
              ) : null}
              <button
                aria-label={`移动 ${file.original_name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onMoveFile(file);
                }}
                type="button"
              >
                <FolderInput size={14} />
              </button>
              <button
                aria-label="重命名文件"
                onClick={(event) => {
                  event.stopPropagation();
                  onStartRenameFile(file.id);
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
                  onDeleteFile(file);
                }}
                type="button"
              >
                <Trash2 size={13} />
              </button>
            </span>
          </div>
        ))}
      </div>

      {!files.length && (isSearch || !folders.length) ? (
        <p className="empty">
          {isSearch ? "没有匹配的文件。" : "这个文件夹是空的。上传文件或新建子文件夹。"}
        </p>
      ) : null}
    </div>
  );
}
