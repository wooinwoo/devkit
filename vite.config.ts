import { readFileSync } from "node:fs";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const pkg = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf-8"),
);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // 앱 화면에 표시할 버전 (업데이트 확인용)
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
});
