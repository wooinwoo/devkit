import { Suspense, lazy, useRef } from "react";
import type { Crepe } from "@milkdown/crepe";
import { EmptyState } from "./EmptyState";
import { HtmlView } from "./HtmlView";
import { ImageView, VideoView } from "./MediaView";
import { useDocs } from "./store";
import { isTextKind } from "./types";

// 무거운 뷰어는 열 때만 로드 (초기 번들·시작 속도 개선)
const MarkdownEditor = lazy(() =>
  import("./MarkdownEditor").then((m) => ({ default: m.MarkdownEditor })),
);
const HwpView = lazy(() =>
  import("./HwpView").then((m) => ({ default: m.HwpView })),
);
const PdfView = lazy(() =>
  import("./PdfView").then((m) => ({ default: m.PdfView })),
);
const XlsxView = lazy(() =>
  import("./XlsxView").then((m) => ({ default: m.XlsxView })),
);
const PptxView = lazy(() =>
  import("./PptxView").then((m) => ({ default: m.PptxView })),
);

function Segmented() {
  const { viewMode, setViewMode } = useDocs();
  const opts: { id: "rich" | "source"; label: string }[] = [
    { id: "rich", label: "문서" },
    { id: "source", label: "소스" },
  ];
  return (
    <div className="flex overflow-hidden rounded-full border border-line-soft">
      {opts.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => setViewMode(o.id)}
          aria-pressed={viewMode === o.id}
          className={`px-3.5 py-1 font-mono text-xs transition-colors ${
            viewMode === o.id ? "bg-fg text-bg" : "text-muted hover:text-fg"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function DocViewer() {
  const {
    activeDoc,
    viewMode,
    edit,
    setBaseline,
    save,
    htmlAllowScripts,
    toggleScripts,
  } = useDocs();
  const crepeRef = useRef<Crepe | null>(null);

  if (!activeDoc) return <EmptyState />;
  const doc = activeDoc;

  if (doc.status === "loading") {
    return (
      <div className="flex h-full items-center justify-center text-sm text-faint">
        불러오는 중…
      </div>
    );
  }
  if (doc.status === "error") {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-rose">
        열지 못했어요: {doc.error}
      </div>
    );
  }

  const canEdit = isTextKind(doc.kind);
  const showToggle = doc.kind === "markdown" || doc.kind === "html";
  const dirty = doc.content !== doc.saved;

  const sourceArea = (
    <textarea
      value={doc.content}
      onChange={(e) => edit(doc.path, e.target.value)}
      spellCheck={false}
      className="size-full resize-none bg-transparent p-6 font-mono text-[13px] leading-relaxed text-text outline-none"
      aria-label={`${doc.name} 소스`}
    />
  );

  let body: React.ReactNode;
  if (doc.kind === "image") {
    body = <ImageView path={doc.path} />;
  } else if (doc.kind === "video") {
    body = <VideoView path={doc.path} />;
  } else if (doc.kind === "hwp") {
    body = <HwpView path={doc.path} />;
  } else if (doc.kind === "pdf") {
    body = <PdfView path={doc.path} />;
  } else if (doc.kind === "xlsx") {
    body = <XlsxView path={doc.path} />;
  } else if (doc.kind === "pptx") {
    body = <PptxView path={doc.path} />;
  } else if (doc.kind === "text") {
    body = sourceArea; // 일반 텍스트는 항상 소스 편집
  } else if (viewMode === "source") {
    body = sourceArea;
  } else if (doc.kind === "markdown") {
    body = (
      <div className="h-full overflow-auto">
        <MarkdownEditor
          docKey={doc.path}
          defaultValue={doc.content}
          onChange={(md) => edit(doc.path, md)}
          onReady={(c) => {
            crepeRef.current = c;
            requestAnimationFrame(() => {
              try {
                setBaseline(doc.path, c.getMarkdown());
              } catch {
                /* ignore */
              }
            });
          }}
        />
      </div>
    );
  } else {
    body = <HtmlView content={doc.content} allowScripts={htmlAllowScripts} />;
  }

  return (
    <div className="flex h-full flex-col">
      {/* 툴바 */}
      <div className="flex items-center justify-between gap-3 border-b border-line-soft px-4 py-2">
        <span className="flex items-center gap-2 font-mono text-xs text-muted">
          {doc.name}
          {canEdit && dirty && <span className="text-faint">· 저장 안 됨</span>}
        </span>
        <div className="flex items-center gap-2.5">
          {doc.kind === "html" && viewMode === "rich" && (
            <label className="flex cursor-pointer items-center gap-1.5 font-mono text-xs text-muted">
              <input
                type="checkbox"
                checked={htmlAllowScripts}
                onChange={toggleScripts}
                className="accent-accent"
              />
              스크립트
            </label>
          )}
          {showToggle && <Segmented />}
          {canEdit && (
            <button
              type="button"
              onClick={() => {
                const latest =
                  doc.kind === "markdown" && crepeRef.current
                    ? crepeRef.current.getMarkdown()
                    : undefined;
                void save(doc.path, latest);
              }}
              disabled={!dirty}
              className="rounded-full border border-line-strong px-3.5 py-1 font-mono text-xs font-semibold text-fg transition-colors enabled:hover:border-fg disabled:opacity-35"
            >
              저장
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center text-sm text-faint">
              불러오는 중…
            </div>
          }
        >
          {body}
        </Suspense>
      </div>
    </div>
  );
}
