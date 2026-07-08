export type KnowledgeStructureTag = { id: string; name: string };
export type KnowledgeStructureChapter = { id: string; title: string; knowledgeTags: KnowledgeStructureTag[] };
export type KnowledgeStructureSubject = { code: string; name: string; chapters: KnowledgeStructureChapter[] };

export function summarizeKnowledgeStructure(subjects: KnowledgeStructureSubject[], selectedSubjectCode: string) {
  const selectedSubject =
    subjects.find((subject) => subject.code === selectedSubjectCode) ||
    subjects[0] || { code: "", name: "", chapters: [] };

  return {
    subjectCount: subjects.length,
    chapterCount: subjects.reduce((count, subject) => count + subject.chapters.length, 0),
    tagCount: subjects.reduce(
      (count, subject) => count + subject.chapters.reduce((chapterCount, chapter) => chapterCount + chapter.knowledgeTags.length, 0),
      0,
    ),
    selectedSubjectName: selectedSubject.name,
    selectedChapterCount: selectedSubject.chapters.length,
    selectedTagCount: selectedSubject.chapters.reduce((count, chapter) => count + chapter.knowledgeTags.length, 0),
  };
}
