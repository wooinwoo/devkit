import { useDocs } from "./store";

export function TabBar() {
  const { openDocs, activePath, select, close } = useDocs();
  if (openDocs.length === 0) return null;

  return (
    <div
      role="tablist"
      aria-label="열린 문서"
      className="flex items-stretch gap-px overflow-x-auto border-b border-line-soft bg-bg-deep/40"
    >
      {openDocs.map((d) => {
        const active = d.path === activePath;
        const dirty = d.content !== d.saved;
        return (
          <div
            key={d.path}
            className={`group flex shrink-0 items-center gap-1.5 border-r border-line-soft pl-3 pr-1.5 ${
              active ? "bg-bg" : "bg-transparent hover:bg-bg/50"
            }`}
          >
            <button
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => select(d.path)}
              className={`flex items-center gap-2 py-2 text-[13px] ${
                active ? "text-fg" : "text-muted"
              }`}
            >
              <span
                className={`size-1.5 rounded-full ${
                  active ? "bg-accent" : "bg-transparent"
                }`}
                aria-hidden
              />
              {d.name}
              {dirty && (
                <span className="text-faint" aria-label="저장 안 됨">
                  ●
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => close(d.path)}
              aria-label={`${d.name} 닫기`}
              className="flex size-5 items-center justify-center rounded text-faint opacity-0 transition-opacity hover:bg-surface hover:text-fg group-hover:opacity-100"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
