import * as XLSX from "xlsx";
import {
  patchBlocker,
  patchWorkbookBytes,
  type PatchPlan,
  type PatchValue,
} from "./xlsxPatch";

export const MAX_ROWS = 5000;
export const MAX_COLS = 256;
export const MAX_CELLS = 200_000;
export const MAX_EDITS = 10_000;

export type CellEdit = [sheet: string, address: string, input: string | null];
export type SpreadsheetCellEdit = [row: number, col: number, input: string];

export interface SpreadsheetSheet {
  name: string;
  rows: string[][];
  nums: boolean[][];
  cols: number;
  truncatedRows: boolean;
  truncatedCols: boolean;
}

export interface Spreadsheet {
  workbook: XLSX.WorkBook;
  sheets: SpreadsheetSheet[];
  editable: boolean;
  readOnlyReason?: string;
  /** 저장 시 원본과 달라지는 점을 미리 알린다 (예: 인코딩 변환) */
  encodingNotice?: string;
}

/** CSV/TSV 텍스트 디코딩. UTF-8이 깨질 때만 EUC-KR(CP949)로 폴백한다. */
function decodeCsv(bytes: Uint8Array): { text: string; legacyEncoding: boolean } {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: new TextDecoder("utf-8").decode(bytes), legacyEncoding: false };
  }
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  const bad = (utf8.match(/�/g)?.length ?? 0) / Math.max(1, utf8.length);
  if (bad < 0.002) return { text: utf8, legacyEncoding: false };
  try {
    const euc = new TextDecoder("euc-kr").decode(bytes);
    const eucBad = (euc.match(/�/g)?.length ?? 0) / Math.max(1, euc.length);
    return eucBad < bad
      ? { text: euc, legacyEncoding: true }
      : { text: utf8, legacyEncoding: false };
  } catch {
    return { text: utf8, legacyEncoding: false };
  }
}

function buildSheet(name: string, ws: XLSX.WorkSheet): SpreadsheetSheet {
  const sourceRange = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
  const sourceRows = Math.max(1, sourceRange.e.r + 1);
  const sourceCols = Math.max(1, sourceRange.e.c + 1);
  const cols = Math.min(sourceCols, MAX_COLS);
  const rowsCount = Math.min(
    sourceRows,
    MAX_ROWS,
    Math.max(1, Math.floor(MAX_CELLS / cols)),
  );
  const range = { s: { r: 0, c: 0 }, e: { r: rowsCount - 1, c: cols - 1 } };
  const disp = XLSX.utils.sheet_to_json<string[]>(ws, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: true,
    range,
  });
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    raw: true,
    defval: "",
    blankrows: true,
    range,
  });
  return {
    name,
    rows: Array.from({ length: rowsCount }, (_, r) =>
      (disp[r] ?? []).map((cell) => (cell == null ? "" : String(cell))),
    ),
    nums: Array.from({ length: rowsCount }, (_, r) =>
      (rawRows[r] ?? []).map((cell) => typeof cell === "number"),
    ),
    cols,
    truncatedRows: rowsCount < sourceRows,
    truncatedCols: cols < sourceCols,
  };
}

function delimiterFor(path: string): string | undefined {
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "csv") return ",";
  if (ext === "tsv") return "\t";
  return undefined;
}

function readWorkbook(
  path: string,
  bytes: Uint8Array,
): { workbook: XLSX.WorkBook; legacyEncoding: boolean } {
  const separator = delimiterFor(path);
  if (separator) {
    const { text, legacyEncoding } = decodeCsv(bytes);
    return {
      workbook: XLSX.read(text, { type: "string", FS: separator }),
      legacyEncoding,
    };
  }
  return {
    workbook: XLSX.read(bytes, {
      type: "array",
      cellDates: true,
      cellFormula: true,
      cellNF: true,
      cellStyles: true,
      sheetStubs: true,
      xlfn: true,
    }),
    legacyEncoding: false,
  };
}

function cellInput(cell?: XLSX.CellObject): string {
  if (!cell) return "";
  if (cell.f) return `=${cell.f}`;
  if (cell.t === "b") return cell.v ? "TRUE" : "FALSE";
  if (cell.t === "d" && cell.v instanceof Date) {
    return cell.v.toISOString().slice(0, 10);
  }
  return cell.v == null ? "" : String(cell.v);
}

