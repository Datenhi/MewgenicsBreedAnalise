import type { NextConfig } from "next";

// STATIC_EXPORT=1 — сборка полностью статического сайта (out/) для GitHub Pages
// и других статических хостингов. По умолчанию — standalone-сервер.
const isStatic = process.env.STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  output: isStatic ? "export" : "standalone",
  distDir: isStatic ? ".next-static" : ".next",
  // Для хостинга в подкаталоге (например, https://user.github.io/repo/):
  // задайте NEXT_PUBLIC_BASE_PATH=/repo — он же используется парсером для загрузки WASM.
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
