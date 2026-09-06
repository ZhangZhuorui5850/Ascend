const TEXT_EXTENSIONS = new Set([
  "txt", "json", "csv", "log", "py", "js", "ts", "tsx", "jsx", "c", "cpp", "h", "hpp",
  "java", "sql", "sh", "bat", "yml", "yaml", "xml", "toml", "ini", "tex", "r", "go", "rs",
]);

export type PreviewKind = "image" | "pdf" | "markdown" | "text" | "none";

export function previewKind(file: { original_name: string; mime_type: string }): PreviewKind {
  const mime = (file.mime_type || "").toLowerCase();
  const ext = file.original_name.includes(".")
    ? file.original_name.split(".").pop()!.toLowerCase()
    : "";
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (mime === "text/markdown" || ext === "md" || ext === "markdown") return "markdown";
  if (mime.startsWith("text/") || TEXT_EXTENSIONS.has(ext)) return "text";
  return "none";
}