function invalidDraft(strict: boolean): CellEdit[] {
  if (strict) throw new Error("저장할 셀 변경 내용이 올바르지 않아요.");
  return [];
}

function parseEdits(draft: string, strict = false): CellEdit[] {
  if (!draft) return [];
  try {
    const value: unknown = JSON.parse(draft);
    if (!Array.isArray(value) || value.length > MAX_EDITS) {
      return invalidDraft(strict);
    }
    const edits: CellEdit[] = [];
    for (const item of value) {
      if (
        !Array.isArray(item) ||
        item.length !== 3 ||
        typeof item[0] !== "string" ||
        typeof item[1] !== "string" ||
        (typeof item[2] !== "string" && item[2] !== null)
      ) {
        return invalidDraft(strict);
      }
      edits.push([item[0], item[1], item[2]]);
    }
    return edits;
  } catch {
    return invalidDraft(strict);
  }
}

const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function significantDigits(input: string): number {
  const coefficient = input
    .trim()
    .replace(/^[+-]/, "")
    .split(/[eE]/, 1)[0]
    .replace(".", "")
    .replace(/^0+/, "");
  return coefficient.length || 1;
}

function parseLocalDate(input: string): Date | undefined {
  if (!DATE.test(input)) return undefined;
  const [year, month, day] = input.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? date
    : undefined;
}

function cellFromInput(
  input: string | null,
  previous?: XLSX.CellObject,
): XLSX.CellObject | undefined {
  if (input === null || input === "") {
    if (
      !previous ||
      (previous.s == null && previous.z == null && !previous.c && !previous.l)
    ) {
      return undefined;
    }
    const blank = { ...previous, t: "z" as const };
    delete blank.v;
    delete blank.w;
    delete blank.r;
    delete blank.h;
    delete blank.f;
    delete blank.F;
    return blank;
  }
  const cell = { ...(previous ?? { t: "s", v: "" }) } as XLSX.CellObject;
  delete cell.w;
  delete cell.r;
  delete cell.h;
  delete cell.f;
  delete cell.F;
  const date = previous?.t === "d" ? parseLocalDate(input) : undefined;

  if (input.startsWith("'")) {
    cell.t = "s";
    cell.v = input.slice(1);
  } else if (/^(true|false)$/i.test(input)) {
    cell.t = "b";
    cell.v = input.toLowerCase() === "true";
  } else if (date) {
    cell.t = "d";
    cell.v = date;
  } else if (NUMBER.test(input.trim())) {
    const number = Number(input);
    if (Number.isFinite(number) && significantDigits(input) <= 15) {
      cell.t = "n";
      cell.v = number;
    } else {
      // Excel 숫자의 15자리 정밀도나 JS 유한 범위를 넘으면 원문을 보존한다.
      cell.t = "s";
      cell.v = input;
    }
  } else {
    cell.t = "s";
    cell.v = input;
  }
  return cell;
}

function worksheetOf(
  workbook: XLSX.WorkBook,
  sheetName: string,
): XLSX.WorkSheet | undefined {
  return Object.prototype.hasOwnProperty.call(workbook.Sheets, sheetName)
    ? workbook.Sheets[sheetName]
    : undefined;
}

interface EditTarget {
  worksheet: XLSX.WorkSheet;
  position: XLSX.CellAddress;
  previous?: XLSX.CellObject;
}

/**
 * 안전하게 값을 바꿀 수 있는 셀인지 판정한다. 수식·병합 종속 셀·보호 시트는
 * 외과적 저장으로도 되쓸 수 없어 막는다. 화면 편집과 저장이 같은 기준을 쓴다.
 */
function resolveEdit(
  workbook: XLSX.WorkBook,
  sheetName: string,
  address: string,
  input: string | null,
): EditTarget | undefined {
  const worksheet = worksheetOf(workbook, sheetName);
  if (!worksheet || worksheet["!protect"] || input?.startsWith("=")) {
    return undefined;
  }
  let position: XLSX.CellAddress;
  try {
    position = XLSX.utils.decode_cell(address);
  } catch {
    return undefined;
  }
  if (
    position.r < 0 ||
    position.r >= MAX_ROWS ||
    position.c < 0 ||
    position.c >= MAX_COLS ||
    XLSX.utils.encode_cell(position) !== address
  ) {
    return undefined;
  }
  const previous = worksheet[address] as XLSX.CellObject | undefined;
  if (previous?.f || previous?.F) return undefined;
  const merge = worksheet["!merges"]?.find(
    ({ s, e }) =>
      position.r >= s.r &&
      position.r <= e.r &&
      position.c >= s.c &&
      position.c <= e.c,
  );
  if (merge && (merge.s.r !== position.r || merge.s.c !== position.c)) {
    return undefined;
  }
  return { worksheet, position, previous };
}

