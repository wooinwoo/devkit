import { useDocs } from "./store";
import { usePrefs } from "../workspace/prefs";

export function StatusBar() {
  const { activeDoc } = useDocs();
  const { zoom, zoomIn, zoomOut, zoomReset } = usePrefs();

  const text = activeDoc?.content ?? "";
  const chars = text.length;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <div className="flex items-center justify-between border-t border-line-soft bg-bg-deep/40 px-4 py-1.5 font-mono text-[11px] text-faint">
      <span>{activeDoc ? activeDoc.name : "—"}</span>
      <span className="flex items-center gap-4">
        {activeDoc && (
          <span>
            {words}단어 · {chars}자
          </span>
        )}
        {/* 컨텐츠 줌 — Ctrl+휠 / Ctrl+± 와 동일 */}
        <span className="flex items-center gap-1" title="컨텐츠 확대·축소 (Ctrl+휠 / Ctrl+±)">
          <button
            type="button"
            onClick={zoomOut}
            className="px-1 text-sm leading-none transition-colors hover:text-fg"
            aria-label="축소"
          >
            −
          </button>
          <button
            type="button"
            onClick={zoomReset}
            className="tabular-nums transition-colors hover:text-fg"
            aria-label="줌 초기화"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            onClick={zoomIn}
            className="px-1 text-sm leading-none transition-colors hover:text-fg"
            aria-label="확대"
          >
            +
          </button>
        </span>
      </span>
    </div>
  );
}
