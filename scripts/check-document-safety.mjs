import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [ipynb, docx, html, hwp, config, css] = await Promise.all([
  read("src/doc/IpynbView.tsx"),
  read("src/doc/DocxView.tsx"),
  read("src/doc/HtmlView.tsx"),
  read("src/doc/HwpView.tsx"),
  read("src-tauri/tauri.conf.json"),
  read("src/index.css"),
]);

if (
  !ipynb.includes('sandbox=""') ||
  !ipynb.includes("default-src 'none'") ||
  ipynb.includes("dangerouslySetInnerHTML={{ __html: src(htmlOut)")
) {
  throw new Error("IPYNB HTML 출력 격리가 빠짐");
}
if (
  !docx.includes("renderAltChunks: false") ||
  !docx.includes('link.removeAttribute("href")')
) {
  throw new Error("DOCX 삽입 HTML 또는 링크 방어가 빠짐");
}
if (!html.includes('sandbox=""') || html.includes("allow-scripts")) {
  throw new Error("HTML 미리보기 스크립트 격리가 빠짐");
}
if (hwp.includes("dangerouslySetInnerHTML") || !hwp.includes("URL.createObjectURL")) {
  throw new Error("HWP SVG가 메인 DOM에 직접 삽입됨");
}
const security = JSON.parse(config).app?.security;
for (const [name, csp] of [["production", security?.csp], ["development", security?.devCsp]]) {
  if (
    !csp ||
    !csp["script-src"] ||
    csp["script-src"].includes("unsafe-inline") ||
    csp["object-src"] !== "'none'" ||
    csp["base-uri"] !== "'none'" ||
    csp["form-action"] !== "'none'"
  ) {
    throw new Error(`Tauri ${name} CSP가 안전하게 설정되지 않음`);
  }
}
if (/^@import\s+url\(["']?https?:/m.test(css)) {
  throw new Error("오프라인 CSS에 원격 import가 남음");
}

console.log("document safety checks ok");
