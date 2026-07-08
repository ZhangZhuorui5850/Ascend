"use client";

import { ChangeEvent, DragEvent, useRef, useState } from "react";
import { ChevronRight, FileText, Folder, FolderPlus, HardDrive, Upload } from "lucide-react";

type ExplorerFolder = { name: string; path: string; assetCount: number };
type ExplorerTreeNode = ExplorerFolder & { children: ExplorerTreeNode[] };
type ExplorerFile = {
  id: number;
  original_name: string;
  mime_type: string;
  size: number;
  folder_path: string;
  created_at?: string;
};
type ExplorerState = {
  currentPath: string;
  breadcrumbs: Array<{ name: string; path: string }>;
  tree: ExplorerTreeNode[];
  folders: ExplorerFolder[];
  files: ExplorerFile[];
};

export function FileExplorer({ initialExplorer }: { initialExplorer: ExplorerState }) {
  const [explorer, setExplorer] = useState(initialExplorer);
  const [folderName, setFolderName] = useState("");
  const [draggingAssetId, setDraggingAssetId] = useState<number | null>(null);
  const [selectedFileId, setSelectedFileId] = useState<number | null>(initialExplorer.files[0]?.id ?? null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function openFolder(path: string) {
    const response = await fetch(`/api/folders?path=${encodeURIComponent(path)}`);
    if (response.ok) {
      const nextExplorer = (await response.json()) as ExplorerState;
      setExplorer(nextExplorer);
      setSelectedFileId(nextExplorer.files[0]?.id ?? null);
    }
  }

  async function createFolder() {
    const name = folderName.trim();
    if (!name) return;
    const path = [explorer.currentPath, name].filter(Boolean).join("/");
    await fetch("/api/folders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path }),
    });
    setFolderName("");
    await openFolder(explorer.currentPath);
  }

  async function moveAsset(assetId: number, folderPath: string) {
    const response = await fetch("/api/folders", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ assetId, folderPath, currentPath: explorer.currentPath }),
    });
    if (response.ok) setExplorer((await response.json()) as ExplorerState);
    setDraggingAssetId(null);
  }

  async function uploadFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    for (const file of files) {
      const formData = new FormData();
      formData.append("file", file, file.name);
      formData.append("folderPath", explorer.currentPath || "未归档");
      formData.append("category", "knowledge");
      await fetch("/api/assets", { method: "POST", body: formData });
    }
    await openFolder(explorer.currentPath);
  }

  function handleDrop(event: DragEvent<HTMLElement>, folderPath: string) {
    event.preventDefault();
    if (draggingAssetId) void moveAsset(draggingAssetId, folderPath);
  }

  const selectedFile = explorer.files.find((file) => file.id === selectedFileId) || explorer.files[0] || null;
  const currentLabel = explorer.currentPath || "根目录";

  return (
    <section className="driveExplorer" aria-label="资料库资源浏览器">
      <aside className="driveTree" aria-label="文件夹树">
        <button
          className={!explorer.currentPath ? "driveTreeRoot active" : "driveTreeRoot"}
          onClick={() => openFolder("")}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => handleDrop(event, "")}
          type="button"
        >
          <HardDrive size={17} />
          <span>资料库</span>
        </button>
        <div className="driveTreeList">
          {explorer.tree.map((node) => (
            <FolderTreeNode
              activePath={explorer.currentPath}
              key={node.path}
              node={node}
              onDropFile={handleDrop}
              onOpen={openFolder}
            />
          ))}
        </div>
      </aside>

      <div className="driveMain">
        <div className="driveToolbar">
          <div className="drivePath" aria-label="当前位置">
            <button onClick={() => openFolder("")} type="button">资料库</button>
            {explorer.breadcrumbs.map((crumb) => (
              <button key={crumb.path} onClick={() => openFolder(crumb.path)} type="button">
                <ChevronRight size={14} />
                {crumb.name}
              </button>
            ))}
          </div>
          <div className="driveActions">
            <div className="driveCreate">
              <input value={folderName} onChange={(event) => setFolderName(event.target.value)} placeholder="新建文件夹" />
              <button onClick={createFolder} type="button"><FolderPlus size={15} />新建</button>
            </div>
            <button className="secondaryButton" onClick={() => fileInputRef.current?.click()} type="button">
              <Upload size={15} />上传
            </button>
          </div>
        </div>

        <div className="driveContent">
          <div className="driveListPanel">
            <div className="driveListHeader">
              <strong>{currentLabel}</strong>
              <span>{explorer.folders.length} 个文件夹 · {explorer.files.length} 个文件</span>
            </div>
            <div className="driveTable" role="table" aria-label="当前文件夹内容">
              <div className="driveTableHead" role="row">
                <span>名称</span>
                <span>类型</span>
                <span>大小</span>
                <span>位置</span>
              </div>
              {explorer.folders.map((folder) => (
                <button
                  className="driveRow"
                  key={folder.path}
                  onClick={() => openFolder(folder.path)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => handleDrop(event, folder.path)}
                  role="row"
                  type="button"
                >
                  <span className="driveName"><Folder size={17} />{folder.name}</span>
                  <span>文件夹</span>
                  <span>{folder.assetCount} 个文件</span>
                  <span>{folder.path}</span>
                </button>
              ))}
              {explorer.files.map((file) => (
                <a
                  className={selectedFile?.id === file.id ? "driveRow active" : "driveRow"}
                  draggable
                  href={`/api/assets/${file.id}/file`}
                  key={file.id}
                  onClick={() => setSelectedFileId(file.id)}
                  onDragStart={() => setDraggingAssetId(file.id)}
                  role="row"
                  target="_blank"
                >
                  <span className="driveName"><FileText size={17} />{file.original_name}</span>
                  <span>{fileType(file)}</span>
                  <span>{formatSize(file.size)}</span>
                  <span>{file.folder_path || "未归档"}</span>
                </a>
              ))}
            </div>
            {!explorer.folders.length && !explorer.files.length ? <p className="empty">当前文件夹为空。上传文件或新建子文件夹。</p> : null}
          </div>

          <aside className="driveDetails" aria-label="选中文件详情">
            <span className="eyebrow">Details</span>
            {selectedFile ? (
              <>
                <FileText size={32} />
                <h2>{selectedFile.original_name}</h2>
                <dl>
                  <div><dt>类型</dt><dd>{selectedFile.mime_type || "file"}</dd></div>
                  <div><dt>大小</dt><dd>{formatSize(selectedFile.size)}</dd></div>
                  <div><dt>文件夹</dt><dd>{selectedFile.folder_path || "未归档"}</dd></div>
                  <div><dt>入库时间</dt><dd>{formatDate(selectedFile.created_at)}</dd></div>
                </dl>
                <a className="primaryButton" href={`/api/assets/${selectedFile.id}/file`} target="_blank">打开文件</a>
              </>
            ) : (
              <p className="empty">选择一个文件查看详情。</p>
            )}
          </aside>
        </div>
      </div>
      <input ref={fileInputRef} hidden multiple type="file" onChange={uploadFiles} />
    </section>
  );
}

function FolderTreeNode({
  activePath,
  node,
  onDropFile,
  onOpen,
}: {
  activePath: string;
  node: ExplorerTreeNode;
  onDropFile: (event: DragEvent<HTMLElement>, folderPath: string) => void;
  onOpen: (path: string) => void;
}) {
  return (
    <div className="driveTreeBranch">
      <button
        className={activePath === node.path ? "driveTreeItem active" : "driveTreeItem"}
        onClick={() => onOpen(node.path)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => onDropFile(event, node.path)}
        type="button"
      >
        <Folder size={16} />
        <span>{node.name}</span>
        <small>{node.assetCount}</small>
      </button>
      {node.children.length ? (
        <div className="driveTreeChildren">
          {node.children.map((child) => (
            <FolderTreeNode activePath={activePath} key={child.path} node={child} onDropFile={onDropFile} onOpen={onOpen} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function formatSize(size: number): string {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
}

function fileType(file: ExplorerFile): string {
  if (file.mime_type) return file.mime_type;
  const extension = file.original_name.split(".").pop();
  return extension ? `.${extension}` : "file";
}

function formatDate(value?: string): string {
  if (!value) return "未知";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}
