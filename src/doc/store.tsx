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
  readBinary,
  readDoc,
  watchFolder,
  writeBinary,
  writeDoc,
} from "./fs";
import {
  type OpenDoc,
  type TreeNode,
  type ViewMode,
  type ViewerState,
  basename,
  isEditableDoc,
  isTextKind,
  kindOf,
} from "./types";
import { usePrefs } from "../workspace/prefs";

type Action =
  | { t: "OPEN_FOLDER"; root: string; tree: TreeNode[] }
  | { t: "DOC_START"; path: string; loadId: number }
  | { t: "DOC_DONE"; path: string; loadId: number; content: string }
  | { t: "DOC_FAIL"; path: string; loadId: number; error: string }
  | { t: "EDIT"; path: string; content: string }
  | { t: "BASELINE"; path: string; content: string }
  | { t: "MARK_SAVED"; path: string; content: string }
  | { t: "SHEET_SAVED"; path: string; draft: string }
  | { t: "SELECT"; path: string }
  | { t: "CLOSE"; path: string }
  | { t: "VIEW_MODE"; mode: ViewMode };

const initial: ViewerState = {
  folder: null,
  openDocs: [],
  activePath: null,
  viewMode: "rich",
};

function reducer(s: ViewerState, a: Action): ViewerState {
  switch (a.t) {
    case "OPEN_FOLDER":
      return { ...s, folder: { root: a.root, tree: a.tree } };

    case "DOC_START": {
      // 이미 열려 있으면 포커스만
      if (s.openDocs.some((d) => d.path === a.path)) {
        return {
          ...s,
          activePath: a.path,
          openDocs: s.openDocs.map((d) =>
            d.path === a.path && d.status === "loading"
              ? { ...d, loadId: a.loadId }
              : d,
          ),
        };
      }
      const kind = kindOf(a.path) ?? "markdown";
      const doc: OpenDoc = {
        path: a.path,
        name: basename(a.path),
        kind,
        content: "",
        saved: "",
        status: "loading",
        loadId: a.loadId,
      };
      return { ...s, openDocs: [...s.openDocs, doc], activePath: a.path };
    }

    case "DOC_DONE":
      return {
        ...s,
        openDocs: s.openDocs.map((d) =>
          d.path === a.path && d.loadId === a.loadId
            ? { ...d, content: a.content, saved: a.content, status: "ready" }
            : d,
        ),
      };

    case "DOC_FAIL":
      return {
        ...s,
        openDocs: s.openDocs.map((d) =>
          d.path === a.path && d.loadId === a.loadId
            ? { ...d, status: "error", error: a.error }
            : d,
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
          d.path === a.path ? { ...d, saved: a.content } : d,
        ),
      };

    case "SHEET_SAVED":
      return {
        ...s,
        openDocs: s.openDocs.map((d) =>
          d.path === a.path && d.content === a.draft
            ? { ...d, content: "", saved: "" }
            : d,
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

  }
}

interface DocCtx extends ViewerState {
  activeDoc: OpenDoc | null;
  openFilesDialog: () => Promise<void>;
  openFolderDialog: () => Promise<void>;
  openFolderRoot: (root: string) => Promise<void>;
  openPaths: (paths: string[]) => Promise<void>;
  edit: (path: string, content: string) => void;
  setBaseline: (path: string, content: string) => void;
  save: (path: string, content?: string) => Promise<void>;
  select: (path: string) => void;
  close: (path: string) => boolean;
  closePaths: (paths: string[]) => boolean;
  closeActive: () => void;
  selectNext: () => void;
  selectPrev: () => void;
  selectByIndex: (i: number) => void;
  setViewMode: (m: ViewMode) => void;
  recentFiles: string[];
  refreshFolder: () => Promise<void>;
  hasUnsavedChanges: () => boolean;
  hasPendingSaves: () => boolean;
  sessionRestored: boolean;
  // 마크다운 에디터가 최신값 getter 를 등록 → 저장 시 디바운스 유실 방지
  registerEditor: (path: string, getMarkdown: () => string) => () => void;
}

const Ctx = createContext<DocCtx | null>(null);

const RECENT_KEY = "devkit.recent.v1";
const SESSION_KEY = "devkit.session.v1";

export function DocProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const [sessionRestored, setSessionRestored] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const autosaveOn = usePrefs().autosave;
  const saveQueueRef = useRef(new Map<string, Promise<void>>());
  const ownWritesRef = useRef(new Map<string, number>());
  const watchGenerationRef = useRef(0);
  const loadIdRef = useRef(0);
  // 닫기 직후 남아 있던 autosave 콜백이 파일을 다시 만들지 못하게 한다.
  const closedPathsRef = useRef(new Set<string>());

  const editorFlushRef = useRef<{ path: string; get: () => string } | null>(
    null,
  );
  const registerEditor = useCallback(
    (path: string, get: () => string) => {
      const entry = { path, get };
      editorFlushRef.current = entry;
      return () => {
        if (editorFlushRef.current === entry) editorFlushRef.current = null;
      };
    },
    [],
  );
  const flushEditor = useCallback((path: string): string | undefined => {
    const doc = stateRef.current.openDocs.find((item) => item.path === path);
    if (!doc) return undefined;
    const editor = editorFlushRef.current;
    if (editor?.path !== path) return doc.content;
    try {
      const content = editor.get();
      if (content !== doc.content) dispatch({ t: "EDIT", path, content });
      return content;
    } catch {
      return doc.content;
    }
  }, []);
  const flushActiveEditor = useCallback(() => {
    const path = stateRef.current.activePath;
    if (path) flushEditor(path);
  }, [flushEditor]);

  const [recentFiles, setRecentFiles] = useState<string[]>(() => {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
      return Array.isArray(value)
        ? value.filter((path): path is string => typeof path === "string").slice(0, 20)
        : [];
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

  const rememberRecent = useCallback((path: string) => {
    if (!/[\\/]/.test(path) || path.startsWith("/samples/")) return;
    setRecentFiles((prev) => [path, ...prev.filter((item) => item !== path)].slice(0, 20));
  }, []);

  const loadDoc = useCallback(async (path: string) => {
    if (stateRef.current.openDocs.some((d) => d.path === path)) {
      flushActiveEditor();
      dispatch({ t: "SELECT", path });
      rememberRecent(path);
      return;
    }
    closedPathsRef.current.delete(path);
    // 같은 파일 저장 중 재열기는 디스크 반영이 끝난 뒤 읽는다.
    await saveQueueRef.current.get(path)?.catch(() => {});
    flushActiveEditor();
    const loadId = ++loadIdRef.current;
    dispatch({ t: "DOC_START", path, loadId });
    const kind = kindOf(path);
    // 이미지·영상은 바이너리 → 텍스트로 읽지 않고 경로만 (뷰어가 asset 로 렌더)
    if (kind && !isTextKind(kind)) {
      dispatch({ t: "DOC_DONE", path, loadId, content: "" });
      rememberRecent(path);
      return;
    }
    try {
      const content = await readDoc(path);
      dispatch({ t: "DOC_DONE", path, loadId, content });
      rememberRecent(path);
    } catch (e) {
      dispatch({ t: "DOC_FAIL", path, loadId, error: (e as Error).message });
    }
  }, [flushActiveEditor, rememberRecent]);

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

  // 특정 폴더 경로 열기 (다이얼로그·세션복원·DnD 공용)
  const openFolderRoot = useCallback(async (root: string) => {
    const generation = ++watchGenerationRef.current;
    const tree = await listDocs(root);
    if (generation !== watchGenerationRef.current) return;
    dispatch({ t: "OPEN_FOLDER", root, tree });
    // 폴더 자동 동기화: 변경 시 재스캔
    unwatchRef.current?.();
    let scanning = false;
    let pending = false;
    const scan = async () => {
      if (scanning) {
        pending = true;
        return;
      }
      scanning = true;
      try {
        do {
          pending = false;
          const next = await listDocs(root);
          if (generation === watchGenerationRef.current) {
            dispatch({ t: "OPEN_FOLDER", root, tree: next });
          }
        } while (pending && generation === watchGenerationRef.current);
      } catch {
        /* 다음 watcher 이벤트나 수동 새로고침에서 재시도 */
      } finally {
        scanning = false;
      }
    };
    const unwatch = await watchFolder(root, (change) => {
      if (generation !== watchGenerationRef.current || !change.affectsTree) return;
      const now = Date.now();
      for (const [path, writtenAt] of ownWritesRef.current) {
        if (now - writtenAt > 2_000) ownWritesRef.current.delete(path);
      }
      const externalPaths = change.paths.filter((path) => {
        const ownWrite = ownWritesRef.current.get(path);
        const temporary = basename(path).startsWith(".tmp");
        return !temporary && (!ownWrite || now - ownWrite > 2_000);
      });
      if (externalPaths.length) void scan();
    });
    if (generation !== watchGenerationRef.current) {
      unwatch();
      return;
    }
    unwatchRef.current = unwatch;
  }, []);

  const openFolderDialog = useCallback(async () => {
    const root = await pickFolder();
    if (root) await openFolderRoot(root);
  }, [openFolderRoot]);

  // 세션 복원 — 지난번 폴더·열린 문서·활성 탭 (최초 1회)
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    void (async () => {
      try {
        const raw = localStorage.getItem(SESSION_KEY);
        if (!raw) return;
        const value: unknown = JSON.parse(raw);
        if (!value || typeof value !== "object" || Array.isArray(value)) return;
        const s = value as {
          folderRoot?: string;
          openPaths?: string[];
          activePath?: string;
        };
        if (typeof s.folderRoot === "string") {
          await openFolderRoot(s.folderRoot).catch(() => {});
        }
        const paths = Array.isArray(s.openPaths)
          ? s.openPaths.filter((path): path is string => typeof path === "string")
          : [];
        if (paths.length) {
          await openPaths(paths);
          if (typeof s.activePath === "string" && paths.includes(s.activePath)) {
            dispatch({ t: "SELECT", path: s.activePath });
          }
        }
      } catch {
        /* ignore */
      } finally {
        setSessionRestored(true);
      }
    })();
  }, [openFolderRoot, openPaths]);

  // 세션 저장 — 폴더·열린 문서·활성 탭이 바뀔 때마다
  useEffect(() => {
    if (!restoredRef.current) return; // 복원 완료 전엔 저장 안 함
    try {
      localStorage.setItem(
        SESSION_KEY,
        JSON.stringify({
          folderRoot: state.folder?.root,
          openPaths: state.openDocs.map((d) => d.path),
          activePath: state.activePath,
        }),
      );
    } catch {
      /* ignore */
    }
  }, [state.folder?.root, state.openDocs, state.activePath]);

  const folderRoot = state.folder?.root;
  const refreshFolder = useCallback(async () => {
    if (!folderRoot) return;
    const tree = await listDocs(folderRoot);
    dispatch({ t: "OPEN_FOLDER", root: folderRoot, tree });
  }, [folderRoot]);

  const save = useCallback(
    async (path: string, contentOverride?: string) => {
      if (closedPathsRef.current.has(path)) return;
      const doc = stateRef.current.openDocs.find((d) => d.path === path);
      if (!doc || !isEditableDoc(doc.kind, doc.path)) return;

      let run: () => Promise<void>;
      if (doc.kind === "xlsx") {
        const draft = doc.content;
        if (!draft) return;
        run = async () => {
          const source = await readBinary(path);
          const { serializeSpreadsheet } = await import("./xlsxModel");
          const output = serializeSpreadsheet(path, source, draft);
          ownWritesRef.current.set(path, Date.now());
          await writeBinary(path, output);
          dispatch({ t: "SHEET_SAVED", path, draft });
        };
      } else {
        let content = contentOverride ?? doc.content;
        // 에디터(마크다운·소스) 실시간값 우선 (Ctrl+S 가 디바운스 옛 값을 쓰는 유실 방지)
        if (contentOverride === undefined) {
          content = flushEditor(path) ?? content;
        }
        // 저장 시작 전에 flush 값을 상태에 반영한다. 저장 중 새 입력이 들어오면
        // 그 입력이 뒤에 남아 MARK_SAVED 기준과 달라지므로 dirty가 유지된다.
        if (content !== doc.content) {
          dispatch({ t: "EDIT", path, content });
        }
        run = async () => {
          ownWritesRef.current.set(path, Date.now());
          await writeDoc(path, content);
          dispatch({ t: "MARK_SAVED", path, content });
        };
      }

      const previous = saveQueueRef.current.get(path) ?? Promise.resolve();
      const queued = previous.catch(() => {}).then(run);
      saveQueueRef.current.set(path, queued);
      try {
        await queued;
      } finally {
        if (saveQueueRef.current.get(path) === queued) {
          saveQueueRef.current.delete(path);
        }
      }
    },
    [flushEditor],
  );

  // 이름 변경·삭제도 이 경로를 써서 autosave와 파일 조작이 경합하지 않게 한다.
  const closePaths = useCallback(
    (paths: string[]): boolean => {
      const unique = [...new Set(paths)];
      if (!unique.length) return true;
      const saving = unique.find((path) => saveQueueRef.current.has(path));
      if (saving) {
        const name = stateRef.current.openDocs.find((doc) => doc.path === saving)?.name;
        window.alert(`"${name ?? basename(saving)}" 저장이 끝난 뒤 다시 시도해 주세요.`);
        return false;
      }

      const docs = unique
        .map((path) => stateRef.current.openDocs.find((doc) => doc.path === path))
        .filter((doc): doc is OpenDoc => Boolean(doc));
      const dirty = docs.filter(
        (doc) => (flushEditor(doc.path) ?? doc.content) !== doc.saved,
      );
      if (
        dirty.length &&
        !window.confirm(
          dirty.length === 1
            ? `저장하지 않은 변경이 있어요.\n"${dirty[0].name}" 을(를) 저장하지 않고 닫을까요?`
            : `저장하지 않은 문서 ${dirty.length}개를 저장하지 않고 닫을까요?`,
        )
      ) {
        return false;
      }

      for (const path of unique) {
        closedPathsRef.current.add(path);
        dispatch({ t: "CLOSE", path });
      }
      return true;
    },
    [flushEditor],
  );

  const close = useCallback((path: string) => closePaths([path]), [closePaths]);

  const closeActive = useCallback(() => {
    if (state.activePath) close(state.activePath);
  }, [state.activePath, close]);

  const select = useCallback(
    (path: string) => {
      if (path === stateRef.current.activePath) return;
      flushActiveEditor();
      dispatch({ t: "SELECT", path });
    },
    [flushActiveEditor],
  );

  const selectByIndex = useCallback(
    (i: number) => {
      const d = state.openDocs[i];
      if (d) select(d.path);
    },
    [state.openDocs, select],
  );

  const selectRelative = useCallback(
    (delta: number) => {
      const n = state.openDocs.length;
      if (n === 0) return;
      const cur = state.openDocs.findIndex((d) => d.path === state.activePath);
      const next = ((cur < 0 ? 0 : cur) + delta + n) % n;
      select(state.openDocs[next].path);
    },
    [state.openDocs, state.activePath, select],
  );
  const selectNext = useCallback(() => selectRelative(1), [selectRelative]);
  const selectPrev = useCallback(() => selectRelative(-1), [selectRelative]);

  const setViewMode = useCallback(
    (mode: ViewMode) => {
      flushActiveEditor();
      dispatch({ t: "VIEW_MODE", mode });
    },
    [flushActiveEditor],
  );

  const hasUnsavedChanges = useCallback(() => {
    const current = stateRef.current;
    const activeContent = current.activePath
      ? flushEditor(current.activePath)
      : undefined;
    return current.openDocs.some(
      (doc) =>
        !closedPathsRef.current.has(doc.path) &&
        (doc.path === current.activePath
          ? activeContent ?? doc.content
          : doc.content) !== doc.saved,
    );
  }, [flushEditor]);
  const hasPendingSaves = useCallback(() => saveQueueRef.current.size > 0, []);

  // 자동 저장 — 편집 멈추면 1.5s 뒤 dirty 문서 저장
  useEffect(() => {
    if (!autosaveOn) return;
    const dirty = state.openDocs.filter(
      (d) => isTextKind(d.kind) && d.content !== d.saved,
    );
    if (!dirty.length) return;
    const t = setTimeout(() => {
      dirty.forEach((d) => {
        void save(d.path).catch((error: unknown) => {
          window.alert(
            `"${d.name}" 을(를) 자동 저장하지 못했어요.\n${(error as Error).message ?? String(error)}`,
          );
        });
      });
    }, 1500);
    return () => clearTimeout(t);
  }, [state.openDocs, autosaveOn, save]);

  const value = useMemo<DocCtx>(
    () => ({
      ...state,
      activeDoc:
        state.openDocs.find((d) => d.path === state.activePath) ?? null,
      openFilesDialog,
      openFolderDialog,
      openFolderRoot,
      openPaths,
      edit: (path, content) => dispatch({ t: "EDIT", path, content }),
      setBaseline: (path, content) =>
        dispatch({ t: "BASELINE", path, content }),
      save,
      select,
      close,
      closePaths,
      closeActive,
      selectNext,
      selectPrev,
      selectByIndex,
      setViewMode,
      recentFiles,
      refreshFolder,
      hasUnsavedChanges,
      hasPendingSaves,
      sessionRestored,
      registerEditor,
    }),
    [
      state,
      openFilesDialog,
      openFolderDialog,
      openFolderRoot,
      openPaths,
      save,
      select,
      close,
      closePaths,
      closeActive,
      selectNext,
      selectPrev,
      selectByIndex,
      setViewMode,
      recentFiles,
      refreshFolder,
      hasUnsavedChanges,
      hasPendingSaves,
      sessionRestored,
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
