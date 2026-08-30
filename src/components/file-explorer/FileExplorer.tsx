"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import type { AlgorithmTrainingTree } from "@/lib/repo/algorithm-training";
import {
  ChevronRight,
  FolderInput,
  FolderPlus,
  Grid3X3,
  Loader2,
  List,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  createFolderAction,
  deleteAssetAction,
  deleteAssetsAction,
  deleteFolderAction,
  moveAssetAction,
  moveAssetsAction,
  moveFolderAction,
  renameAssetAction,
  renameFolderAction,
} from "@/app/actions/library";
import { setAlgorithmCurriculumChapterAction } from "@/app/actions/algorithms";
import type { ExplorerFile, ExplorerFolder, ExplorerState } from "@/lib/repo/library";
import type { CaptureSubject } from "@/lib/repo/knowledge";
import { AssetViewer } from "@/components/AssetViewer";
import { useFeedback } from "@/components/FeedbackProvider";
import { FolderTreePanel } from "@/components/file-explorer/FolderTree";
import { FileListView } from "@/components/file-explorer/FileListView";
import { FileDetails } from "@/components/file-explorer/DetailsPanel";
import { MoveDialog } from "@/components/file-explorer/MoveDialog";
import { useAssetUpload } from "@/components/file-explorer/useAssetUpload";
import { useExplorerSelection } from "@/components/file-explorer/useExplorerSelection";
import { useNarrowScreen } from "@/components/file-explorer/useNarrowScreen";
import {
  type ActionResult,
  type DragPayload,
  type MoveTarget,
  type SortKey,
  flattenFolders,
  sortFiles,
} from "@/components/file-explorer/explorer-utils";

