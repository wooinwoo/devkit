import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { DocViewer } from "./doc/DocViewer";
import { Sidebar } from "./doc/Sidebar";
import { StatusBar } from "./doc/StatusBar";
import { TabBar } from "./doc/TabBar";
import { UpdateBanner } from "./doc/UpdateBanner";
import { startupFile } from "./doc/fs";
import { kindOf } from "./doc/types";
import { DocProvider, useDocs } from "./doc/store";
import { WorkspaceProvider, usePrefs } from "./workspace/prefs";

function Shell() {
  const {
    openPaths,
    openFolderRoot,
    save,
    activeDoc,
    closeActive,
    selectNext,
    selectPrev,
    selectByIndex,
  } = useDocs();
  const prefs = usePrefs();

  // 창에 파일·폴더 드래그앤드롭 → 열기
  useEffect(() => {
    let un: (() => void) | undefined;
    import("@tauri-apps/api/webview")
      .then(({ getCurrentWebview }) =>
        getCurrentWebview().onDragDropEvent((e) => {
          if (e.payload.type !== "drop") return;
          const paths = e.payload.paths;
          const files = paths.filter((p) => kindOf(p));
          if (files.length) void openPaths(files);
          // 열 수 있는 파일이 없으면 첫 경로를 폴더로 시도
          else if (paths[0]) void openFolderRoot(paths[0]).catch(() => {});
        }),
      )
      .then((u) => {
        un = u;
      })
      .catch(() => {});
    return () => un?.();
  }, [openPaths, openFolderRoot]);

  // OS 파일 연결: cold start argv + warm start emit
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
    // 개발용: 브라우저에서 ?open=/samples/a.md,/samples/b.csv 로 뷰어 검증
    if (import.meta.env.DEV) {
      const q = new URLSearchParams(location.search).get("open");
      if (q) void openPaths(q.split(",").filter(Boolean));
    }
    return () => unlisten?.();
  }, [openPaths]);

  // 전역 단축키: 줌(Ctrl +/-/0), 저장(Ctrl+S), 사이드바(Ctrl+B), 집중(F8)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        prefs.zoomIn();
      } else if (mod && e.key === "-") {
        e.preventDefault();
        prefs.zoomOut();
      } else if (mod && e.key === "0") {
        e.preventDefault();
        prefs.zoomReset();
      } else if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (activeDoc) void save(activeDoc.path);
      } else if (mod && e.key.toLowerCase() === "b") {
        e.preventDefault();
        prefs.toggleSidebar();
      } else if (mod && e.key.toLowerCase() === "w") {
        e.preventDefault();
        closeActive();
      } else if (mod && e.key === "Tab") {
        e.preventDefault();
        if (e.shiftKey) selectPrev();
        else selectNext();
      } else if (mod && e.key >= "1" && e.key <= "9") {
        e.preventDefault();
        selectByIndex(Number(e.key) - 1);
      } else if (e.key === "F8") {
        e.preventDefault();
        prefs.toggleFocus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    prefs,
    activeDoc,
    save,
    closeActive,
    selectNext,
    selectPrev,
    selectByIndex,
  ]);

  const showChrome = !prefs.focus;

  return (
    <div className="flex h-svh overflow-hidden">
      {showChrome && !prefs.sidebarCollapsed && <Sidebar />}

      <main className="relative flex min-w-0 flex-1 flex-col">
        {showChrome && <UpdateBanner />}
        {showChrome && <TabBar />}
        <div className="min-h-0 flex-1">
          <DocViewer />
        </div>
        {showChrome && <StatusBar />}

        {(prefs.sidebarCollapsed || prefs.focus) && (
          <button
            type="button"
            onClick={() =>
              prefs.focus
                ? prefs.toggleFocus()
                : prefs.set("sidebarCollapsed", false)
            }
            className="absolute left-3 top-3 z-10 rounded-md border border-line-soft bg-bg px-2.5 py-1 font-mono text-xs text-muted shadow-sm transition-colors hover:text-fg"
          >
            {prefs.focus ? "집중 해제 · F8" : "사이드바 · Ctrl+B"}
          </button>
        )}
      </main>
    </div>
  );
}

export function App() {
  return (
    <WorkspaceProvider>
      <DocProvider>
        <Shell />
      </DocProvider>
    </WorkspaceProvider>
  );
}
