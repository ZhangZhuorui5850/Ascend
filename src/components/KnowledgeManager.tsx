"use client";

import { useState } from "react";
import { BookOpen, FolderTree, Plus, Tags, Trash2 } from "lucide-react";
import { summarizeKnowledgeStructure } from "@/lib/knowledge-structure";

type KnowledgeTag = { id: string; name: string };
type Chapter = { id: string; title: string; knowledgeTags: KnowledgeTag[] };
type Subject = { code: string; name: string; chapters: Chapter[] };

export function KnowledgeManager({ initialSubjects }: { initialSubjects: Subject[] }) {
  const [subjects, setSubjects] = useState(initialSubjects);
  const [subjectCode, setSubjectCode] = useState(initialSubjects[0]?.code || "");
  const [newSubjectCode, setNewSubjectCode] = useState("");
  const [newSubjectName, setNewSubjectName] = useState("");
  const [chapterTitle, setChapterTitle] = useState("");
  const [tagNameByChapter, setTagNameByChapter] = useState<Record<string, string>>({});

  async function refresh() {
    const response = await fetch("/api/knowledge/hierarchy");
    if (response.ok) setSubjects((await response.json()) as Subject[]);
  }

  const activeSubjectCode = subjects.some((subject) => subject.code === subjectCode) ? subjectCode : subjects[0]?.code || "";

  async function addChapter() {
    if (!activeSubjectCode || !chapterTitle.trim()) return;
    await fetch("/api/knowledge/chapters", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subjectCode: activeSubjectCode, title: chapterTitle.trim() }),
    });
    setChapterTitle("");
    await refresh();
  }

  async function addSubject() {
    if (!newSubjectCode.trim() || !newSubjectName.trim()) return;
    await fetch("/api/knowledge/subjects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: newSubjectCode.trim(), name: newSubjectName.trim(), description: "" }),
    });
    setSubjectCode(newSubjectCode.trim());
    setNewSubjectCode("");
    setNewSubjectName("");
    await refresh();
  }

  async function renameSubject(code: string, name: string) {
    const subject = subjects.find((item) => item.code === code);
    const nextName = name.trim();
    if (!subject || !nextName) return;
    await fetch("/api/knowledge/subjects", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, name: nextName, description: "" }),
    });
    await refresh();
  }

  async function deleteSubject(code: string) {
    await fetch("/api/knowledge/subjects", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    await refresh();
  }

  async function renameChapter(id: string, title: string) {
    const nextTitle = title.trim();
    if (!nextTitle) return;
    await fetch("/api/knowledge/chapters", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, title: nextTitle }),
    });
    await refresh();
  }

  async function deleteChapter(id: string) {
    await fetch("/api/knowledge/chapters", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await refresh();
  }

  async function addTag(chapterId: string) {
    const name = tagNameByChapter[chapterId]?.trim();
    if (!name) return;
    await fetch("/api/knowledge/tags", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chapterId, name }),
    });
    setTagNameByChapter((current) => ({ ...current, [chapterId]: "" }));
    await refresh();
  }

  async function deleteTag(id: string) {
    await fetch("/api/knowledge/tags", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await refresh();
  }

  const selectedSubject = subjects.find((subject) => subject.code === activeSubjectCode);
  const summary = summarizeKnowledgeStructure(subjects, activeSubjectCode);

  return (
    <section className="card knowledgeWorkbench">
      <div className="sectionTitle splitTitle knowledgeWorkbenchHeader">
        <div>
          <span className="eyebrow">Structure</span>
          <h2>知识结构管理</h2>
        </div>
        <div className="structureStats" aria-label="知识结构统计">
          <span><BookOpen size={14} />{summary.subjectCount} 科目</span>
          <span><FolderTree size={14} />{summary.chapterCount} 章节</span>
          <span><Tags size={14} />{summary.tagCount} 知识点</span>
        </div>
      </div>

      <div className="knowledgeWorkbenchGrid">
        <aside className="subjectRail" aria-label="科目列表">
          <div className="subjectRailHeader">
            <strong>科目</strong>
            <span>{summary.subjectCount}</span>
          </div>
          <div className="subjectRailList">
            {subjects.map((subject) => {
              const tagCount = subject.chapters.reduce((count, chapter) => count + chapter.knowledgeTags.length, 0);
              return (
                <button
                  className={activeSubjectCode === subject.code ? "subjectRailItem active" : "subjectRailItem"}
                  key={subject.code}
                  onClick={() => setSubjectCode(subject.code)}
                  type="button"
                >
                  <span>{subject.code}</span>
                  <strong>{subject.name}</strong>
                  <small>{subject.chapters.length} 章 · {tagCount} 点</small>
                </button>
              );
            })}
          </div>
          <div className="subjectCreate">
            <input value={newSubjectCode} onChange={(event) => setNewSubjectCode(event.target.value)} placeholder="编号，如 M8" />
            <input value={newSubjectName} onChange={(event) => setNewSubjectName(event.target.value)} placeholder="科目名称" />
            <button onClick={addSubject} type="button">
              <Plus size={15} />新增科目
            </button>
          </div>
        </aside>

        <div className="structureEditor">
          {selectedSubject ? (
            <div className="activeSubjectPanel">
              <div className="activeSubjectHeader">
                <div>
                  <span className="eyebrow">Current Subject</span>
                  <h3>{selectedSubject.code} · {summary.selectedSubjectName}</h3>
                  <p>{summary.selectedChapterCount} 个章节 · {summary.selectedTagCount} 个知识点</p>
                </div>
                <button className="iconDanger" onClick={() => deleteSubject(selectedSubject.code)} type="button" aria-label="删除科目">
                  <Trash2 size={15} />
                </button>
              </div>

              <div className="subjectRename">
                <label>
                  <span>科目名称</span>
                  <input defaultValue={selectedSubject.name} onBlur={(event) => renameSubject(selectedSubject.code, event.target.value)} />
                </label>
              </div>

              <div className="chapterCreate">
                <input value={chapterTitle} onChange={(event) => setChapterTitle(event.target.value)} placeholder="新增章节，例如：矩阵运算" />
                <button onClick={addChapter} type="button">
                  <Plus size={15} />新增章节
                </button>
              </div>

              <div className="chapterBoard" aria-label="章节和知识点">
                {selectedSubject.chapters.map((chapter) => (
                  <article className="chapterCard" key={chapter.id}>
                    <div className="chapterCardHeader">
                      <input defaultValue={chapter.title} onBlur={(event) => renameChapter(chapter.id, event.target.value)} />
                      <button className="iconDanger" onClick={() => deleteChapter(chapter.id)} type="button" aria-label="删除章节">
                        <Trash2 size={15} />
                      </button>
                    </div>
                    <div className="knowledgeTagCloud">
                      {chapter.knowledgeTags.map((tag) => (
                        <button key={tag.id} onClick={() => deleteTag(tag.id)} type="button">
                          {tag.name}<Trash2 size={12} />
                        </button>
                      ))}
                      {!chapter.knowledgeTags.length ? <span className="emptyChip">暂无知识点</span> : null}
                    </div>
                    <div className="tagComposer">
                      <input
                        value={tagNameByChapter[chapter.id] || ""}
                        onChange={(event) => setTagNameByChapter((current) => ({ ...current, [chapter.id]: event.target.value }))}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") void addTag(chapter.id);
                        }}
                        placeholder="添加本章知识点"
                      />
                      <button onClick={() => addTag(chapter.id)} type="button">
                        <Plus size={13} />
                      </button>
                    </div>
                  </article>
                ))}
                {!selectedSubject.chapters.length ? <p className="empty">这个科目还没有章节。</p> : null}
              </div>
            </div>
          ) : (
            <p className="empty">还没有科目。先在左侧创建一个科目。</p>
          )}
        </div>
      </div>
    </section>
  );
}
