import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export interface UiPrefs {
  sidebarCollapsed: boolean;
  sidebarWidth: number; // px
  sidebarTab: "files" | "outline";
  zoom: number; // 0.8 ~ 1.8
  focus: boolean; // 집중 모드 (크롬 숨김)
}

const DEFAULTS: UiPrefs = {
  sidebarCollapsed: false,
  sidebarWidth: 260,
  sidebarTab: "files",
  zoom: 1,
  focus: false,
};

const KEY = "devkit.prefs.v1";
export const SIDEBAR_MIN = 200;
export const SIDEBAR_MAX = 460;
export const ZOOM_MIN = 0.8;
export const ZOOM_MAX = 1.8;
export const ZOOM_STEP = 0.1;

function load(): UiPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
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
}

const Ctx = createContext<PrefsCtx | null>(null);

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<UiPrefs>(load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch {
      /* ignore */
    }
  }, [prefs]);

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