export function FileExplorer({ explorer, hierarchy, searchQuery, searchResults, usage, algorithmTree }: {
  explorer: ExplorerState;
  hierarchy: CaptureSubject[];
  searchQuery: string;
  searchResults: ExplorerFile[] | null;
  usage?: { usedBytes: number; quotaBytes: number };
  algorithmTree?: AlgorithmTrainingTree | null;
}) {
  const router = useRouter();
  const { confirm, notify } = useFeedback();
  const { selectedFileId, setSelectedFileId, selectedIds, setSelectedIds, toggleSelected } = useExplorerSelection();
  const [previewFile, setPreviewFile] = useState<ExplorerFile | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [renamingFile, setRenamingFile] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [dropActive, setDropActive] = useState(false);
  const [error, setError] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [moveTarget, setMoveTarget] = useState<MoveTarget | null>(null);
  const [moveDestination, setMoveDestination] = useState("");
  const dragRef = useRef<DragPayload | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const narrow = useNarrowScreen();

  const { uploading, uploaded, uploadFileList } = useAssetUpload({
    folderPath: explorer.currentPath,
    notify,
    onUploaded: () => router.refresh(),
  });

  const files = searchResults ?? explorer.files;
  const isSearch = searchResults !== null;

  const sortedFiles = useMemo(() => sortFiles(files, sortKey, sortAsc), [files, sortKey, sortAsc]);

  const selectedFile = sortedFiles.find((file) => file.id === selectedFileId) || null;
  const folderOptions = useMemo(() => flattenFolders(explorer.tree), [explorer.tree]);
  const detailSheetOpen = narrow && selectedFile !== null;

  useEffect(() => {
    if (!detailSheetOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedFileId(null);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [detailSheetOpen, setSelectedFileId]);

  function openFolder(path: string) {
    setSelectedFileId(null);
    router.push(path ? `/assets?folder=${encodeURIComponent(path)}` : "/assets");
  }

  function openFilePage(page: number) {
    setSelectedFileId(null);
    const params = new URLSearchParams();
    if (explorer.currentPath) params.set("folder", explorer.currentPath);
    if (page > 1) params.set("page", String(page));
    router.push(params.size ? `/assets?${params}` : "/assets");
  }

  function report(result: ActionResult) {
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
    } else if (payload.kind === "folder" && payload.path !== targetPath) {
      report(await moveFolderAction({ path: payload.path, newParentPath: targetPath }));
    }
  }

  async function handleAlgorithmProblemDrop(chapterKey: string, event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    const payload = dragRef.current;
    dragRef.current = null;
    if (payload?.kind !== "algorithm-problem") return;
    const result = await setAlgorithmCurriculumChapterAction({
      problemIds: [payload.problemId],
      chapterKey,
    });
    if (result.ok) notify("课程章节已同步");
    report(result);
  }

  function openMoveFile(file: ExplorerFile) {
    setMoveDestination(file.folder_path || "");
    setMoveTarget({ kind: "file", id: file.id, name: file.original_name });
  }

  function openMoveFolder(folder: ExplorerFolder) {
    setMoveDestination("");
    setMoveTarget({ kind: "folder", path: folder.path, name: folder.name });
  }

  async function submitMove() {
    if (!moveTarget) return;
    const result = moveTarget.kind === "file"
      ? await moveAssetAction({ assetId: moveTarget.id, folderPath: moveDestination })
      : moveTarget.kind === "batch"
        ? await moveAssetsAction({ assetIds: moveTarget.ids, folderPath: moveDestination })
        : await moveFolderAction({ path: moveTarget.path, newParentPath: moveDestination });
    if (result.ok) {
      setMoveTarget(null);
      setMoveDestination("");
      if (moveTarget.kind === "batch") setSelectedIds(new Set());
      notify(`已移动“${moveTarget.name}”`);
    }
    report(result);
  }

  async function uploadFiles(event: ChangeEvent<HTMLInputElement>) {
    const list = Array.from(event.target.files || []);
    event.target.value = "";
    await uploadFileList(list);
  }

  async function handleBatchDelete() {
    const ids = [...selectedIds];
    if (!ids.length) return;
    const accepted = await confirm({ title: `删除 ${ids.length} 个文件？`, description: "关联关系会同步解除。", confirmLabel: "批量删除", danger: true });
    if (!accepted) return;
    const result = await deleteAssetsAction(ids);
    if (result.ok) setSelectedIds(new Set());
    report(result);
  }

  return (
    <section
      className={dropActive ? "driveExplorer dropActive" : "driveExplorer"}
      aria-label="资料库资源管理器"
      onDragEnter={(event) => { if (event.dataTransfer.types.includes("Files")) setDropActive(true); }}
      onDragLeave={(event) => { if (event.currentTarget === event.target) setDropActive(false); }}
      onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }}
      onDrop={(event) => {
        if (!event.dataTransfer.files.length) return;
        event.preventDefault();
        setDropActive(false);
        void uploadFileList(Array.from(event.dataTransfer.files));
      }}
    >
      <FolderTreePanel
        algorithmTree={algorithmTree}
        dragRef={dragRef}
        explorer={explorer}
        isSearch={isSearch}
        onDrop={handleDropOn}
        onAlgorithmProblemDrop={handleAlgorithmProblemDrop}
        onOpen={openFolder}
        usage={usage}
      />

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
              <input defaultValue={searchQuery} key={searchQuery} name="q" placeholder="搜索名称、备注、科目、知识点" />
              {searchQuery ? (
                <Link aria-label="清除搜索" className="driveSearchClear" href="/assets">
                  <X size={13} />
                </Link>
              ) : null}
            </form>
            <div className="driveViewSwitch" aria-label="文件视图">
              <button aria-label="列表视图" className={viewMode === "list" ? "active" : ""} onClick={() => setViewMode("list")} type="button"><List size={15} /></button>
              <button aria-label="网格视图" className={viewMode === "grid" ? "active" : ""} onClick={() => setViewMode("grid")} type="button"><Grid3X3 size={15} /></button>
            </div>
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
        {uploaded || uploading ? <div className="uploadProgress"><span style={{ transform: `scaleX(${uploaded / Math.max(1, uploaded + uploading)})` }} /><b>{uploading ? `正在并发上传 · 已完成 ${uploaded}` : `上传完成 · ${uploaded} 个文件`}</b></div> : null}
        {selectedIds.size ? (
          <div className="driveBatchBar" role="toolbar" aria-label="批量操作">
            <strong>已选 {selectedIds.size} 个文件</strong>
            <button className="driveBatchPrimary" onClick={() => { setMoveDestination(explorer.currentPath); setMoveTarget({ kind: "batch", ids: [...selectedIds], name: `${selectedIds.size} 个文件` }); }} type="button"><FolderInput size={14} />移动到…</button>
            <button className="iconDanger" onClick={() => void handleBatchDelete()} type="button"><Trash2 size={14} />删除</button>
            <button aria-label="取消选择" className="driveBatchDismiss" onClick={() => setSelectedIds(new Set())} title="取消选择" type="button"><X size={15} /></button>
          </div>
        ) : null}

        <div className="driveContent">
          <FileListView
            creatingFolder={creatingFolder}
            dragRef={dragRef}
            files={sortedFiles}
            folderName={folderName}
            folders={explorer.folders}
            isSearch={isSearch}
            onFilePageChange={openFilePage}
            onCancelNewFolder={() => { setFolderName(""); setCreatingFolder(false); }}
            onCancelRenameFile={() => setRenamingFile(null)}
            onCancelRenameFolder={() => setRenamingFolder(null)}
            onDeleteFile={(file) => void handleDeleteFile(file)}
            onDeleteFolder={(path, name) => void handleDeleteFolder(path, name)}
            onDropOn={handleDropOn}
            onFolderNameChange={setFolderName}
            onMoveFile={openMoveFile}
            onMoveFolder={openMoveFolder}
            onOpenFolder={openFolder}
            onPreview={setPreviewFile}
            onSelectFile={setSelectedFileId}
            onStartRenameFile={setRenamingFile}
            onStartRenameFolder={setRenamingFolder}
            onSubmitNewFolder={() => void submitNewFolder()}
            onSubmitRenameFile={(file, name) => void handleRenameFile(file, name)}
            onSubmitRenameFolder={(path, name) => void handleRenameFolder(path, name)}
            onToggleSelected={toggleSelected}
            onToggleSort={toggleSort}
            renamingFile={renamingFile}
            renamingFolder={renamingFolder}
            selectedFileId={selectedFile?.id ?? null}
            selectedIds={selectedIds}
            sortAsc={sortAsc}
            sortKey={sortKey}
            pagination={isSearch ? null : {
              page: explorer.filePage,
              pageCount: explorer.filePageCount,
              pageSize: explorer.filePageSize,
              total: explorer.currentFolderFileCount,
            }}
            viewMode={viewMode}
          />

          <aside className="driveDetails" aria-label="文件详情">
            {selectedFile ? (
              <FileDetails file={selectedFile} hierarchy={hierarchy} onPreview={setPreviewFile} onSaved={report} />
            ) : (
              <p className="empty">选择一个文件查看详情。可使用“移动”按钮选择目标文件夹，桌面端也支持拖动。</p>
            )}
          </aside>
        </div>
      </div>
      <input hidden multiple onChange={(event) => void uploadFiles(event)} ref={fileInputRef} type="file" />
      {previewFile ? <AssetViewer file={previewFile} onClose={() => setPreviewFile(null)} /> : null}
      {detailSheetOpen && selectedFile ? (
        <div
          className="driveSheetBackdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) setSelectedFileId(null);
          }}
          role="presentation"
        >
          <section aria-label="文件详情" aria-modal="true" className="driveDetailSheet" role="dialog">
            <header className="driveSheetGrip">
              <span aria-hidden />
              <button aria-label="关闭详情" onClick={() => setSelectedFileId(null)} type="button">
                <X size={17} />
              </button>
            </header>
            <div className="driveSheetBody">
              <FileDetails file={selectedFile} hierarchy={hierarchy} onPreview={setPreviewFile} onSaved={report} />
            </div>
          </section>
        </div>
      ) : null}
      {moveTarget ? (
        <MoveDialog
          destination={moveDestination}
          folderOptions={folderOptions}
          onCancel={() => setMoveTarget(null)}
          onDestinationChange={setMoveDestination}
          onSubmit={() => void submitMove()}
          target={moveTarget}
        />
      ) : null}
    </section>
  );
}
