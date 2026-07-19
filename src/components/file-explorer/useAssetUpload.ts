"use client";

import { useState } from "react";
import { MAX_UPLOAD_BYTES } from "@/lib/limits";

/** 并发（最多 3 路）上传到当前目录；失败逐个收集并统一 notify。行为与拆分前一致。 */
export function useAssetUpload({ folderPath, notify, onUploaded }: {
  folderPath: string;
  notify: (message: string, kind?: "success" | "error" | "info") => void;
  onUploaded: () => void;
}) {
  const [uploading, setUploading] = useState(0);
  const [uploaded, setUploaded] = useState(0);

  async function uploadFileList(list: File[]) {
    if (!list.length) return;
    setUploading(list.length);
    setUploaded(0);
    const failures: string[] = [];
    let cursor = 0;
    async function worker() {
      while (cursor < list.length) {
        const file = list[cursor++];
        if (file.size > MAX_UPLOAD_BYTES) {
          failures.push(`${file.name}：超过 20MB 上限`);
          setUploading((current) => Math.max(0, current - 1));
          setUploaded((current) => current + 1);
          continue;
        }
        try {
          const formData = new FormData();
          formData.append("file", file, file.name);
          formData.append("folderPath", folderPath);
          const response = await fetch("/api/assets", { method: "POST", body: formData });
          if (!response.ok) {
            const text = await response.text();
            failures.push(`${file.name}：${text || "上传失败"}`);
          }
        } catch (err) {
          console.error("上传文件失败", file.name, err);
          failures.push(`${file.name}：网络错误`);
        }
        setUploading((current) => Math.max(0, current - 1));
        setUploaded((current) => current + 1);
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, list.length) }, () => worker()));
    if (failures.length) {
      notify(`${failures.length} 个文件上传失败：${failures[0]}${failures.length > 1 ? " 等" : ""}`, "error");
    } else if (list.length) {
      notify(`已上传 ${list.length} 个文件`);
    }
    onUploaded();
  }

  return { uploading, uploaded, uploadFileList };
}
