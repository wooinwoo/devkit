import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
} from "react";
import { listDocs, pickFiles, pickFolder, readDoc, writeDoc } from "./fs";
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
  save: (path: string) => Promise<void>;
  select: (path: string) => void;
  close: (path: string) => void;
  setViewMode: (m: ViewMode) => void;
  toggleScripts: () => void;
}

const Ctx = createContext<DocCtx | null>(null);

export function DocProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);

  const loadDoc = useCallback(async (path: string) => {
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

  const openFolderDialog = useCallback(async () => {
    const root = await pickFolder();
    if (!root) return;
    const tree = await listDocs(root);
    dispatch({ t: "OPEN_FOLDER", root, tree });
  }, []);

  const save = useCallback(
    async (path: string) => {
      const doc = state.openDocs.find((d) => d.path === path);
      if (!doc) return;
      await writeDoc(path, doc.content);
      dispatch({ t: "MARK_SAVED", path });
    },
    [state.openDocs],
  );

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
      close: (path) => dispatch({ t: "CLOSE", path }),
      setViewMode: (mode) => dispatch({ t: "VIEW_MODE", mode }),
      toggleScripts: () => dispatch({ t: "TOGGLE_SCRIPTS" }),
    }),
    [state, openFilesDialog, openFolderDialog, openPaths, save],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDocs(): DocCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useDocs must be used within DocProvider");
  return c;
}
