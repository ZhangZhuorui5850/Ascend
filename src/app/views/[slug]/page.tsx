import Link from "next/link";
import { getViewData } from "@/lib/repository";
import type { SavedView } from "@/lib/views";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

export default async function ViewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = getViewData(slug) as { view: SavedView; views: SavedView[]; rows: Row[] };

  return (
    <div className="viewsLayout">
      <aside className="viewRail">
        <span className="eyebrow">Views</span>
        <h2>视图中心</h2>
        <div className="viewNav">
          {data.views.map((view) => (
            <Link className={view.slug === data.view.slug ? "active" : ""} href={`/views/${view.slug}`} key={view.slug}>
              <b>{view.name}</b>
              <small>{view.type} · {view.source}</small>
            </Link>
          ))}
        </div>
      </aside>

      <section className="viewMain">
        <div className="pageHeader">
          <span className="eyebrow">{data.view.type} / {data.view.source}</span>
          <h1>{data.view.name}</h1>
          <p>{data.view.description}</p>
        </div>
        <ViewRenderer view={data.view} rows={data.rows} />
      </section>
    </div>
  );
}

function ViewRenderer({ view, rows }: { view: SavedView; rows: Row[] }) {
  if (view.type === "timeline") return <TimelineView rows={rows} />;
  if (view.type === "board") return <BoardView rows={rows} groupBy={view.groupBy || "status"} />;
  if (view.type === "gallery") return <GalleryView rows={rows} />;
  if (view.type === "calendar") return <MiniCalendarView rows={rows} dateField={view.dateField || "day"} />;
  if (view.type === "list") return <ListView rows={rows} fields={view.visibleFields} />;
  return <TableView rows={rows} fields={view.visibleFields} />;
}

function TableView({ rows, fields }: { rows: Row[]; fields: string[] }) {
  return (
    <div className="viewCard tableScroller">
      <table className="dataTable">
        <thead>
          <tr>{fields.map((field) => <th key={field}>{field}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={String(row.id ?? index)}>
              {fields.map((field) => <td key={field}>{formatCell(row[field])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length ? <p className="empty">暂无数据。</p> : null}
    </div>
  );
}

function ListView({ rows, fields }: { rows: Row[]; fields: string[] }) {
  return (
    <div className="viewList">
      {rows.map((row, index) => (
        <div className="viewListItem" key={String(row.id ?? index)}>
          <strong>{String(row.original_name ?? row.title ?? row.name ?? row.date ?? "未命名")}</strong>
          <span>{fields.map((field) => formatCell(row[field])).filter(Boolean).join(" · ")}</span>
        </div>
      ))}
      {!rows.length ? <p className="empty">暂无数据。</p> : null}
    </div>
  );
}

function BoardView({ rows, groupBy }: { rows: Row[]; groupBy: string }) {
  const groups = groupRows(rows, groupBy);
  return (
    <div className="boardView">
      {Object.entries(groups).map(([group, groupRows]) => (
        <div className="boardColumn" key={group}>
          <h2>{group}</h2>
          {groupRows.map((row, index) => (
            <div className="boardCard" key={String(row.id ?? index)}>
              <strong>{String(row.original_name ?? row.title ?? "未命名")}</strong>
              <span>{String(row.day ?? row.next_review ?? "")}</span>
            </div>
          ))}
        </div>
      ))}
      {!rows.length ? <p className="empty">暂无数据。</p> : null}
    </div>
  );
}

function GalleryView({ rows }: { rows: Row[] }) {
  return (
    <div className="galleryView">
      {rows.map((row, index) => (
        <a className="galleryCard" href={`/api/assets/${row.id}/file`} target="_blank" key={String(row.id ?? index)}>
          <div className="galleryPreview">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/assets/${row.id}/file`} alt={String(row.original_name ?? "图片")} />
          </div>
          <strong>{String(row.original_name ?? "未命名图片")}</strong>
          <span>{String(row.day ?? "")}</span>
        </a>
      ))}
      {!rows.length ? <p className="empty">暂无图片资料。</p> : null}
    </div>
  );
}

function MiniCalendarView({ rows, dateField }: { rows: Row[]; dateField: string }) {
  const groups = groupRows(rows, dateField);
  return (
    <div className="miniCalendar">
      {Object.entries(groups).map(([date, dateRows]) => (
        <div className="calendarBucket" key={date}>
          <b>{date || "未排期"}</b>
          {dateRows.map((row, index) => (
            <span key={String(row.id ?? index)}>{String(row.title ?? row.plan ?? row.original_name ?? row.date ?? "记录")}</span>
          ))}
        </div>
      ))}
      {!rows.length ? <p className="empty">暂无日历数据。</p> : null}
    </div>
  );
}

function TimelineView({ rows }: { rows: Row[] }) {
  return (
    <div className="timelineView">
      {rows.map((row, index) => (
        <div className={`timelineItem status-${String(row.status ?? "planned")}`} key={String(row.id ?? index)}>
          <div className="timelineDates">{String(row.start_date ?? "")} - {String(row.end_date ?? "")}</div>
          <strong>{String(row.title ?? "阶段")}</strong>
          <span>{String(row.status ?? "")}</span>
        </div>
      ))}
    </div>
  );
}

function groupRows(rows: Row[], field: string) {
  return rows.reduce<Record<string, Row[]>>((groups, row) => {
    const key = String(row[field] ?? "未设置");
    groups[key] ??= [];
    groups[key].push(row);
    return groups;
  }, {});
}

function formatCell(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  return String(value);
}
