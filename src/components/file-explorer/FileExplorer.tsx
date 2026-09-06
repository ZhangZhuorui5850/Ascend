"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import type { AlgorithmTrainingRelations } from "@/lib/repo/algorithm-training";
import type { AlgorithmDashboard } from "@/lib/repo/algorithms";
import type { AlgorithmProblemAsset } from "@/lib/repo/algorithm-assets";
import {
  ChevronRight,
  FileCode2,
  Folder,
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
import { createAlgorithmFolderAction, deleteAlgorithmFolderAction, moveAlgorithmProblemsAction, renameAlgorithmFolderAction } from "@/app/actions/algorithms";
import type { ExplorerFile, ExplorerFolder, ExplorerState } from "@/lib/repo/library";
import type { CaptureSubject } from "@/lib/repo/knowledge";
import dynamic from "next/dynamic";

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

const AssetViewer = dynamic(
  () => import("@/components/AssetViewer").then((mod) => mod.AssetViewer),
  { loading: () => <p className="viewerLoading" role="status">正在打开预览…</p> },
);

type AlgorithmAssetsProjection = { relations: AlgorithmTrainingRelations; dashboard: AlgorithmDashboard; assetsByProblem?: Record<number, AlgorithmProblemAsset[]> };

export function FileExplorer({ explorer, hierarchy, searchQuery, searchResults, usage, algorithmData, algorithmFolderId, algorithmScope = false }: {
  explorer: ExplorerState;
  hierarchy: CaptureSubject[];
  searchQuery: string;
  searchResults: ExplorerFile[] | null;
  usage?: { usedBytes: number; quotaBytes: number };
  algorithmData?: AlgorithmAssetsProjection | null;
  algorithmFolderId?: string | null;
  algorithmScope?: boolean;
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

  if (algorithmScope && algorithmData) {
    return <AlgorithmAssetsExplorer data={algorithmData} explorer={explorer} folderId={algorithmFolderId ?? null} searchQuery={searchQuery} usage={usage} />;
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
        algorithmActive={false}
        algorithmFolderId={null}
        algorithmLibrary={algorithmData?.relations.library}
        dragRef={dragRef}
        explorer={explorer}
        isSearch={isSearch}
        onDrop={handleDropOn}
        onAlgorithmOpen={(folderId) => router.push(`/assets?scope=algorithms${folderId ? `&folder=${encodeURIComponent(folderId)}` : ""}`)}
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

function AlgorithmAssetsExplorer({ data, explorer, folderId, searchQuery, usage }: { data: AlgorithmAssetsProjection; explorer: ExplorerState; folderId: string | null; searchQuery: string; usage?: { usedBytes: number; quotaBytes: number } }) {
  const router = useRouter();
  const { confirm, notify } = useFeedback();
  const dragRef = useRef<DragPayload | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingFolder, setEditingFolder] = useState<{ id: string; name: string } | null>(null);
  const [selectedProblemId, setSelectedProblemId] = useState<number | null>(null);
  const library = data.relations.library;
  const problemById = useMemo(() => new Map(data.dashboard.problems.map((problem) => [problem.id, problem])), [data.dashboard.problems]);
  const currentFolder = library.folders.find((folder) => folder.id === folderId) ?? null;
  const query = searchQuery.trim().toLowerCase();
  const childFolders = query ? [] : library.folders.filter((folder) => folder.parentId === folderId).sort((a, b) => a.sortOrder - b.sortOrder);
  const visibleProblems = library.items
    .filter((item) => query ? true : item.folderId === folderId)
    .map((item) => ({ item, problem: problemById.get(item.problemId) }))
    .filter((entry): entry is { item: typeof entry.item; problem: NonNullable<typeof entry.problem> } => Boolean(entry.problem))
    .filter(({ problem }) => !query || `${problem.title} ${problem.externalProblemId} ${problem.tags.join(" ")} ${problem.notes}`.toLowerCase().includes(query))
    .sort((a, b) => a.item.sortOrder - b.item.sortOrder || a.item.libraryNumber - b.item.libraryNumber);
  const selectedProblem = selectedProblemId ? problemById.get(selectedProblemId) ?? null : null;
  const breadcrumbs = currentFolder ? algorithmFolderBreadcrumbs(library.folders, currentFolder.id) : [];

  const openAlgorithmFolder = (targetId: string | null) => router.push(`/assets?scope=algorithms${targetId ? `&folder=${encodeURIComponent(targetId)}` : ""}`);
  const report = (result: ActionResult, success: string) => {
    if (result.ok) {
      notify(success);
      router.refresh();
    } else notify(result.error || "操作失败", "error");
  };
  async function moveDroppedProblem(targetFolderId: string | null, event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    const payload = dragRef.current;
    dragRef.current = null;
    if (payload?.kind !== "algorithm-problem") return;
    report(await moveAlgorithmProblemsAction({ problemIds: [payload.problemId], folderId: targetFolderId }), "题目位置已更新");
  }
  async function submitFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    const result = await createAlgorithmFolderAction({ name, parentId: folderId });
    if (result.ok) { setCreating(false); setNewFolderName(""); }
    report(result, "文件夹已创建");
  }
  async function submitFolderRename(folderId: string) {
    const name = editingFolder?.name.trim() ?? "";
    if (!name) return;
    const result = await renameAlgorithmFolderAction({ folderId, name });
    if (result.ok) setEditingFolder(null);
    report(result, "文件夹已重命名");
  }

  return (
    <section className="driveExplorer algorithmDriveExplorer" aria-label="算法训练资料目录">
      <FolderTreePanel
        algorithmActive
        algorithmFolderId={folderId}
        algorithmLibrary={library}
        dragRef={dragRef}
        explorer={explorer}
        isSearch={Boolean(query)}
        onDrop={async () => {}}
        onOpen={(path) => router.push(path ? `/assets?folder=${encodeURIComponent(path)}` : "/assets")}
        onAlgorithmOpen={openAlgorithmFolder}
        usage={usage}
      />
      <div className="driveMain">
        <div className="driveToolbar">
          <div className="drivePath" aria-label="当前位置">
            <button onClick={() => router.push("/assets")} type="button">资料库</button><ChevronRight size={13} /><button onClick={() => openAlgorithmFolder(null)} type="button">算法训练</button>
            {breadcrumbs.map((folder) => <button key={folder.id} onClick={() => openAlgorithmFolder(folder.id)} type="button"><ChevronRight size={13} />{folder.name}</button>)}
          </div>
          <div className="driveActions">
            <form action="/assets" className="driveSearch" role="search"><input name="scope" type="hidden" value="algorithms" />{folderId ? <input name="folder" type="hidden" value={folderId} /> : null}<Search size={14} /><input defaultValue={searchQuery} name="q" placeholder="搜索题目、题号、标签和备注" />{searchQuery ? <Link aria-label="清除搜索" className="driveSearchClear" href={`/assets?scope=algorithms${folderId ? `&folder=${encodeURIComponent(folderId)}` : ""}`}><X size={13} /></Link> : null}</form>
            <button className="secondaryButton" onClick={() => setCreating(true)} type="button"><FolderPlus size={15} />新建文件夹</button>
            <Link className="primaryButton" href="/practice/algorithms?tab=library">打开题库工作台</Link>
          </div>
        </div>
        <div className="driveContent">
          <div className="algorithmDriveList">
            {creating ? <div className="algorithmDriveRow"><Folder size={17} /><input autoFocus placeholder="文件夹名称" value={newFolderName} onChange={(event) => setNewFolderName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void submitFolder(); if (event.key === "Escape") setCreating(false); }} /><button onClick={() => void submitFolder()} type="button">创建</button><button onClick={() => setCreating(false)} type="button">取消</button></div> : null}
            {childFolders.map((folder) => (
              <div className="algorithmDriveRow" key={folder.id} onDragOver={(event) => event.preventDefault()} onDrop={(event) => void moveDroppedProblem(folder.id, event)}>
                {editingFolder?.id === folder.id ? <div className="algorithmDriveName algorithmDriveRename"><Folder size={17} /><input autoFocus aria-label="文件夹名称" value={editingFolder.name} onChange={(event) => setEditingFolder({ id: folder.id, name: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") void submitFolderRename(folder.id); if (event.key === "Escape") setEditingFolder(null); }} /></div> : <button className="algorithmDriveName" onClick={() => openAlgorithmFolder(folder.id)} type="button"><Folder size={17} /><strong>{folder.name}</strong></button>}
                <small>{library.items.filter((item) => item.folderId === folder.id).length} 道题</small>
                {editingFolder?.id === folder.id ? <span className="algorithmDriveInlineActions"><button onClick={() => void submitFolderRename(folder.id)} type="button">保存</button><button onClick={() => setEditingFolder(null)} type="button">取消</button></span> : <button onClick={() => setEditingFolder({ id: folder.id, name: folder.name })} type="button">重命名</button>}
                <button className="iconDanger" onClick={() => void confirm({ title: `删除“${folder.name}”？`, description: "子目录和题目会提升到当前目录。", confirmLabel: "删除并提升内容", danger: true }).then((ok) => { if (ok) return deleteAlgorithmFolderAction({ folderId: folder.id, promoteContents: true }).then((result) => report(result, "文件夹已删除")); })} type="button">删除</button>
              </div>
            ))}
            {visibleProblems.map(({ item, problem }) => (
              <button className={selectedProblemId === problem.id ? "algorithmDriveRow algorithmProblemRow active" : "algorithmDriveRow algorithmProblemRow"} draggable key={problem.id} onClick={() => setSelectedProblemId(problem.id)} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; dragRef.current = { kind: "algorithm-problem", problemId: problem.id }; }} type="button">
                <FileCode2 size={17} /><strong>{problem.title}</strong><span>{problem.providerLabel} {problem.externalProblemId}</span><span>{folderPathForProblem(library.folders, item.folderId)} · {problem.tags.slice(0, 2).join(" · ")}</span><small>#{item.libraryNumber}</small>
              </button>
            ))}
            {!childFolders.length && !visibleProblems.length ? <p className="empty">当前目录为空。</p> : null}
          </div>
          <aside className="driveDetails" aria-label="题目详情">
            {selectedProblem ? <><small>{selectedProblem.providerLabel} · {selectedProblem.externalProblemId}</small><h2>{selectedProblem.title}</h2><p>{selectedProblem.notes || "暂无备注"}</p><div className="algorithmDetailTags">{selectedProblem.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>{(data.assetsByProblem?.[selectedProblem.id] ?? []).length ? <div className="algorithmLinkedAssets"><strong>关联资料</strong>{data.assetsByProblem?.[selectedProblem.id]?.map((asset) => <a href={`/api/assets/${asset.id}/file`} key={asset.id}><FileCode2 size={14} />{asset.name}<small>{asset.role}</small></a>)}</div> : null}<Link className="primaryButton" href={`/practice/algorithms?tab=library&problem=${selectedProblem.id}`}>查看完整题面</Link></> : <p className="empty">选择一道题查看详情。目录位置与算法工作台、VS Code 保持一致。</p>}
          </aside>
        </div>
      </div>
    </section>
  );
}

function algorithmFolderBreadcrumbs(folders: AlgorithmTrainingRelations["library"]["folders"], folderId: string) {
  const result: typeof folders = [];
  let current = folders.find((folder) => folder.id === folderId);
  while (current) {
    result.unshift(current);
    current = current.parentId ? folders.find((folder) => folder.id === current?.parentId) : undefined;
  }
  return result;
}

function folderPathForProblem(folders: AlgorithmTrainingRelations["library"]["folders"], folderId: string | null): string {
  return folderId ? `算法训练 / ${algorithmFolderBreadcrumbs(folders, folderId).map((folder) => folder.name).join(" / ")}` : "算法训练 / 未整理";
}