function editWorkbookCell(
  workbook: XLSX.WorkBook,
  sheetName: string,
  address: string,
  input: string | null,
): boolean {
  const target = resolveEdit(workbook, sheetName, address, input);
  if (!target) return false;
  const { worksheet, position, previous } = target;

  const cell = cellFromInput(input, previous);
  if (cell) {
    worksheet[address] = cell;
    const range = XLSX.utils.decode_range(worksheet["!ref"] ?? "A1");
    range.e.r = Math.max(range.e.r, position.r);
    range.e.c = Math.max(range.e.c, position.c);
    worksheet["!ref"] = XLSX.utils.encode_range(range);
  } else {
    delete worksheet[address];
  }
  return true;
}

function applyEdits(
  workbook: XLSX.WorkBook,
  edits: CellEdit[],
  strict = false,
) {
  for (const [sheet, address, input] of edits) {
    if (!editWorkbookCell(workbook, sheet, address, input) && strict) {
      throw new Error(`${sheet} 시트의 ${address} 셀을 안전하게 수정할 수 없어요.`);
    }
  }
}

/**
 * 저장은 원본 아카이브에서 편집한 셀이 든 시트 XML만 고쳐 쓴다(xlsxPatch).
 * 서식·수식·차트·피벗은 손대지 않으므로, 통합문서 전체를 막아야 하는 경우는
 * 값을 되쓸 방법 자체가 없는 구조뿐이다. 개별 셀 제약은 cellEditRefusal 이 본다.
 */
function xlsxReadOnlyReason(
  path: string,
  bytes: Uint8Array,
  workbook: XLSX.WorkBook,
): string | undefined {
  if (!path.toLowerCase().endsWith(".xlsx")) {
    return "이 형식은 보기와 복사만 지원해요. 셀 편집은 .xlsx 파일에서 사용할 수 있어요.";
  }
  if (workbook.vbaraw) {
    return "매크로가 들어 있어 원본 보호를 위해 읽기 전용으로 열었어요.";
  }
  return patchBlocker(bytes, workbook.SheetNames);
}

export function readSpreadsheet(
  path: string,
  bytes: Uint8Array,
  draft = "",
): Spreadsheet {
  const { workbook, legacyEncoding } = readWorkbook(path, bytes);
  const edits = parseEdits(draft);
  const readOnlyReason = delimiterFor(path)
    ? undefined
    : xlsxReadOnlyReason(path, bytes, workbook);
  applyEdits(workbook, edits);
  return {
    workbook,
    sheets: workbook.SheetNames.map((name) =>
      buildSheet(name, workbook.Sheets[name]),
    ),
    editable: !readOnlyReason,
    readOnlyReason,
    encodingNotice: legacyEncoding
      ? "EUC-KR 파일이라 저장하면 UTF-8로 바뀌어요."
      : undefined,
  };
}

export function spreadsheetCellInput(
  spreadsheet: Spreadsheet,
  sheetIndex: number,
  row: number,
  col: number,
): string {
  const name = spreadsheet.workbook.SheetNames[sheetIndex];
  return cellInput(
    worksheetOf(spreadsheet.workbook, name)?.[
      XLSX.utils.encode_cell({ r: row, c: col })
    ],
  );
}

/** 복사 후 다시 붙여넣어도 문자열을 숫자·불리언·수식으로 재해석하지 않게 한다. */
export function spreadsheetCellClipboardInput(
  spreadsheet: Spreadsheet,
  sheetIndex: number,
  row: number,
  col: number,
): string {
  const name = spreadsheet.workbook.SheetNames[sheetIndex];
  const cell = worksheetOf(spreadsheet.workbook, name)?.[
    XLSX.utils.encode_cell({ r: row, c: col })
  ] as XLSX.CellObject | undefined;
  const input = cellInput(cell);
  if (
    cell?.t === "s" &&
    (input.startsWith("'") ||
      input.startsWith("=") ||
      NUMBER.test(input.trim()) ||
      /^(true|false)$/i.test(input))
  ) {
    return `'${input}`;
  }
  return input;
}

