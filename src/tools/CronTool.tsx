import { useMemo, useState } from "react";
import { FIELDS, nextRuns, parseCron, type ParsedField } from "../cron";
import { describe } from "../describe";

const PRESETS: { expr: string; hint: string }[] = [
  { expr: "*/5 * * * *", hint: "5분마다" },
  { expr: "0 9 * * 1-5", hint: "평일 오전 9시" },
  { expr: "0 0 * * 0", hint: "매주 일요일 자정" },
  { expr: "30 2 1 * *", hint: "매월 1일 새벽 2:30" },
  { expr: "0 */6 * * *", hint: "6시간마다" },
  { expr: "0 18 * * 5", hint: "매주 금요일 오후 6시" },
];

function fmtRun(d: Date): { date: string; time: string; rel: string } {
  const now = new Date();
  const mins = Math.round((d.getTime() - now.getTime()) / 60000);
  let rel: string;
  if (mins < 60) rel = `${mins}분 후`;
  else if (mins < 60 * 24) rel = `${Math.round(mins / 60)}시간 후`;
  else rel = `${Math.round(mins / (60 * 24))}일 후`;
  const wd = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
  return {
    date: `${d.getMonth() + 1}월 ${d.getDate()}일 (${wd})`,
    time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
    rel,
  };
}

function summarize(f: ParsedField, min: number, max: number): string {
  if (f.isEvery) return "매";
  if (f.values.length === 1) return String(f.values[0]);
  if (f.values.length > 6 && f.values[0] === min && f.values.at(-1)! >= max - 1)
    return `${f.values[0]}~${f.values.at(-1)}`;
  if (f.values.length > 4) return `${f.values.length}개`;
  return f.values.join(",");
}

export function CronTool() {
  const [expr, setExpr] = useState("0 9 * * 1-5");
  const result = useMemo(() => parseCron(expr), [expr]);
  const runs = useMemo(
    () => (result.ok ? nextRuns(result.fields, new Date(), 5) : []),
    [result],
  );

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-fg">
          cron<span className="text-accent">to</span>
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          크론 표현식을 사람의 말과 다음 실행 시각으로. 파서는 직접 만들었어요.
        </p>
      </header>

      <div
        className={`overflow-hidden rounded-2xl border bg-surface transition-colors ${
          result.ok ? "border-line-soft" : "border-rose"
        }`}
      >
        <div className="border-b border-line-soft px-4 py-2.5">
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-faint">
            crontab
          </span>
        </div>
        <label htmlFor="cron-input" className="sr-only">
          크론 표현식
        </label>
        <input
          id="cron-input"
          value={expr}
          onChange={(e) => setExpr(e.target.value)}
          spellCheck={false}
          autoComplete="off"
          className="w-full bg-transparent px-5 py-6 text-center font-mono text-2xl tracking-wide text-fg outline-none placeholder:text-faint"
          placeholder="분 시 일 월 요일"
          aria-invalid={!result.ok}
          aria-describedby="cron-status"
        />
      </div>

      <div className="mt-3 grid grid-cols-5 gap-2">
        {FIELDS.map((spec, i) => {
          const f = result.ok ? result.fields[i] : null;
          const isErr = !result.ok && result.fieldIndex === i;
          return (
            <div
              key={spec.kind}
              className={`rounded-xl border px-2 py-3 text-center ${
                isErr ? "border-rose bg-rose/5" : "border-line-soft bg-bg-deep/50"
              }`}
            >
              <div className="font-mono text-lg font-semibold text-fg">
                {f ? summarize(f, spec.min, spec.max) : "—"}
              </div>
              <div className="mt-1 text-xs text-muted">{spec.label}</div>
              <div className="font-mono text-[10px] text-faint">
                {spec.min}–{spec.max}
              </div>
            </div>
          );
        })}
      </div>

      <div id="cron-status" aria-live="polite" className="mt-7">
        {result.ok ? (
          <p className="border-l-2 border-accent pl-4 text-xl font-semibold leading-snug text-fg">
            {describe(result.fields)}
          </p>
        ) : (
          <p className="border-l-2 border-rose pl-4 text-[15px] leading-relaxed text-rose">
            {result.error}
          </p>
        )}
      </div>

      {result.ok && (
        <section className="mt-9">
          <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.16em] text-faint">
            다음 실행 — 로컬 타임존
          </p>
          <ol className="flex flex-col">
            {runs.map((d, i) => {
              const r = fmtRun(d);
              return (
                <li
                  key={d.toISOString()}
                  className="flex items-baseline justify-between border-t border-line-soft py-3 last:border-b"
                >
                  <span className="flex items-baseline gap-3">
                    <span className="font-mono text-xs text-faint">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="text-text">{r.date}</span>
                    <span className="font-mono text-lg font-semibold text-fg">
                      {r.time}
                    </span>
                  </span>
                  <span className="font-mono text-xs text-muted">{r.rel}</span>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <section className="mt-10">
        <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.16em] text-faint">
          자주 쓰는 패턴
        </p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.expr}
              type="button"
              onClick={() => setExpr(p.expr)}
              className="flex items-center gap-2 rounded-full border border-line-soft bg-surface px-3.5 py-1.5 transition-colors hover:border-fg"
            >
              <span className="font-mono text-xs text-fg">{p.expr}</span>
              <span className="text-xs text-muted">{p.hint}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
