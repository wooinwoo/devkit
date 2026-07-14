import { EmptyState } from "./EmptyState";
import { HtmlView } from "./HtmlView";
import { MarkdownView } from "./MarkdownView";
import { useDocs } from "./store";

function Segmented() {
  const { viewMode, setViewMode } = useDocs();
  const opts: { id: "preview" | "edit"; label: string }[] = [
    { id: "preview", label: "보기" },
    { id: "edit", label: "편집" },
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
    save,
    htmlAllowScripts,
    toggleScripts,
  } = useDocs();

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

  const rendered =
    doc.kind === "markdown" ? (
      <MarkdownView content={doc.content} />
    ) : (
      <HtmlView content={doc.content} allowScripts={htmlAllowScripts} />
    );

  const editor = (
    <textarea
      value={doc.content}
      onChange={(e) => edit(doc.path, e.target.value)}
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
          e.preventDefault();
          if (dirty) void save(doc.path);
        }
      }}
      spellCheck={false}
      className="size-full resize-none bg-transparent p-5 font-mono text-[13px] leading-relaxed text-text outline-none"
      aria-label={`${doc.name} 소스`}
    />
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
          {doc.kind === "html" && (
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

      {/* 본문 */}
      <div className="min-h-0 flex-1">
        {viewMode === "preview" ? (
          <div className="h-full overflow-auto px-6 py-8">
            {doc.kind === "html" ? (
              <div className="h-full">{rendered}</div>
            ) : (
              rendered
            )}
          </div>
        ) : (
          <div className="grid h-full grid-cols-2 divide-x divide-line-soft">
            <div className="min-h-0 overflow-auto">{editor}</div>
            <div className="min-h-0 overflow-auto bg-bg-deep/20 px-5 py-6">
              {rendered}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
