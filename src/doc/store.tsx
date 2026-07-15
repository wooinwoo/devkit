import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  listDocs,
  pickFiles,
  pickFolder,
  readDoc,
  watchFolder,
  writeDoc,
} from "./fs";
import {
  type OpenDoc,
  type TreeNode,
  type ViewMode,
  type ViewerState,
  basename,
  isTextKind,
  kindOf,
} from "./types";

type Action =
  | { t: "OPEN_FOLDER"; root: string; tree: TreeNode[] }
  | { t: "DOC_START"; path: string }
  | { t: "DOC_DONE"; path: string; content: string }
  | { t: "DOC_FAIL"; path: string; error: string }
  | { t: "EDIT"; path: string; content: string }
  | { t: "BASELINE"; path: string; content: string }
  | { t: "MARK_SAVED"; path: string }
  | { t: "SELECT"; path: string }
  | { t: "CLOSE"; path: string }
  | { t: "VIEW_MODE"; mode: ViewMode }
  | { t: "TOGGLE_SCRIPTS" };

const initial: ViewerState = {
  folder: null,
  openDocs: [],
  activePath: null,
  viewMode: "rich",
  htmlAllowScripts: false,
};

function reducer(s: ViewerState, a: Action): ViewerState {
  switch (a.t) {
    case "OPEN_FOLDER":
      return { ...s, folder: { root: a.root, tree: a.tree } };

    case "DOC_START": {
      // 이미 열려 있으면 포커스만
      if (s.openDocs.some((d) => d.path === a.path)) {
        return { ...s, activePath: a.path };
      }
      const kind = kindOf(a.path) ?? "markdown";
      const doc: OpenDoc = {
        path: a.path,
        name: basename(a.path),
        kind,
        content: "",
        saved: "",
        status: "loading",
      };
      return { ...s, openDocs: [...s.openDocs, doc], activePath: a.path };
    }

    case "DOC_DONE":
      return {
        ...s,
        openDocs: s.openDocs.map((d) =>
          d.path === a.path
            ? { ...d, content: a.content, saved: a.content, status: "ready" }
            : d,
        ),
      };

    case "DOC_FAIL":
      return {
        ...s,
        openDocs: s.openDocs.map((d) =>
          d.path === a.path ? { ...d, status: "error", error: a.error } : d,
        ),
      };

    case "EDIT":
      return {
        ...s,
        openDocs: s.openDocs.map((d) =>
          d.path === a.path ? { ...d, content: a.content } : d,
        ),
      };

    // 에디터가 정규화한 마크다운을 기준선으로 (content=saved) → 거짓 dirty 제거
    case "BASELINE":
      return {
        ...s,
        openDocs: s.openDocs.map((d) =>
          d.path === a.path
            ? { ...d, content: a.content, saved: a.content }
            : d,
        ),
      };

    case "MARK_SAVED":
      return {
        ...s,
        openDocs: s.openDocs.map((d) =>
          d.path === a.path ? { ...d, saved: d.content } : d,
        ),
      };

    case "SELECT":
      return { ...s, activePath: a.path };

    case "CLOSE": {
      const idx = s.openDocs.findIndex((d) => d.path === a.path);
      const openDocs = s.openDocs.filter((d) => d.path !== a.path);
      let activePath = s.activePath;
      if (s.activePath === a.path) {
        const next = openDocs[idx] ?? openDocs[idx - 1] ?? null;
        activePath = next ? next.path : null;
      }
      return { ...s, openDocs, activePath };
    }

    case "VIEW_MODE":
      return { ...s, viewMode: a.mode };

    case "TOGGLE_SCRIPTS":
      return { ...s, htmlAllowScripts: !s.htmlAllowScripts };
  }
}

interface DocCtx extends ViewerState {
  activeDoc: OpenDoc | null;
  openFilesDialog: () => Promise<void>;
  openFolderDialog: () => Promise<void>;
  openPaths: (paths: string[]) => Promise<void>;
  edit: (path: string, content: string) => void;
  setBaseline: (path: string, content: string) => void;
  save: (path: string, content?: string) => Promise<void>;
  select: (path: string) => void;
  close: (path: string) => void;
  closeActive: () => void;
  selectNext: () => void;
  selectPrev: () => void;
  selectByIndex: (i: number) => void;
  setViewMode: (m: ViewMode) => void;
  toggleScripts: () => void;
  recentFiles: string[];
  refreshFolder: () => Promise<void>;
  // 마크다운 에디터가 최신값 getter 를 등록 → 저장 시 디바운스 유실 방지
  registerEditor: (path: string, getMarkdown: () => string) => void;
}

const Ctx = createContext<DocCtx | null>(null);

const RECENT_KEY = "devkit.recent.v1";

