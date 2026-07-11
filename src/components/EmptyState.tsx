import Link from "next/link";

/** 手帐纸签式空状态：左侧朱砂空心章 + 一句话 + 可选去处。 */
export function EmptyState({ seal, text, action }: {
  seal: string;
  text: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="emptyState">
      <span aria-hidden className="emptySeal">{seal}</span>
      <p>{text}</p>
      {action ? (
        <Link className="secondaryButton" href={action.href}>
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