/** Excel/Sheets 클립보드와 호환되는 따옴표 포함 TSV 파서. */
export function parseTsv(text: string): string[][] {
  const rows: string[][] = [[]];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index++;
        } else {
          quoted = false;
        }
      } else if (char === "\r" && text[index + 1] === "\n") {
        field += "\n";
        index++;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"' && field === "") {
      quoted = true;
    } else if (char === "\t") {
      rows.at(-1)!.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index++;
      rows.at(-1)!.push(field);
      rows.push([]);
      field = "";
    } else {
      field += char;
    }
  }
  if (quoted) throw new Error("붙여넣은 표의 따옴표가 닫히지 않았어요.");
  rows.at(-1)!.push(field);
  if (rows.length > 1 && rows.at(-1)!.length === 1 && rows.at(-1)![0] === "") {
    rows.pop();
  }
  return rows;
}

export function stringifyTsv(rows: string[][]): string {
  const quote = (field: string) =>
    /[\t\r\n"]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field;
  return rows.map((row) => row.map(quote).join("\t")).join("\n");
}

export function spreadsheetCellEditable(
  spreadsheet: Spreadsheet,
  sheetIndex: number,
  row: number,
  col: number,
): boolean {
  const name = spreadsheet.workbook.SheetNames[sheetIndex];
  const worksheet = worksheetOf(spreadsheet.workbook, name);
  if (!spreadsheet.editable || !worksheet || worksheet["!protect"]) return false;
  const cell = worksheet[XLSX.utils.encode_cell({ r: row, c: col })];
  if (cell?.f || cell?.F) return false;
  const merge = worksheet["!merges"]?.find(
    ({ s, e }) => row >= s.r && row <= e.r && col >= s.c && col <= e.c,
  );
  return !merge || (merge.s.r === row && merge.s.c === col);
}

export function editSpreadsheetCell(
  spreadsheet: Spreadsheet,
  sheetIndex: number,
  row: number,
  col: number,
  input: string,
): Spreadsheet {
  return editSpreadsheetCells(spreadsheet, sheetIndex, [[row, col, input]]);
}

/** 여러 셀을 workbook/state 복사 한 번으로 반영한다. */
export function editSpreadsheetCells(
  spreadsheet: Spreadsheet,
  sheetIndex: number,
  edits: SpreadsheetCellEdit[],
): Spreadsheet {
  const name = spreadsheet.workbook.SheetNames[sheetIndex];
  const source = worksheetOf(spreadsheet.workbook, name);
  const sheet = spreadsheet.sheets[sheetIndex];
  if (!source || !sheet || !edits.length) return spreadsheet;
  const worksheet = { ...source };
  const workbook = {
    ...spreadsheet.workbook,
    Sheets: { ...spreadsheet.workbook.Sheets, [name]: worksheet },
  };
  const rows = [...sheet.rows];
  const nums = [...sheet.nums];
  const touchedRows = new Set<number>();
  let changed = false;
  let cols = sheet.cols;

  for (const [row, col, input] of edits) {
    if (
      !spreadsheetCellEditable(spreadsheet, sheetIndex, row, col) ||
      spreadsheetCellInput(spreadsheet, sheetIndex, row, col) === input
    ) {
      continue;
    }
    const address = XLSX.utils.encode_cell({ r: row, c: col });
    if (!editWorkbookCell(workbook, name, address, input === "" ? null : input)) {
      continue;
    }
    if (!touchedRows.has(row)) {
      while (rows.length <= row) rows.push([]);
      while (nums.length <= row) nums.push([]);
      rows[row] = [...(rows[row] ?? [])];
      nums[row] = [...(nums[row] ?? [])];
      touchedRows.add(row);
    }
    const cell = worksheet[address] as XLSX.CellObject | undefined;
    rows[row][col] = cellInput(cell);
    nums[row][col] = cell?.t === "n" && !cell.f;
    cols = Math.max(cols, col + 1);
    changed = true;
  }

  if (!changed) return spreadsheet;
  const sheets = [...spreadsheet.sheets];
  sheets[sheetIndex] = { ...sheet, rows, nums, cols };
  return { ...spreadsheet, workbook, sheets };
}

export function updateSpreadsheetDraft(
  draft: string,
  sheet: string,
  address: string,
  input: string,
): string {
  return updateSpreadsheetDraftBatch(draft, sheet, [[address, input]]);
}

/** 여러 셀 변경을 patch log 파싱·직렬화 한 번으로 합친다. */
export function updateSpreadsheetDraftBatch(
  draft: string,
  sheet: string,
  changes: [address: string, input: string][],
): string {
  const edits = new Map<string, CellEdit>();
  for (const edit of parseEdits(draft, true)) {
    edits.set(`${edit[0]}\0${edit[1]}`, edit);
  }
  for (const [address, input] of changes) {
    edits.set(`${sheet}\0${address}`, [
      sheet,
      address,
      input === "" ? null : input,
    ]);
  }
  if (edits.size > MAX_EDITS) {
    throw new Error(`한 번에 ${MAX_EDITS.toLocaleString()}개 셀까지만 수정할 수 있어요.`);
  }
  return JSON.stringify([...edits.values()]);
}

/** Excel 날짜 일련번호의 기준일. 1900 윤년 버그까지 포함한 값이다. */
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

function toPatchValue(cell: XLSX.CellObject | undefined): PatchValue {
  if (!cell || cell.t === "z" || cell.v == null) return { kind: "blank" };
  if (cell.t === "n") return { kind: "number", value: Number(cell.v) };
  if (cell.t === "b") return { kind: "bool", value: Boolean(cell.v) };
  if (cell.t === "d" && cell.v instanceof Date) {
    // 날짜는 일련번호로 쓴다. 셀의 표시 형식(s)은 원본 것을 그대로 이어받는다.
    return { kind: "number", value: (cell.v.getTime() - EXCEL_EPOCH) / 86_400_000 };
  }
  return { kind: "string", value: String(cell.v) };
}

function detectEol(bytes: Uint8Array): "\r\n" | "\n" {
  const head = new TextDecoder().decode(bytes.subarray(0, 4096));
  return head.includes("\r\n") ? "\r\n" : "\n";
}

/** CSV/TSV 는 서식이 없어 전체를 다시 쓴다. 줄바꿈과 BOM 은 원본을 따른다. */
function serializeDelimited(
  path: string,
  bytes: Uint8Array,
  workbook: XLSX.WorkBook,
  edits: CellEdit[],
): Uint8Array {
  applyEdits(workbook, edits, true);
  const name = workbook.SheetNames[0];
  const worksheet = name ? worksheetOf(workbook, name) : undefined;
  if (!worksheet) throw new Error("표 내용을 읽을 수 없어 저장하지 못했어요.");
  const text = XLSX.utils.sheet_to_csv(worksheet, {
    FS: delimiterFor(path),
    RS: detectEol(bytes),
    blankrows: true,
  });
  const body = new TextEncoder().encode(text);
  const hasBom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  if (!hasBom) return body;
  const out = new Uint8Array(body.length + 3);
  out.set([0xef, 0xbb, 0xbf]);
  out.set(body, 3);
  return out;
}

export function serializeSpreadsheet(
  path: string,
  bytes: Uint8Array,
  draft: string,
): Uint8Array {
  const lower = path.toLowerCase();
  const { workbook } = readWorkbook(path, bytes);
  const edits = parseEdits(draft, true);
  if (delimiterFor(lower)) {
    return edits.length ? serializeDelimited(lower, bytes, workbook, edits) : bytes;
  }
  if (!lower.endsWith(".xlsx")) {
    throw new Error("이 형식은 수정해서 저장할 수 없어요.");
  }
  const readOnlyReason = xlsxReadOnlyReason(path, bytes, workbook);
  if (readOnlyReason) throw new Error(readOnlyReason);
  if (!edits.length) return bytes;

  // 통합문서를 다시 쓰지 않고, 원본 아카이브의 해당 시트 XML만 고쳐 넣는다.
  const plan: PatchPlan = new Map();
  for (const [sheet, address, input] of edits) {
    const target = resolveEdit(workbook, sheet, address, input);
    if (!target) {
      throw new Error(`${sheet} 시트의 ${address} 셀을 안전하게 수정할 수 없어요.`);
    }
    if (!plan.has(sheet)) plan.set(sheet, new Map());
    plan.get(sheet)!.set(address, toPatchValue(cellFromInput(input, target.previous)));
  }
  return patchWorkbookBytes(bytes, plan);
}