export function DocProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);

  const [recentFiles, setRecentFiles] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(recentFiles));
    } catch {
      /* ignore */
    }
  }, [recentFiles]);

  const loadDoc = useCallback(async (path: string) => {
    // 실제 파일(다이얼로그/폴더/파일연결)만 최근에 기록 (테스트 URL 제외)
    if (/[\\/]/.test(path) && !path.startsWith("/samples/")) {
      setRecentFiles((prev) => [path, ...prev.filter((p) => p !== path)].slice(0, 20));
    }
    dispatch({ t: "DOC_START", path });
    const kind = kindOf(path);
    // 이미지·영상은 바이너리 → 텍스트로 읽지 않고 경로만 (뷰어가 asset 로 렌더)
    if (kind && !isTextKind(kind)) {
      dispatch({ t: "DOC_DONE", path, content: "" });
      return;
    }
    try {
      const content = await readDoc(path);
      dispatch({ t: "DOC_DONE", path, content });
    } catch (e) {
      dispatch({ t: "DOC_FAIL", path, error: (e as Error).message });
    }
  }, []);

  const openPaths = useCallback(
    async (paths: string[]) => {
      for (const p of paths) {
        if (kindOf(p)) await loadDoc(p);
      }
    },
    [loadDoc],
  );

  const openFilesDialog = useCallback(async () => {
    const paths = await pickFiles();
    await openPaths(paths);
  }, [openPaths]);

  const unwatchRef = useRef<(() => void) | null>(null);
  useEffect(() => () => unwatchRef.current?.(), []);

  const openFolderDialog = useCallback(async () => {
    const root = await pickFolder();
    if (!root) return;
    const tree = await listDocs(root);
    dispatch({ t: "OPEN_FOLDER", root, tree });
    // 폴더 자동 동기화: 변경 시 재스캔
    unwatchRef.current?.();
    unwatchRef.current = await watchFolder(root, async () => {
      const t = await listDocs(root);
      dispatch({ t: "OPEN_FOLDER", root, tree: t });
    });
  }, []);

  const folderRoot = state.folder?.root;
  const refreshFolder = useCallback(async () => {
    if (!folderRoot) return;
    const tree = await listDocs(folderRoot);
    dispatch({ t: "OPEN_FOLDER", root: folderRoot, tree });
  }, [folderRoot]);

  // 활성 마크다운 에디터의 최신값 getter (디바운스 미반영분까지 flush)
  const editorFlushRef = useRef<{ path: string; get: () => string } | null>(
    null,
  );
  const registerEditor = useCallback(
    (path: string, get: () => string) => {
      editorFlushRef.current = { path, get };
    },
    [],
  );

  const save = useCallback(
    async (path: string, contentOverride?: string) => {
      const doc = state.openDocs.find((d) => d.path === path);
      if (!doc) return;
      let content = contentOverride ?? doc.content;
      // 마크다운은 에디터 실시간값을 우선 (Ctrl+S 가 디바운스 옛 값을 쓰는 유실 방지)
      const fl = editorFlushRef.current;
      if (contentOverride === undefined && doc.kind === "markdown" && fl?.path === path) {
        try {
          content = fl.get();
        } catch {
          /* ignore */
        }
      }
      await writeDoc(path, content);
      // 미반영된 최신 내용을 저장한 경우 상태도 동기화
      if (content !== doc.content) {
        dispatch({ t: "EDIT", path, content });
      }
      dispatch({ t: "MARK_SAVED", path });
    },
    [state.openDocs],
  );

  // 미저장 변경이 있으면 닫기 전 확인
  const close = useCallback(
    (path: string) => {
      const doc = state.openDocs.find((d) => d.path === path);
      if (doc && doc.content !== doc.saved) {
        const ok = window.confirm(
          `저장하지 않은 변경이 있어요.\n"${doc.name}" 을(를) 저장하지 않고 닫을까요?`,
        );
        if (!ok) return;
      }
      dispatch({ t: "CLOSE", path });
    },
    [state.openDocs],
  );

  const closeActive = useCallback(() => {
    if (state.activePath) close(state.activePath);
  }, [state.activePath, close]);

  const selectByIndex = useCallback(
    (i: number) => {
      const d = state.openDocs[i];
      if (d) dispatch({ t: "SELECT", path: d.path });
    },
    [state.openDocs],
  );

  const selectRelative = useCallback(
    (delta: number) => {
      const n = state.openDocs.length;
      if (n === 0) return;
      const cur = state.openDocs.findIndex((d) => d.path === state.activePath);
      const next = ((cur < 0 ? 0 : cur) + delta + n) % n;
      dispatch({ t: "SELECT", path: state.openDocs[next].path });
    },
    [state.openDocs, state.activePath],
  );
  const selectNext = useCallback(() => selectRelative(1), [selectRelative]);
  const selectPrev = useCallback(() => selectRelative(-1), [selectRelative]);

  const value = useMemo<DocCtx>(
    () => ({
      ...state,
      activeDoc:
        state.openDocs.find((d) => d.path === state.activePath) ?? null,
      openFilesDialog,
      openFolderDialog,
      openPaths,
      edit: (path, content) => dispatch({ t: "EDIT", path, content }),
      setBaseline: (path, content) =>
        dispatch({ t: "BASELINE", path, content }),
      save,
      select: (path) => dispatch({ t: "SELECT", path }),
      close,
      closeActive,
      selectNext,
      selectPrev,
      selectByIndex,
      setViewMode: (mode) => dispatch({ t: "VIEW_MODE", mode }),
      toggleScripts: () => dispatch({ t: "TOGGLE_SCRIPTS" }),
      recentFiles,
      refreshFolder,
      registerEditor,
    }),
    [
      state,
      openFilesDialog,
      openFolderDialog,
      openPaths,
      save,
      close,
      closeActive,
      selectNext,
      selectPrev,
      selectByIndex,
      recentFiles,
      refreshFolder,
      registerEditor,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDocs(): DocCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useDocs must be used within DocProvider");
  return c;
}
