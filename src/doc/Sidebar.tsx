import { FileTree } from "./FileTree";
import { Outline } from "./Outline";
import { useDocs } from "./store";
import {
  SIDEBAR_MAX,
  SIDEBAR_MIN,
  clamp,
  usePrefs,
} from "../workspace/prefs";

export function Sidebar() {
  const { sidebarWidth, sidebarTab, set, toggleSidebar } = usePrefs();
  const { openFilesDialog, openFolderDialog, folder, refreshFolder } =
    useDocs();

  function startResize(e: React.PointerEvent) {
    e.preventDefault();
    const move = (ev: PointerEvent) =>
      set("sidebarWidth", clamp(ev.clientX, SIDEBAR_MIN, SIDEBAR_MAX));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  const tabs: { id: "files" | "outline"; label: string }[] = [
    { id: "files", label: "파일" },
    { id: "outline", label: "목차" },
  ];

  return (
    <aside
      className="relative flex shrink-0 flex-col border-r border-line-soft bg-bg-deep/50"
      style={{ width: sidebarWidth }}
    >
      <div className="flex items-center justify-between px-4 pt-5 pb-3">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-md bg-fg font-mono text-sm font-bold text-bg">
            d
          </span>
          <span className="font-bold tracking-tight text-fg">devkit</span>
        </div>
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label="사이드바 접기"
          title="사이드바 접기 (Ctrl+B)"
          className="flex size-6 items-center justify-center rounded text-faint transition-colors hover:bg-surface hover:text-fg"
        >
          «
        </button>
      </div>

      <div className="flex gap-2 px-4 pb-3">
        <button
          type="button"
          onClick={openFilesDialog}
          className="flex-1 rounded-lg bg-fg px-3 py-1.5 text-xs font-semibold text-bg transition-colors hover:bg-accent hover:text-white"
        >
          파일 열기
        </button>
        <button
          type="button"
          onClick={openFolderDialog}
          className="flex-1 rounded-lg border border-line-strong px-3 py-1.5 text-xs font-semibold text-fg transition-colors hover:border-fg"
        >
          폴더 열기
        </button>
      </div>

      {folder && (
        <div className="flex items-center justify-between gap-2 px-4 pb-2">
          <span className="truncate font-mono text-[10px] uppercase tracking-wide text-faint">
            <span className="text-accent">/</span>{" "}
            {folder.root.split(/[\\/]/).pop()}
          </span>
          <button
            type="button"
            onClick={() => void refreshFolder()}
            aria-label="폴더 새로고침"
            title="폴더 새로고침"
            className="shrink-0 text-faint transition-colors hover:text-fg"
          >
            ↻
          </button>
        </div>
      )}

      {/* 파일 / 목차 탭 */}
      <div
        role="tablist"
        aria-label="사이드바 패널"
        className="mx-3 mb-1 flex gap-px overflow-hidden rounded-lg border border-line-soft"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={sidebarTab === t.id}
            onClick={() => set("sidebarTab", t.id)}
            className={`flex-1 py-1.5 font-mono text-[11px] transition-colors ${
              sidebarTab === t.id
                ? "bg-surface text-fg"
                : "text-muted hover:text-fg"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-2 pb-2">
        {sidebarTab === "files" ? <FileTree /> : <Outline />}
      </div>

      <footer className="border-t border-line-soft px-4 py-2.5">
        <p className="font-mono text-[10px] text-faint">by wooinwoo</p>
      </footer>

      {/* 리사이즈 핸들 */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="사이드바 폭 조절"
        tabIndex={0}
        onPointerDown={startResize}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft")
            set("sidebarWidth", clamp(sidebarWidth - 16, SIDEBAR_MIN, SIDEBAR_MAX));
          if (e.key === "ArrowRight")
            set("sidebarWidth", clamp(sidebarWidth + 16, SIDEBAR_MIN, SIDEBAR_MAX));
        }}
        className="absolute right-0 top-0 h-full w-1.5 translate-x-1/2 cursor-col-resize hover:bg-accent/30"
      />
    </aside>
  );
}
