import { useState } from "react";
import { CronTool } from "./tools/CronTool";
import { HtmlTool } from "./tools/HtmlTool";

type ToolId = "cron" | "html";

const TOOLS: { id: ToolId; label: string; hint: string }[] = [
  { id: "cron", label: "Cron", hint: "크론 표현식" },
  { id: "html", label: "HTML", hint: "라이브 뷰어" },
];

export function App() {
  const [active, setActive] = useState<ToolId>("cron");

  return (
    <div className="flex h-svh overflow-hidden">
      <aside className="flex w-52 shrink-0 flex-col border-r border-line-soft bg-bg-deep/60">
        <div className="px-5 py-6">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md bg-fg font-mono text-sm font-bold text-bg">
              d
            </span>
            <span className="font-bold tracking-tight text-fg">devkit</span>
          </div>
          <p className="mt-1 font-mono text-[10px] tracking-wide text-faint">
            local dev utilities
          </p>
        </div>

        <nav className="flex flex-col gap-1 px-3">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActive(t.id)}
              aria-current={active === t.id}
              className={`flex flex-col items-start rounded-lg px-3 py-2.5 text-left transition-colors ${
                active === t.id
                  ? "bg-surface text-fg"
                  : "text-muted hover:bg-surface/60 hover:text-fg"
              }`}
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                {active === t.id && (
                  <span aria-hidden className="size-1.5 rounded-full bg-accent" />
                )}
                {t.label}
              </span>
              <span className="font-mono text-[10px] text-faint">{t.hint}</span>
            </button>
          ))}
        </nav>

        <footer className="mt-auto px-5 py-4">
          <p className="font-mono text-[10px] leading-relaxed text-faint">
            by wooinwoo
            <br />
            Tauri · React · 오프라인
          </p>
        </footer>
      </aside>

      <main className="min-w-0 flex-1 overflow-auto p-6 sm:p-10">
        {active === "cron" ? <CronTool /> : <HtmlTool />}
      </main>
    </div>
  );
}
