import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { readBinary } from "./fs";

const MAX_ROWS = 5000; // 뷰어 성능 상한

/** CSV/TSV 텍스트 디코딩 — UTF-8 시도 후 깨짐(U+FFFD) 많으면 EUC-KR(CP949) 폴백.
 *  관공서·윈도우 엑셀이 저장한 한글 CSV 는 대개 CP949 라 그냥 UTF-8 로 읽으면 전부 깨진다. */
function decodeCsv(bytes: Uint8Array): string {
  // BOM 이면 UTF-8 확정
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes);
  }
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  const bad = (utf8.match(/�/g)?.length ?? 0) / Math.max(1, utf8.length);
  if (bad < 0.002) return utf8; // 치환문자 거의 없으면 UTF-8
  try {
    const euc = new TextDecoder("euc-kr").decode(bytes);
    const eucBad = (euc.match(/�/g)?.length ?? 0) / Math.max(1, euc.length);
    // EUC-KR 이 덜 깨지면 그쪽 채택
    return eucBad < bad ? euc : utf8;
  } catch {
    return utf8;
  }
}

interface Sheet {
  name: string;
  rows: string[][]; // 표시용 문자열 (raw:false)
  nums: boolean[][]; // 셀이 숫자인지 (우측 정렬용)
  cols: number; // 최대 열 수
  truncated: boolean;
}

function buildSheet(name: string, ws: XLSX.WorkSheet): Sheet {
  const disp = XLSX.utils.sheet_to_json<string[]>(ws, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: true,
  });
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    raw: true,
    defval: "",
    blankrows: true,
  });
  const truncated = disp.length > MAX_ROWS;
  const rows = (truncated ? disp.slice(0, MAX_ROWS) : disp).map((r) =>
    (r ?? []).map((c) => (c == null ? "" : String(c))),
  );
  const nums = (truncated ? rawRows.slice(0, MAX_ROWS) : rawRows).map((r) =>
    (r ?? []).map((c) => typeof c === "number"),
  );
  const cols = rows.reduce((m, r) => Math.max(m, r.length), 1);
  return { name, rows, nums, cols, truncated };
}

/** 엑셀·CSV·TSV 뷰어 — SheetJS 로 시트별 표 렌더 (읽기 전용, 서식·차트 제외) */
export function XlsxView({ path, zoom = 1 }: { path: string; zoom?: number }) {
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
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
        const ext = path.split(".").pop()?.toLowerCase();
        let wb: XLSX.WorkBook;
        if (ext === "csv" || ext === "tsv") {
          const text = decodeCsv(bytes);
          wb = XLSX.read(text, { type: "string", FS: ext === "tsv" ? "\t" : "," });
        } else {
          wb = XLSX.read(bytes, { type: "array" });
        }
        const s = wb.SheetNames.map((n) => buildSheet(n, wb.Sheets[n]));
        if (!cancelled) setSheets(s);
      } catch (e) {
        if (!cancelled) setErr((e as Error).message ?? String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [path]);

  const sheet = sheets?.[active];
  const colLetters = useMemo(
    () =>
      sheet
        ? Array.from({ length: sheet.cols }, (_, c) => XLSX.utils.encode_col(c))
        : [],
    [sheet],
  );

  if (err) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-rose">
        열기 실패: {err}
      </div>
    );
  }
  if (!sheets || !sheet) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-faint">
        불러오는 중…
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="xlsx-sheet min-h-0 flex-1 overflow-auto">
        {/* zoom 은 스크롤 컨테이너 내부 표에만 적용 → 스크롤·고정헤더 정상 */}
        <div style={{ zoom }}>
          <table className="sheet-grid">
            <thead>
              <tr>
                <th aria-label="모서리" />
                {colLetters.map((letter) => (
                  <th key={letter}>{letter}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sheet.rows.map((row, r) => (
                // 행 순서 고정이라 인덱스 key 안전
                // eslint-disable-next-line react/no-array-index-key
                <tr key={r}>
                  <th scope="row">{r + 1}</th>
                  {colLetters.map((_, c) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <td key={c} className={sheet.nums[r]?.[c] ? "num" : undefined}>
                      {row[c] ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {sheet.truncated && (
            <p className="px-3 py-2 font-mono text-xs text-faint">
              {MAX_ROWS.toLocaleString()}행까지만 표시했어요 (뷰어 성능 제한).
            </p>
          )}
        </div>
      </div>

      {/* 시트 탭 — 엑셀처럼 하단에 항상 표시 */}
      <div
        role="tablist"
        aria-label="시트"
        className="flex shrink-0 gap-px overflow-x-auto border-t border-line-soft bg-bg-deep/50 px-2"
      >
        {sheets.map((s, i) => (
          <button
            key={s.name}
            type="button"
            role="tab"
            aria-selected={active === i}
            onClick={() => setActive(i)}
            className={`shrink-0 border-b-2 px-3.5 py-1.5 font-mono text-xs transition-colors ${
              active === i
                ? "border-accent text-fg"
                : "border-transparent text-muted hover:text-fg"
            }`}
          >
            {s.name}
          </button>
        ))}
      </div>
    </div>
  );
}
