import { useMemo, useState } from "react";

const SAMPLE = `<!doctype html>
<html>
  <head>
    <style>
      body { font-family: sans-serif; padding: 2rem; color: #1a1a1a; }
      h1 { color: #0047ab; }
      .badge { display: inline-block; padding: .2rem .6rem;
        border: 1px solid #0047ab; border-radius: 999px; font-size: .8rem; }
    </style>
  </head>
  <body>
    <h1>안녕하세요 👋</h1>
    <p>여기에 HTML을 붙여넣으면 오른쪽에 바로 렌더됩니다.</p>
    <span class="badge">live preview</span>
  </body>
</html>`;

type Viewport = { label: string; w: number | null };
const VIEWPORTS: Viewport[] = [
  { label: "Full", w: null },
  { label: "Tablet 768", w: 768 },
  { label: "Mobile 375", w: 375 },
];

/** 대략적 요소 수 — 여는 태그 개수 (완벽한 파싱 아님, 지표용) */
function countTags(html: string): number {
  const m = html.match(/<[a-zA-Z][^>]*?>/g);
  return m ? m.filter((t) => !t.startsWith("</")).length : 0;
}

export function HtmlTool() {
  const [html, setHtml] = useState(SAMPLE);
  const [viewport, setViewport] = useState<Viewport>(VIEWPORTS[0]);
  const [allowScripts, setAllowScripts] = useState(false);

  const stats = useMemo(
    () => ({ chars: html.length, tags: countTags(html), lines: html.split("\n").length }),
    [html],
  );

  // 스크립트 허용 시에만 allow-scripts. allow-same-origin 은 주지 않아 부모 접근 차단.
  const sandbox = allowScripts ? "allow-scripts" : "";

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-fg">
          HTML <span className="text-accent">viewer</span>
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          HTML을 붙여넣으면 바로 렌더링합니다. 샌드박스 iframe이라 안전해요.
        </p>
      </header>

      {/* 툴바 */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-full border border-line-soft">
          {VIEWPORTS.map((v) => (
            <button
              key={v.label}
              type="button"
              onClick={() => setViewport(v)}
              className={`px-3.5 py-1.5 font-mono text-xs transition-colors ${
                viewport.label === v.label
                  ? "bg-fg text-bg"
                  : "text-muted hover:text-fg"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
        <label className="flex cursor-pointer items-center gap-2 rounded-full border border-line-soft px-3.5 py-1.5 font-mono text-xs text-muted">
          <input
            type="checkbox"
            checked={allowScripts}
            onChange={(e) => setAllowScripts(e.target.checked)}
            className="accent-accent"
          />
          스크립트 실행
        </label>
        <button
          type="button"
          onClick={() => setHtml(SAMPLE)}
          className="rounded-full border border-line-soft px-3.5 py-1.5 font-mono text-xs text-muted transition-colors hover:border-fg hover:text-fg"
        >
          샘플
        </button>
        <button
          type="button"
          onClick={() => setHtml("")}
          className="rounded-full border border-line-soft px-3.5 py-1.5 font-mono text-xs text-muted transition-colors hover:border-fg hover:text-fg"
        >
          비우기
        </button>
        <span className="ml-auto font-mono text-[11px] text-faint">
          {stats.lines}줄 · {stats.chars}자 · ~{stats.tags} 요소
        </span>
      </div>

      {/* 에디터 + 프리뷰 split */}
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-2">
        <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-line-soft bg-surface">
          <div className="border-b border-line-soft px-4 py-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-faint">
              source
            </span>
          </div>
          <label htmlFor="html-src" className="sr-only">
            HTML 소스
          </label>
          <textarea
            id="html-src"
            value={html}
            onChange={(e) => setHtml(e.target.value)}
            spellCheck={false}
            className="min-h-[16rem] flex-1 resize-none bg-transparent p-4 font-mono text-[13px] leading-relaxed text-text outline-none placeholder:text-faint"
            placeholder="여기에 HTML 붙여넣기…"
          />
        </div>

        <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-line-soft bg-white">
          <div className="flex items-center justify-between border-b border-line-soft bg-surface px-4 py-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-faint">
              preview
            </span>
            <span className="font-mono text-[11px] text-faint">
              {viewport.w ? `${viewport.w}px` : "100%"}
            </span>
          </div>
          <div className="flex min-h-0 flex-1 justify-center overflow-auto bg-bg-deep/40 p-3">
            <iframe
              title="HTML 미리보기"
              srcDoc={html}
              sandbox={sandbox}
              className="h-full min-h-[16rem] w-full rounded-lg border border-line-soft bg-white"
              style={viewport.w ? { maxWidth: viewport.w } : undefined}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
