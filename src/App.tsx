import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { DocViewer } from "./doc/DocViewer";
import { FileTree } from "./doc/FileTree";
import { startupFile } from "./doc/fs";
import { DocProvider, useDocs } from "./doc/store";
import { TabBar } from "./doc/TabBar";
import { basename } from "./doc/types";

function Shell() {
  const { openFilesDialog, openFolderDialog, openPaths, folder } = useDocs();

  // OS 파일 연결: cold start argv + warm start emit 수신
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    startupFile()
      .then((p) => {
        if (p) void openPaths([p]);
      })
      .catch(() => {});
    listen<string>("opened-file", (e) => {
      void openPaths([e.payload]);
    })
      .then((u) => {
        unlisten = u;
      })
      .catch(() => {});
    return () => unlisten?.();
  }, [openPaths]);

  return (
    <div className="flex h-svh overflow-hidden">
      {/* 사이드바 */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-line-soft bg-bg-deep/50">
        <div className="px-4 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md bg-fg font-mono text-sm font-bold text-bg">
              d
            </span>
            <span className="font-bold tracking-tight text-fg">devkit</span>
          </div>
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
          <p className="truncate px-4 pb-2 font-mono text-[10px] uppercase tracking-wide text-faint">
            <span className="text-accent">/</span> {basename(folder.root)}
          </p>
        )}

        <div className="min-h-0 flex-1 overflow-auto px-2 pb-2">
          <FileTree />
        </div>

        <footer className="border-t border-line-soft px-4 py-3">
          <p className="font-mono text-[10px] leading-relaxed text-faint">
            markdown · html viewer
            <br />
            by wooinwoo
          </p>
        </footer>
      </aside>

      {/* 본문 */}
      <main className="flex min-w-0 flex-1 flex-col">
        <TabBar />
        <div className="min-h-0 flex-1">
          <DocViewer />
        </div>
      </main>
    </div>
  );
}

export function App() {
  return (
    <DocProvider>
      <Shell />
    </DocProvider>
  );
}
