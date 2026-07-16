import { useEffect } from "react";
import {
  type DocWidth,
  type Theme,
  usePrefs,
} from "../workspace/prefs";

const THEMES: { id: Theme; label: string }[] = [
  { id: "system", label: "시스템" },
  { id: "light", label: "라이트" },
  { id: "dark", label: "다크" },
];
const WIDTHS: { id: DocWidth; label: string }[] = [
  { id: "narrow", label: "좁게" },
  { id: "normal", label: "기본" },
  { id: "wide", label: "넓게" },
  { id: "full", label: "전체" },
];
const SHORTCUTS: [string, string][] = [
  ["파일 열기", "Ctrl+O"],
  ["저장", "Ctrl+S"],
  ["빠른 이동 · 명령", "Ctrl+K"],
  ["찾기 (소스)", "Ctrl+F"],
  ["탭 닫기", "Ctrl+W"],
  ["탭 전환", "Ctrl+Tab"],
  ["탭 1~9 선택", "Ctrl+1~9"],
  ["컨텐츠 확대·축소", "Ctrl+± · Ctrl+휠"],
  ["사이드바 접기", "Ctrl+B"],
  ["집중 모드", "F8"],
  ["설정", "Ctrl+,"],
];

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex overflow-hidden rounded-lg border border-line-soft">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          className={`flex-1 px-3 py-1.5 font-mono text-xs transition-colors ${
            value === o.id ? "bg-fg text-bg" : "text-muted hover:text-fg"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { theme, docWidth, autosave, set } = usePrefs();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-fg/20 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="설정"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-line-soft bg-bg shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-line-soft px-5 py-3">
          <h2 className="font-bold text-fg">설정</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex size-6 items-center justify-center rounded text-faint hover:text-fg"
          >
            ×
          </button>
        </div>

        <div className="flex flex-col gap-5 overflow-auto p-5">
          <section className="flex flex-col gap-2">
            <span className="font-mono text-[11px] uppercase tracking-wide text-faint">
              테마
            </span>
            <Segmented
              value={theme}
              options={THEMES}
              onChange={(v) => set("theme", v)}
            />
          </section>

          <section className="flex flex-col gap-2">
            <span className="font-mono text-[11px] uppercase tracking-wide text-faint">
              마크다운 본문 폭
            </span>
            <Segmented
              value={docWidth}
              options={WIDTHS}
              onChange={(v) => set("docWidth", v)}
            />
          </section>

          <section className="flex items-center justify-between">
            <span className="text-[13px] text-text">자동 저장</span>
            <button
              type="button"
              role="switch"
              aria-checked={autosave}
              onClick={() => set("autosave", !autosave)}
              className={`relative h-5 w-9 rounded-full transition-colors ${
                autosave ? "bg-accent" : "bg-line-strong"
              }`}
            >
              <span
                className={`absolute top-0.5 size-4 rounded-full bg-white transition-transform ${
                  autosave ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </button>
          </section>

          <section className="flex flex-col gap-1.5">
            <span className="font-mono text-[11px] uppercase tracking-wide text-faint">
              단축키
            </span>
            <ul className="flex flex-col gap-1">
              {SHORTCUTS.map(([label, key]) => (
                <li
                  key={label}
                  className="flex items-center justify-between text-[13px] text-text"
                >
                  <span>{label}</span>
                  <kbd className="rounded border border-line-soft bg-bg-deep px-1.5 py-0.5 font-mono text-[11px] text-muted">
                    {key}
                  </kbd>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
