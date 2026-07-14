import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { readBinary } from "./fs";

/** 엑셀 뷰어 — SheetJS 로 시트별 표 렌더 (데이터·표만, 서식·차트 제외) */
export function XlsxView({ path }: { path: string }) {
  const [sheets, setSheets] = useState<{ name: string; html: string }[] | null>(
    null,
  );
  const [active, setActive] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSheets(null);
    setErr(null);
    setActive(0);
    (async () => {
      try {
        const bytes = await readBinary(path);
        const wb = XLSX.read(bytes, { type: "array" });
        const s = wb.SheetNames.map((n) => ({
          name: n,
          html: XLSX.utils.sheet_to_html(wb.Sheets[n], { editable: false }),
        }));
        if (!cancelled) setSheets(s);
      } catch (e) {
        if (!cancelled) setErr((e as Error).message ?? String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (err) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-rose">
        엑셀 열기 실패: {err}
      </div>
    );
  }
  if (!sheets) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-faint">
        불러오는 중…
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {sheets.length > 1 && (
        <div
          role="tablist"
          aria-label="시트"
          className="flex gap-px overflow-x-auto border-b border-line-soft bg-bg-deep/40 px-2"
        >
          {sheets.map((s, i) => (
            <button
              key={s.name}
              type="button"
              role="tab"
              aria-selected={active === i}
              onClick={() => setActive(i)}
              className={`shrink-0 px-3 py-1.5 font-mono text-xs transition-colors ${
                active === i ? "text-fg" : "text-muted hover:text-fg"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      <div className="xlsx-sheet min-h-0 flex-1 overflow-auto p-4">
        {/* SheetJS 가 만든 표 HTML (로컬 파싱, 신뢰 소스) */}
        {/* eslint-disable-next-line react/no-danger */}
        <div dangerouslySetInnerHTML={{ __html: sheets[active]?.html ?? "" }} />
      </div>
    </div>
  );
}
