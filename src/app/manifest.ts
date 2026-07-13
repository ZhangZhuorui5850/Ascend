import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
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
    // v 参数：public/ 下静态图标是同路径覆盖发布的，改图时手动递增以击穿客户端缓存
    icons: [
      { src: "/icons/icon-192.png?v=2", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png?v=2", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png?v=2", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
