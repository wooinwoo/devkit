import { useRef } from "react";
import type { Crepe } from "@milkdown/crepe";
import { EmptyState } from "./EmptyState";
import { HtmlView } from "./HtmlView";
import { MarkdownEditor } from "./MarkdownEditor";
import { useDocs } from "./store";

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

  const dirty = doc.content !== doc.saved;

  const body =
    viewMode === "source" ? (
      <textarea
        value={doc.content}
        onChange={(e) => edit(doc.path, e.target.value)}
        spellCheck={false}
        className="size-full resize-none bg-transparent p-6 font-mono text-[13px] leading-relaxed text-text outline-none"
        aria-label={`${doc.name} 소스`}
      />
    ) : doc.kind === "markdown" ? (
      <div className="h-full overflow-auto">
        <MarkdownEditor
          docKey={doc.path}
          defaultValue={doc.content}
          onChange={(md) => edit(doc.path, md)}
          onReady={(c) => {
            crepeRef.current = c;
            // 에디터가 정규화한 값을 기준선으로 (열자마자 dirty 방지)
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
    ) : (
      <HtmlView content={doc.content} allowScripts={htmlAllowScripts} />
    );

  return (
    <div className="flex h-full flex-col">
      {/* 툴바 */}
      <div className="flex items-center justify-between gap-3 border-b border-line-soft px-4 py-2">
        <span className="flex items-center gap-2 font-mono text-xs text-muted">
          {doc.name}
          {dirty && <span className="text-faint">· 저장 안 됨</span>}
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
          <Segmented />
          <button
            type="button"
            onClick={() => void save(doc.path)}
            disabled={!dirty}
            className="rounded-full border border-line-strong px-3.5 py-1 font-mono text-xs font-semibold text-fg transition-colors enabled:hover:border-fg disabled:opacity-35"
          >
            저장
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1">{body}</div>
    </div>
  );
}
