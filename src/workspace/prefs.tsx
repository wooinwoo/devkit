import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type DocWidth = "narrow" | "normal" | "wide" | "full";
export type Theme = "light" | "dark" | "system";

export interface UiPrefs {
  sidebarCollapsed: boolean;
  sidebarWidth: number; // px
  sidebarTab: "files" | "outline";
  zoom: number; // 0.8 ~ 2.4 (컨텐츠만)
  docWidth: DocWidth; // 마크다운 본문 좌우 폭
  focus: boolean; // 집중 모드 (크롬 숨김)
  collapsedDirs: string[]; // 파일트리에서 접어둔 폴더 경로 (재스캔에도 유지)
  theme: Theme; // 라이트/다크/시스템
  autosave: boolean; // 편집 후 자동 저장
}

const DEFAULTS: UiPrefs = {
  sidebarCollapsed: false,
  sidebarWidth: 260,
  sidebarTab: "files",
  zoom: 1,
  docWidth: "normal",
  focus: false,
  collapsedDirs: [],
  theme: "system",
  autosave: true,
};

/** 마크다운 본문 max-width (CSS 값). full 은 제한 없음 */
export const DOC_WIDTH_CSS: Record<DocWidth, string> = {
  narrow: "34rem",
  normal: "46rem",
  wide: "62rem",
  full: "100%",
};

const KEY = "devkit.prefs.v1";
export const SIDEBAR_MIN = 200;
export const SIDEBAR_MAX = 460;
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2.4;
export const ZOOM_STEP = 0.1;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

function load(): UiPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    const value: unknown = raw ? JSON.parse(raw) : null;
    if (!value || typeof value !== "object" || Array.isArray(value)) return DEFAULTS;
    const saved = value as Partial<UiPrefs>;
    return {
      sidebarCollapsed:
        typeof saved.sidebarCollapsed === "boolean"
          ? saved.sidebarCollapsed
          : DEFAULTS.sidebarCollapsed,
      sidebarWidth:
        typeof saved.sidebarWidth === "number" && Number.isFinite(saved.sidebarWidth)
          ? clamp(saved.sidebarWidth, SIDEBAR_MIN, SIDEBAR_MAX)
          : DEFAULTS.sidebarWidth,
      sidebarTab: saved.sidebarTab === "outline" ? "outline" : "files",
      zoom:
        typeof saved.zoom === "number" && Number.isFinite(saved.zoom)
          ? clamp(saved.zoom, ZOOM_MIN, ZOOM_MAX)
          : DEFAULTS.zoom,
      docWidth: ["narrow", "normal", "wide", "full"].includes(saved.docWidth ?? "")
        ? saved.docWidth as DocWidth
        : DEFAULTS.docWidth,
      focus: typeof saved.focus === "boolean" ? saved.focus : DEFAULTS.focus,
      collapsedDirs: Array.isArray(saved.collapsedDirs)
        ? saved.collapsedDirs.filter((path): path is string => typeof path === "string")
        : [],
      theme: ["light", "dark", "system"].includes(saved.theme ?? "")
        ? saved.theme as Theme
        : DEFAULTS.theme,
      autosave:
        typeof saved.autosave === "boolean" ? saved.autosave : DEFAULTS.autosave,
    };
  } catch {
    /* ignore */
  }
  return DEFAULTS;
}

interface PrefsCtx extends UiPrefs {
  set: <K extends keyof UiPrefs>(k: K, v: UiPrefs[K]) => void;
  toggleSidebar: () => void;
  toggleFocus: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomReset: () => void;
  toggleDir: (path: string, collapsed: boolean) => void;
}

const Ctx = createContext<PrefsCtx | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<UiPrefs>(load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch {
      /* ignore */
    }
  }, [prefs]);

  // 테마를 <html> 에 반영 (system 이면 OS 설정 따름)
  useEffect(() => {
    const root = document.documentElement;
    if (prefs.theme === "system") {
      root.removeAttribute("data-theme");
      root.style.colorScheme = "light dark";
    } else {
      root.setAttribute("data-theme", prefs.theme);
      root.style.colorScheme = prefs.theme;
    }
  }, [prefs.theme]);

  const set = useCallback(
    <K extends keyof UiPrefs>(k: K, v: UiPrefs[K]) =>
      setPrefs((p) => ({ ...p, [k]: v })),
    [],
  );

  const value = useMemo<PrefsCtx>(
    () => ({
      ...prefs,
      set,
      toggleSidebar: () =>
        setPrefs((p) => ({ ...p, sidebarCollapsed: !p.sidebarCollapsed })),
      toggleFocus: () => setPrefs((p) => ({ ...p, focus: !p.focus })),
      zoomIn: () =>
        setPrefs((p) => ({ ...p, zoom: clamp(p.zoom + ZOOM_STEP, ZOOM_MIN, ZOOM_MAX) })),
      zoomOut: () =>
        setPrefs((p) => ({ ...p, zoom: clamp(p.zoom - ZOOM_STEP, ZOOM_MIN, ZOOM_MAX) })),
      zoomReset: () => setPrefs((p) => ({ ...p, zoom: 1 })),
      toggleDir: (path, collapsed) =>
        setPrefs((p) => {
          const s = new Set(p.collapsedDirs);
          if (collapsed) s.add(path);
          else s.delete(path);
          return { ...p, collapsedDirs: [...s] };
        }),
    }),
    [prefs, set],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePrefs(): PrefsCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePrefs must be used within WorkspaceProvider");
  return c;
}

export { clamp };
