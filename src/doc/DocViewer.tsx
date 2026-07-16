import { Suspense, lazy, useEffect, useRef } from "react";
import { EmptyState } from "./EmptyState";
import { HtmlView } from "./HtmlView";
import { ImageView, VideoView } from "./MediaView";
import { SourceEditor } from "./SourceEditor";
import { useDocs } from "./store";
import { isTextKind } from "./types";
import {
  DOC_WIDTH_CSS,
  type DocWidth,
  usePrefs,
} from "../workspace/prefs";

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
const DocxView = lazy(() =>
  import("./DocxView").then((m) => ({ default: m.DocxView })),
);
const IpynbView = lazy(() =>
  import("./IpynbView").then((m) => ({ default: m.IpynbView })),
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

const WIDTH_OPTS: { id: DocWidth; label: string }[] = [
  { id: "narrow", label: "좁게" },
  { id: "normal", label: "기본" },
  { id: "wide", label: "넓게" },
  { id: "full", label: "전체" },
];

/** 마크다운 본문 좌우 폭 조절 */
function WidthControl() {
  const { docWidth, set } = usePrefs();
  return (
    <div
      role="group"
      aria-label="본문 폭"
      className="flex overflow-hidden rounded-full border border-line-soft"
    >
      {WIDTH_OPTS.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => set("docWidth", o.id)}
          aria-pressed={docWidth === o.id}
          title={`본문 폭 ${o.label}`}
          className={`px-2.5 py-1 font-mono text-xs transition-colors ${
            docWidth === o.id ? "bg-fg text-bg" : "text-muted hover:text-fg"
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
    registerEditor,
    htmlAllowScripts,
    toggleScripts,
  } = useDocs();
  const { zoom, docWidth, zoomIn, zoomOut } = usePrefs();
  const contentRef = useRef<HTMLDivElement>(null);

  // Ctrl + 마우스휠 = 컨텐츠 확대/축소
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      if (e.deltaY < 0) zoomIn();
      else if (e.deltaY > 0) zoomOut();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // activeDoc: 문서가 열려 contentRef div가 렌더된 뒤 재부착
  }, [zoomIn, zoomOut, activeDoc]);

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
  const showWidth = doc.kind === "markdown" && viewMode === "rich";
  const dirty = doc.content !== doc.saved;

  const sourceArea = (
    <div className="min-h-0 flex-1">
      <SourceEditor
        docKey={`${doc.path}:source`}
        path={doc.path}
        value={doc.content}
        onChange={(v) => edit(doc.path, v)}
        registerFlush={(get) => registerEditor(doc.path, get)}
      />
    </div>
  );

  // 소스 에디터(CodeMirror)를 쓰는 경우 — text 파일이거나 md/html 소스 모드
  const usesSourceEditor =
    doc.kind === "text" || (showToggle && viewMode === "source");
  // 자체 스크롤을 갖는 뷰어·에디터는 전역 zoom 래퍼 밖에서 렌더
  const ownsScroll =
    doc.kind === "pdf" ||
    doc.kind === "xlsx" ||
    doc.kind === "image" ||
    usesSourceEditor;

  let flow: React.ReactNode; // 스크롤+줌 래퍼로 감쌀 콘텐츠
  let raw: React.ReactNode; // 자체 스크롤 뷰어 (직접 렌더)

  if (doc.kind === "pdf") {
    raw = <PdfView path={doc.path} zoom={zoom} />;
  } else if (doc.kind === "xlsx") {
    raw = <XlsxView path={doc.path} zoom={zoom} />;
  } else if (doc.kind === "image") {
    raw = <ImageView path={doc.path} />; // 자체 줌·팬·회전
  } else if (doc.kind === "video") {
    flow = (
      <div className="min-h-0 flex-1">
        <VideoView path={doc.path} />
      </div>
    );
  } else if (doc.kind === "hwp") {
    flow = (
      <div className="min-h-0 flex-1">
        <HwpView path={doc.path} />
      </div>
    );
  } else if (doc.kind === "pptx") {
    flow = (
      <div className="min-h-0 flex-1">
        <PptxView path={doc.path} />
      </div>
    );
  } else if (doc.kind === "docx") {
    flow = (
      <div className="min-h-0 flex-1">
        <DocxView path={doc.path} />
      </div>
    );
  } else if (doc.kind === "ipynb") {
    flow = (
      <div className="min-h-0 flex-1">
        <IpynbView path={doc.path} />
      </div>
    );
  } else if (doc.kind === "text") {
    raw = sourceArea; // 일반 텍스트·코드는 항상 소스 편집
  } else if (viewMode === "source") {
    raw = sourceArea; // md/html 소스 모드
  } else if (doc.kind === "markdown") {
    flow = (
      <div className="min-h-0 flex-1">
        <MarkdownEditor
          docKey={doc.path}
          defaultValue={doc.content}
          onChange={(md) => edit(doc.path, md)}
          onReady={(c) => {
            registerEditor(doc.path, () => c.getMarkdown());
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
    flow = (
      <div className="min-h-0 flex-1">
        <HtmlView content={doc.content} allowScripts={htmlAllowScripts} />
      </div>
    );
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
          {showWidth && <WidthControl />}
          {showToggle && <Segmented />}
          {canEdit && (
            <button
              type="button"
              onClick={() => void save(doc.path)}
              disabled={!dirty}
              className="rounded-full border border-line-strong px-3.5 py-1 font-mono text-xs font-semibold text-fg transition-colors enabled:hover:border-fg disabled:opacity-35"
            >
              저장
            </button>
          )}
        </div>
      </div>

      <div ref={contentRef} className="min-h-0 flex-1">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center text-sm text-faint">
              불러오는 중…
            </div>
          }
        >
          {ownsScroll ? (
            raw
          ) : (
            <div className="h-full overflow-auto">
              <div
                className="flex min-h-full flex-col"
                style={{
                  zoom,
                  ["--doc-width" as string]: DOC_WIDTH_CSS[docWidth],
                }}
              >
                {flow}
              </div>
            </div>
          )}
        </Suspense>
      </div>
    </div>
  );
}
