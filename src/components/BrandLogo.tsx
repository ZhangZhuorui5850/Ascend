/**
 * 登峰品牌徽标（雪峰 + 登山路线）。
 * 颜色全部走设计令牌：峰体 --ink、路线 --accent、雪顶 --surface、远山 --line，
 * 因此换皮肤（data-skin）/ 切明暗（data-theme）时自动跟随，无需维护多套文件。
 * 静态导出版（对外物料 / 系统图标）见 public/brand/ 与 scripts/render-brand.mjs。
 */
export function BrandLogo({ size = 32, detailed = false, inverse = false, className, title = "登峰" }: {
  /** 显示高度（px），宽度按比例自适应 */
  size?: number;
  /** true 时带远山、细路线（≥40px 的场景）；默认简化版（粗路线、无远山） */
  detailed?: boolean;
  /** 深色反相底（如登录页 hero）上使用 */
  inverse?: boolean;
  className?: string;
  title?: string;
}) {
  const peak = inverse ? "var(--bg)" : "var(--ink)";
  const snow = inverse ? "var(--surface-inverse)" : "var(--surface)";
  const ridge = inverse ? "color-mix(in srgb, var(--bg) 32%, transparent)" : "var(--line)";
  return (
    <svg
      aria-label={title}
      className={className}
      height={size}
      role="img"
      viewBox="-10 -10 520 360"
      width={Math.round(size * (520 / 360))}
    >
      {detailed ? (
        <>
          <path d="M0,332 L172,112 L272,252 L164,332 Z" fill={ridge} />
          <path d="M500,332 L368,148 L272,252 L404,332 Z" fill={ridge} />
        </>
      ) : null}
      <path d="M16,332 L248,0 L480,332 Z" fill={peak} />
      <path d="M248,0 L192,108 L248,84 L304,108 Z" fill={snow} />
      <path
        d="M140,332 L216,240 L180,220 L248,128 L248,84"
        fill="none"
        stroke="var(--accent)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={detailed ? 16 : 26}
      />
    </svg>
  );
}
