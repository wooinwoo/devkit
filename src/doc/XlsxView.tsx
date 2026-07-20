import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { readBinary } from "./fs";
import {
  editSpreadsheetCell,
  editSpreadsheetCells,
  readSpreadsheet,
  parseTsv,
  spreadsheetCellEditable,
  spreadsheetCellClipboardInput,
  spreadsheetCellInput,
  stringifyTsv,
  updateSpreadsheetDraft,
  updateSpreadsheetDraftBatch,
  MAX_CELLS,
  MAX_COLS,
  MAX_EDITS,
  MAX_ROWS,
  type Spreadsheet,
  type SpreadsheetCellEdit,
} from "./xlsxModel";

interface Sel {
  ar: number;
  ac: number;
  fr: number;
  fc: number;
}

const norm = (selection: Sel) => ({
  r0: Math.min(selection.ar, selection.fr),
  r1: Math.max(selection.ar, selection.fr),
  c0: Math.min(selection.ac, selection.fc),
  c1: Math.max(selection.ac, selection.fc),
});

export function XlsxView({
  path,
  zoom = 1,
  editable,
  draft,
  onChange,
}: {
  path: string;
  zoom?: number;
  editable: boolean;
  draft: string;
  onChange: (draft: string) => void;
}) {
  const [spreadsheet, setSpreadsheet] = useState<Spreadsheet | null>(null);
  const spreadsheetRef = useRef<Spreadsheet | null>(null);
  const [active, setActive] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<Sel | null>(null);
  const [formula, setFormula] = useState("");
  const [editNotice, setEditNotice] = useState<string | null>(null);
  const selecting = useRef(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const formulaRef = useRef<HTMLInputElement>(null);
  const editingFormula = useRef(false);
  const skipNextFormulaStart = useRef(false);
  const editStart = useRef("");
  const draftRef = useRef(draft);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  spreadsheetRef.current = spreadsheet;

  useEffect(() => {
    let cancelled = false;
    editingFormula.current = false;
    skipNextFormulaStart.current = false;
    setSpreadsheet(null);
    spreadsheetRef.current = null;
    setErr(null);
    setEditNotice(null);
    setActive(0);
    setSel(null);
    (async () => {
      try {
        const bytes = await readBinary(path);
        const next = readSpreadsheet(path, bytes, draftRef.current);
        if (!cancelled) {
          spreadsheetRef.current = next;
          setSpreadsheet(next);
        }
      } catch (error) {
        if (!cancelled) setErr((error as Error).message ?? String(error));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [path]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const sheet = spreadsheet?.sheets[active];
  const ready = Boolean(sheet);
  useEffect(() => {
    if (ready) setSel({ ar: 0, ac: 0, fr: 0, fc: 0 });
  }, [active, path, ready]);

  // 범위를 늘려도 최초 선택 셀이 편집·붙여넣기의 기준 셀로 남는다.
  const focusRow = sel?.ar ?? 0;
  const focusCol = sel?.ac ?? 0;
  const address = XLSX.utils.encode_cell({ r: focusRow, c: focusCol });
  const canEditCell = Boolean(
    editable &&
      spreadsheet &&
      sheet &&
      spreadsheetCellEditable(spreadsheet, active, focusRow, focusCol),
  );

  useEffect(() => {
    if (editingFormula.current) return;
    if (!spreadsheet || !sheet || !sel) {
      setFormula("");
      return;
    }
    setFormula(spreadsheetCellInput(spreadsheet, active, focusRow, focusCol));
  }, [active, focusCol, focusRow, sel, sheet, spreadsheet]);

  const colLetters = useMemo(
    () =>
      sheet
        ? Array.from({ length: sheet.cols }, (_, col) => XLSX.utils.encode_col(col))
        : [],
    [sheet],
  );

  useEffect(() => {
    const pointerUp = () => {
      selecting.current = false;
    };
    window.addEventListener("pointerup", pointerUp);
    return () => window.removeEventListener("pointerup", pointerUp);
  }, []);

  const copySel = useCallback(() => {
    if (!sel || !sheet || !spreadsheet) return;
    const { r0, r1, c0, c1 } = norm(sel);
    const lines: string[][] = [];
    for (let row = r0; row <= r1; row++) {
      const cells: string[] = [];
      for (let col = c0; col <= c1; col++) {
        cells.push(spreadsheetCellClipboardInput(spreadsheet, active, row, col));
      }
      lines.push(cells);
    }
    navigator.clipboard?.writeText(stringifyTsv(lines)).catch(() => {});
  }, [active, sel, sheet, spreadsheet]);

  const applyInput = (input: string, row = focusRow, col = focusCol): boolean => {
    const current = spreadsheetRef.current;
    if (!editable || !current || !spreadsheetCellEditable(current, active, row, col)) {
      return false;
    }
    if (input.startsWith("=")) {
      setEditNotice("수식 입력은 아직 지원하지 않아요. 값만 입력할 수 있어요.");
      return false;
    }
    if (spreadsheetCellInput(current, active, row, col) === input) return true;
    const sheetName = current.workbook.SheetNames[active];
    const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
    let nextDraft: string;
    try {
      nextDraft = updateSpreadsheetDraft(
        draftRef.current,
        sheetName,
        cellAddress,
        input,
      );
    } catch (error) {
      setEditNotice((error as Error).message ?? String(error));
      return false;
    }
    const next = editSpreadsheetCell(current, active, row, col, input);
    if (next === current) return false;
    spreadsheetRef.current = next;
    draftRef.current = nextDraft;
    setSpreadsheet(next);
    setEditNotice(null);
    onChangeRef.current(nextDraft);
    return true;
  };

  const focusFormula = () => {
    if (!canEditCell) return;
    editStart.current = formula;
    skipNextFormulaStart.current = true;
    requestAnimationFrame(() => {
      formulaRef.current?.focus();
      formulaRef.current?.select();
    });
  };

  const move = (dr: number, dc: number, extend: boolean) => {
    if (!sheet || !sel) return;
    const row = Math.max(0, Math.min(sheet.rows.length - 1, sel.fr + dr));
    const col = Math.max(0, Math.min(sheet.cols - 1, sel.fc + dc));
    setSel(
      extend
        ? { ...sel, fr: row, fc: col }
        : { ar: row, ac: col, fr: row, fc: col },
    );
  };

  useEffect(() => {
    if (!sel) return;
    gridRef.current
      ?.querySelector<HTMLElement>(`[data-cell="${sel.fr}:${sel.fc}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active, sel]);

  const applyBatch = (
    changes: SpreadsheetCellEdit[],
    draftChanges: [string, string][],
  ): boolean => {
    const current = spreadsheetRef.current;
    if (!current || !changes.length) return false;
    try {
      const sheetName = current.workbook.SheetNames[active];
      const nextDraft = updateSpreadsheetDraftBatch(
        draftRef.current,
        sheetName,
        draftChanges,
      );
      const next = editSpreadsheetCells(current, active, changes);
      if (next === current) return false;
      spreadsheetRef.current = next;
      draftRef.current = nextDraft;
      setSpreadsheet(next);
      setEditNotice(null);
      onChangeRef.current(nextDraft);
      return true;
    } catch (error) {
      setEditNotice((error as Error).message ?? String(error));
      return false;
    }
  };

  const clearSelection = () => {
    if (!spreadsheet || !sel || !editable) return;
    const range = norm(sel);
    const count = (range.r1 - range.r0 + 1) * (range.c1 - range.c0 + 1);
    if (count > 10_000) {
      window.alert("한 번에 10,000개 셀까지만 비울 수 있어요.");
      return;
    }
    const changes: SpreadsheetCellEdit[] = [];
    const draftChanges: [string, string][] = [];
    for (let row = range.r0; row <= range.r1; row++) {
      for (let col = range.c0; col <= range.c1; col++) {
        if (
          spreadsheetCellEditable(spreadsheet, active, row, col) &&
          spreadsheetCellInput(spreadsheet, active, row, col) !== ""
        ) {
          changes.push([row, col, ""]);
          draftChanges.push([XLSX.utils.encode_cell({ r: row, c: col }), ""]);
        }
      }
    }
    if (!changes.length) return;
    applyBatch(changes, draftChanges);
  };

  const paste = (event: React.ClipboardEvent) => {
    if (!editable || !spreadsheet || !sheet || !sel) return;
    const text = event.clipboardData.getData("text/plain");
    if (!text) return;
    let values: string[][];
    try {
      values = parseTsv(text);
    } catch (error) {
      setEditNotice((error as Error).message ?? String(error));
      return;
    }
    const pastedRows = values.length;
    const pastedCols = Math.max(0, ...values.map((row) => row.length));
    const endRow = focusRow + pastedRows - 1;
    const endCol = focusCol + pastedCols - 1;
    const renderedRows = Math.max(sheet.rows.length, endRow + 1);
    const renderedCols = Math.max(sheet.cols, endCol + 1);
    const count = values.reduce((sum, row) => sum + row.length, 0);
    if (
      !pastedRows ||
      !pastedCols ||
      count > MAX_EDITS ||
      endRow >= MAX_ROWS ||
      endCol >= MAX_COLS ||
      renderedRows * renderedCols > MAX_CELLS
    ) {
      setEditNotice("한 번에 붙여넣을 수 있는 표 크기를 넘었어요.");
      return;
    }
    if (values.some((row) => row.some((value) => value.startsWith("=")))) {
      setEditNotice("수식 붙여넣기는 아직 지원하지 않아요. 값만 붙여넣어 주세요.");
      return;
    }

    const changes: SpreadsheetCellEdit[] = [];
    const draftChanges: [string, string][] = [];
    values.forEach((row, rowOffset) => {
      row.forEach((input, colOffset) => {
        const targetRow = focusRow + rowOffset;
        const targetCol = focusCol + colOffset;
        if (spreadsheetCellEditable(spreadsheet, active, targetRow, targetCol)) {
          changes.push([targetRow, targetCol, input]);
          draftChanges.push([
            XLSX.utils.encode_cell({ r: targetRow, c: targetCol }),
            input,
          ]);
        }
      });
    });
    event.preventDefault();
    if (applyBatch(changes, draftChanges)) {
      setSel({ ar: focusRow, ac: focusCol, fr: endRow, fc: endCol });
    }
  };

  const inSel = (row: number, col: number) => {
    if (!sel) return false;
    const { r0, r1, c0, c1 } = norm(sel);
    return row >= r0 && row <= r1 && col >= c0 && col <= c1;
  };

  if (err) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-rose">
        열기 실패: {err}
      </div>
    );
  }
  if (!spreadsheet || !sheet) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-faint">
        불러오는 중…
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-line-soft bg-bg-deep/35 px-2 py-1.5">
        <span className="w-12 shrink-0 text-center font-mono text-xs font-semibold text-muted">
          {address}
        </span>
        <span aria-hidden="true" className="font-serif text-sm text-faint">
          fx
        </span>
        <input
          ref={formulaRef}
          value={formula}
          disabled={!canEditCell}
          aria-label={`${address} 셀 값`}
          title={canEditCell ? "셀 값을 입력하세요" : "읽기 전용 셀이에요"}
          onFocus={() => {
            editingFormula.current = true;
            if (skipNextFormulaStart.current) {
              skipNextFormulaStart.current = false;
            } else {
              editStart.current = formula;
            }
          }}
          onBlur={() => {
            editingFormula.current = false;
            const current = spreadsheetRef.current;
            if (current) {
              setFormula(
                spreadsheetCellInput(current, active, focusRow, focusCol),
              );
            }
          }}
          onChange={(event) => {
            const value = event.target.value;
            setFormula(value);
            applyInput(value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setFormula(editStart.current);
              applyInput(editStart.current);
              gridRef.current?.focus();
            } else if (event.key === "Enter") {
              event.preventDefault();
              gridRef.current?.focus();
              move(1, 0, false);
            }
          }}
          className="min-w-0 flex-1 rounded-sm border border-line-soft bg-bg px-2 py-1 font-mono text-xs text-fg outline-none transition-colors focus:border-accent disabled:cursor-not-allowed disabled:opacity-55"
        />
      </div>

      <div
        ref={gridRef}
        className="xlsx-sheet min-h-0 flex-1 overflow-auto outline-none"
        tabIndex={0}
        aria-label="스프레드시트"
        onPaste={paste}
        onKeyDown={(event) => {
          const mod = event.ctrlKey || event.metaKey;
          if (mod && event.key.toLowerCase() === "c") {
            event.preventDefault();
            copySel();
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            move(-1, 0, event.shiftKey);
          } else if (event.key === "ArrowDown") {
            event.preventDefault();
            move(1, 0, event.shiftKey);
          } else if (event.key === "ArrowLeft") {
            event.preventDefault();
            move(0, -1, event.shiftKey);
          } else if (event.key === "ArrowRight") {
            event.preventDefault();
            move(0, 1, event.shiftKey);
          } else if (event.key === "Tab") {
            event.preventDefault();
            move(0, event.shiftKey ? -1 : 1, false);
          } else if (event.key === "Enter" || event.key === "F2") {
            event.preventDefault();
            focusFormula();
          } else if (event.key === "Delete" || event.key === "Backspace") {
            event.preventDefault();
            clearSelection();
          } else if (!mod && !event.altKey && event.key.length === 1 && canEditCell) {
            event.preventDefault();
            editStart.current = formula;
            editingFormula.current = true;
            skipNextFormulaStart.current = true;
            setFormula(event.key);
            applyInput(event.key);
            requestAnimationFrame(() => {
              formulaRef.current?.focus();
              formulaRef.current?.setSelectionRange(1, 1);
            });
          }
        }}
      >
        <div style={{ zoom }}>
          <table className="sheet-grid">
            <thead>
              <tr>
                <th aria-label="모서리" />
                {colLetters.map((letter) => (
                  <th key={letter} scope="col">
                    {letter}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sheet.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  <th scope="row">{rowIndex + 1}</th>
                  {colLetters.map((_, colIndex) => {
                    const selected = inSel(rowIndex, colIndex);
                    return (
                      <td
                        key={colIndex}
                        aria-selected={selected}
                        data-cell={`${rowIndex}:${colIndex}`}
                        aria-label={`${XLSX.utils.encode_cell({ r: rowIndex, c: colIndex })} 셀`}
                        onPointerDown={() => {
                          selecting.current = true;
                          setSel({
                            ar: rowIndex,
                            ac: colIndex,
                            fr: rowIndex,
                            fc: colIndex,
                          });
                          gridRef.current?.focus();
                        }}
                        onPointerEnter={() => {
                          if (selecting.current) {
                            setSel((current) =>
                              current
                                ? { ...current, fr: rowIndex, fc: colIndex }
                                : current,
                            );
                          }
                        }}
                        onDoubleClick={focusFormula}
                        className={`${sheet.nums[rowIndex]?.[colIndex] ? "num" : ""} ${
                          selected ? "sel" : ""
                        }`}
                      >
                        {row[colIndex] ?? ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {(sheet.truncatedRows || sheet.truncatedCols) && (
            <p className="px-3 py-2 font-mono text-xs text-faint">
              성능을 위해 앞쪽 {sheet.rows.length.toLocaleString()}행, {sheet.cols.toLocaleString()}열까지만 표시해요.
            </p>
          )}
        </div>
      </div>

      <p className="shrink-0 border-t border-line-soft px-3 py-1 font-mono text-xs text-faint">
        {editNotice ??
          (editable && spreadsheet.editable
            ? "값 편집·표 붙여넣기를 지원해요. 텍스트 숫자는 '001처럼 입력하고 Ctrl+S로 저장하세요."
            : spreadsheet.readOnlyReason ??
              "이 형식은 보기와 복사만 지원해요. 셀 편집은 .xlsx 파일에서 사용할 수 있어요.")}
      </p>

      <div
        role="tablist"
        aria-label="시트"
        className="flex shrink-0 gap-px overflow-x-auto border-t border-line-soft bg-bg-deep/50 px-2"
      >
        {spreadsheet.sheets.map((item, index) => (
          <button
            key={item.name}
            type="button"
            role="tab"
            aria-selected={active === index}
            onClick={() => setActive(index)}
            className={`shrink-0 border-b-2 px-3.5 py-1.5 font-mono text-xs transition-colors ${
              active === index
                ? "border-accent text-fg"
                : "border-transparent text-muted hover:text-fg"
            }`}
          >
            {item.name}
          </button>
        ))}
      </div>
    </div>
  );
}
