import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: process.cwd(),
  },
  experimental: {
    // 客户端路由缓存：30s 内往返导航直接复用，消除重复点击的整页等待
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
};

export default nextConfig;
