import type { MetadataRoute } from "next";

// 故意不用 app/manifest.ts 约定文件：约定会强制注入不带版本参数的 <link>，
// iOS 长期缓存 manifest 本体导致图标更新不生效。改用普通路由 + layout 里
// metadata.manifest 手动声明链接（含 ?v=），改图标时递增版本号即可击穿缓存。
const manifest: MetadataRoute.Manifest = {
  id: "/",
  name: "登峰 · Ascend",
  short_name: "登峰 · Ascend",
  description: "日历驱动的个人学习工作台",
  start_url: "/",
  scope: "/",
  display: "standalone",
  orientation: "any",
  background_color: "#f2eee3",
  theme_color: "#b13a20",
  categories: ["education", "productivity"],
  icons: [
    { src: "/icons/icon-192.png?v=2", sizes: "192x192", type: "image/png" },
    { src: "/icons/icon-512.png?v=2", sizes: "512x512", type: "image/png" },
    { src: "/icons/icon-maskable-512.png?v=2", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};

export function GET() {
  return Response.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
