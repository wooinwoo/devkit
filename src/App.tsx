import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { DocViewer } from "./doc/DocViewer";
import { Sidebar } from "./doc/Sidebar";
import { StatusBar } from "./doc/StatusBar";
import { TabBar } from "./doc/TabBar";
import { startupFile } from "./doc/fs";
import { DocProvider, useDocs } from "./doc/store";
import { WorkspaceProvider, usePrefs } from "./workspace/prefs";

function Shell() {
  const { openPaths, save, activeDoc } = useDocs();
  const prefs = usePrefs();

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
      } else if (e.key === "F8") {
        e.preventDefault();
        prefs.toggleFocus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prefs, activeDoc, save]);

  const showChrome = !prefs.focus;

  return (
    <div className="flex h-svh overflow-hidden">
      {showChrome && !prefs.sidebarCollapsed && <Sidebar />}

      <main className="relative flex min-w-0 flex-1 flex-col">
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
