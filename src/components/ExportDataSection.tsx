import { FileDown } from "lucide-react";

/**
 * 「导出我的数据」卡片：服务端组件，下载走 <a download>，鉴权由 /api/export 自行完成。
 */
export function ExportDataSection() {
  return (
    <section aria-label="导出我的数据" className="card installCard">
      <FileDown aria-hidden size={18} />
      <div>
        <strong>导出我的数据</strong>
        <p>
          把当前学习空间的全部数据打包成一个 zip 带走：任务与日程、知识树与掌握度、复习记录、
          错题本、模考成绩、资料库文件与设置。包内含机器可读的 data.json、人可读的 summary.md，
          以及 assets/ 目录下的全部附件，可用于备份或迁移到其他工具。
        </p>
      </div>
      <a className="primaryButton" download href="/api/export">
        下载
      </a>
    </section>
  );
}
