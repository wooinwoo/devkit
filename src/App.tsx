import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { CommandPalette } from "./doc/CommandPalette";
import { DocViewer } from "./doc/DocViewer";
import { SettingsPanel } from "./doc/SettingsPanel";
import { Sidebar } from "./doc/Sidebar";
import { StatusBar } from "./doc/StatusBar";
import { TabBar } from "./doc/TabBar";
import { UpdateBanner } from "./doc/UpdateBanner";
import { isDirectory, isTauri, startupFiles } from "./doc/fs";
import { isEditableDoc, kindOf } from "./doc/types";
import { DocProvider, useDocs } from "./doc/store";
import { WorkspaceProvider, usePrefs } from "./workspace/prefs";

function Shell() {
  const {
    openPaths,
    openFilesDialog,
    openFolderRoot,
    save,
    activeDoc,
    closeActive,
    selectNext,
    selectPrev,
    selectByIndex,
    hasUnsavedChanges,
    hasPendingSaves,
    sessionRestored,
  } = useDocs();
  const prefs = usePrefs();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // 사이드바 설정 버튼 → 패널 열기
  useEffect(() => {
    const open = () => setSettingsOpen(true);
    window.addEventListener("devkit:open-settings", open);
    return () => window.removeEventListener("devkit:open-settings", open);
  }, []);

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
          else if (paths[0]) {
            void isDirectory(paths[0]).then((directory) => {
              if (directory) return openFolderRoot(paths[0]);
              window.alert("devkit에서 열 수 없는 파일 형식이에요.");
            }).catch(() => {});
          }
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
    if (sessionRestored) {
      startupFiles()
        .then((paths) => {
          if (paths.length) void openPaths(paths);
        })
        .catch(() => {});
    }
    listen<string[]>("opened-files", (e) => {
      void openPaths(e.payload);
    })
      .then((u) => {
        unlisten = u;
      })
      .catch(() => {});
    // 개발용: 브라우저에서 ?open=/samples/a.md,/samples/b.csv 로 뷰어 검증
    if (sessionRestored && import.meta.env.DEV) {
      const q = new URLSearchParams(location.search).get("open");
      if (q) void openPaths(q.split(",").filter(Boolean));
    }
    return () => unlisten?.();
  }, [openPaths, sessionRestored]);

  // 브라우저 새로고침과 데스크톱 창 닫기 모두 최신 에디터 값을 확인한다.
  useEffect(() => {
    const message = "저장하지 않은 변경이 있어요. 앱을 닫을까요?";
    if (!isTauri) {
      const beforeUnload = (event: BeforeUnloadEvent) => {
        if (!hasUnsavedChanges() && !hasPendingSaves()) return;
        event.preventDefault();
        event.returnValue = "";
      };
      window.addEventListener("beforeunload", beforeUnload);
      return () => window.removeEventListener("beforeunload", beforeUnload);
    }

    let unlisten: (() => void) | undefined;
    import("@tauri-apps/api/window")
      .then(({ getCurrentWindow }) =>
        getCurrentWindow().onCloseRequested((event) => {
          if (hasPendingSaves()) {
            event.preventDefault();
            window.alert("저장이 끝난 뒤 앱을 닫아 주세요.");
            return;
          }
          if (hasUnsavedChanges() && !window.confirm(message)) {
            event.preventDefault();
          }
        }),
      )
      .then((stop) => {
        unlisten = stop;
      })
      .catch(() => {});
    return () => unlisten?.();
  }, [hasPendingSaves, hasUnsavedChanges]);

  // 전역 단축키: 줌(Ctrl +/-/0), 저장(Ctrl+S), 사이드바(Ctrl+B), 집중(F8)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (settingsOpen || paletteOpen) return;
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
        if (
          activeDoc &&
          isEditableDoc(activeDoc.kind, activeDoc.path)
        ) {
          void save(activeDoc.path).catch((error: unknown) => {
            window.alert(`저장하지 못했어요.\n${(error as Error).message ?? String(error)}`);
          });
        }
      } else if (mod && e.key.toLowerCase() === "o") {
        e.preventDefault();
        void openFilesDialog();
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
      } else if (mod && e.key === ",") {
        e.preventDefault();
        setSettingsOpen((v) => !v);
      } else if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
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
    openFilesDialog,
    closeActive,
    selectNext,
    selectPrev,
    selectByIndex,
    settingsOpen,
    paletteOpen,
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

      {settingsOpen && (
        <SettingsPanel onClose={() => setSettingsOpen(false)} />
      )}
      {paletteOpen && (
        <CommandPalette onClose={() => setPaletteOpen(false)} />
      )}
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
