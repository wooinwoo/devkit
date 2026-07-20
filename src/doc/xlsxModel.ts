import * as XLSX from "xlsx";

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
}

/** CSV/TSV 텍스트 디코딩. UTF-8이 깨질 때만 EUC-KR(CP949)로 폴백한다. */
function decodeCsv(bytes: Uint8Array): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes);
  }
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  const bad = (utf8.match(/�/g)?.length ?? 0) / Math.max(1, utf8.length);
  if (bad < 0.002) return utf8;
  try {
    const euc = new TextDecoder("euc-kr").decode(bytes);
    const eucBad = (euc.match(/�/g)?.length ?? 0) / Math.max(1, euc.length);
    return eucBad < bad ? euc : utf8;
  } catch {
    return utf8;
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

function readWorkbook(path: string, bytes: Uint8Array): XLSX.WorkBook {
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "csv" || ext === "tsv") {
    const text = decodeCsv(bytes);
    return XLSX.read(text, {
      type: "string",
      ...(ext === "tsv" ? { FS: "\t" } : {}),
    });
  }
  return XLSX.read(bytes, {
    type: "array",
    cellDates: true,
    cellFormula: true,
    cellNF: true,
    cellStyles: true,
    sheetStubs: true,
    xlfn: true,
  });
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

function editWorkbookCell(
  workbook: XLSX.WorkBook,
  sheetName: string,
  address: string,
  input: string | null,
): boolean {
  const worksheet = worksheetOf(workbook, sheetName);
  if (!worksheet || worksheet["!protect"] || input?.startsWith("=")) {
    return false;
  }
  let position: XLSX.CellAddress;
  try {
    position = XLSX.utils.decode_cell(address);
  } catch {
    return false;
  }
  if (
    position.r < 0 ||
    position.r >= MAX_ROWS ||
    position.c < 0 ||
    position.c >= MAX_COLS ||
    XLSX.utils.encode_cell(position) !== address
  ) {
    return false;
  }
  const previous = worksheet[address] as XLSX.CellObject | undefined;
  if (previous?.f || previous?.F) return false;
  const merge = worksheet["!merges"]?.find(
    ({ s, e }) =>
      position.r >= s.r &&
      position.r <= e.r &&
      position.c >= s.c &&
      position.c <= e.c,
  );
  if (merge && (merge.s.r !== position.r || merge.s.c !== position.c)) {
    return false;
  }

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

function archiveParts(bytes: Uint8Array): Map<string, Uint8Array> {
  const archive = XLSX.CFB.read(bytes, { type: "buffer" }) as {
    FullPaths: string[];
    FileIndex: {
      type?: number;
      content?: Uint8Array | number[];
    }[];
  };
  const root = archive.FullPaths[0] ?? "Root Entry/";
  const parts = new Map<string, Uint8Array>();
  archive.FullPaths.forEach((fullPath, index) => {
    const entry = archive.FileIndex[index];
    const path = fullPath.startsWith(root) ? fullPath.slice(root.length) : fullPath;
    if (
      entry?.type !== 2 ||
      !entry.content ||
      !path ||
      path.endsWith("/") ||
      path.charCodeAt(0) === 1
    ) {
      return;
    }
    parts.set(path, Uint8Array.from(entry.content));
  });
  return parts;
}

function partText(parts: Map<string, Uint8Array>, path: string): string {
  const bytes = parts.get(path);
  return bytes ? new TextDecoder().decode(bytes) : "";
}

function sameBytes(left?: Uint8Array, right?: Uint8Array): boolean {
  return Boolean(
    left &&
      right &&
      left.length === right.length &&
      left.every((byte, index) => byte === right[index]),
  );
}

let writerDefaults: Map<string, Uint8Array> | undefined;
function defaultWriterParts(): Map<string, Uint8Array> {
  if (writerDefaults) return writerDefaults;
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([[1]]),
    "Sheet1",
  );
  const output = XLSX.write(workbook, {
    type: "array",
    bookType: "xlsx",
    cellStyles: true,
    compression: true,
  });
  writerDefaults = archiveParts(new Uint8Array(output));
  return writerDefaults;
}

const ALLOWED_PARTS = [
  /^\[Content_Types\]\.xml$/,
  /^_rels\/\.rels$/,
  /^docProps\/(?:app|core)\.xml$/,
  /^xl\/(?:workbook|styles|sharedStrings|metadata)\.xml$/,
  /^xl\/_rels\/workbook\.xml\.rels$/,
  /^xl\/theme\/theme\d+\.xml$/,
  /^xl\/worksheets\/sheet\d+\.xml$/,
];

const SAFE_PROP_KEYS = new Set([
  "Application",
  "HyperlinksChanged",
  "SharedDoc",
  "LinksUpToDate",
  "ScaleCrop",
  "Worksheets",
  "SheetNames",
]);

/**
 * Community SheetJS는 값을 쓰는 데는 적합하지만 고급 OOXML 파트를 완전 보존하지
 * 않는다. 원본 손실 가능성이 있는 통합문서는 처음부터 읽기 전용으로 둔다.
 */
function xlsxReadOnlyReason(
  path: string,
  bytes: Uint8Array,
  workbook: XLSX.WorkBook,
): string | undefined {
  if (!path.toLowerCase().endsWith(".xlsx")) {
    return "이 형식은 보기와 복사만 지원해요. 셀 편집은 .xlsx 파일에서 사용할 수 있어요.";
  }

  if (
    workbook.Props?.Application !== "SheetJS" ||
    Object.keys(workbook.Props ?? {}).some((key) => !SAFE_PROP_KEYS.has(key)) ||
    Object.keys(workbook.Custprops ?? {}).length > 0 ||
    workbook.vbaraw
  ) {
    return "다른 프로그램의 서식 또는 문서 정보가 있어 원본 보호를 위해 읽기 전용으로 열었어요.";
  }
  if (workbook.Workbook?.Sheets?.some((sheet) => sheet.Hidden)) {
    return "숨겨진 시트가 있어 원본 보호를 위해 읽기 전용으로 열었어요.";
  }

  for (const name of workbook.SheetNames) {
    const worksheet = worksheetOf(workbook, name);
    if (!worksheet) continue;
    if (worksheet["!protect"]) {
      return "보호된 시트가 있어 원본 보호를 위해 읽기 전용으로 열었어요.";
    }
    if (worksheet["!cols"]?.length || worksheet["!rows"]?.length) {
      return "행 또는 열 서식이 있어 원본 보호를 위해 읽기 전용으로 열었어요.";
    }
    for (const [address, value] of Object.entries(worksheet)) {
      if (address.startsWith("!") || !value || typeof value !== "object") continue;
      const cell = value as XLSX.CellObject;
      if (cell.f || cell.F) {
        return "수식이 있어 계산 결과 보호를 위해 읽기 전용으로 열었어요.";
      }
      if (cell.c?.length || cell.l || cell.r) {
        return "메모, 링크 또는 서식 있는 텍스트가 있어 읽기 전용으로 열었어요.";
      }
    }
  }

  if ((workbook.Workbook?.Names?.length ?? 0) > 0) {
    return "이름 정의가 있어 원본 보호를 위해 읽기 전용으로 열었어요.";
  }

  let parts: Map<string, Uint8Array>;
  try {
    parts = archiveParts(bytes);
  } catch {
    return "파일 구조를 안전하게 확인할 수 없어 읽기 전용으로 열었어요.";
  }

  if ([...parts.keys()].some((part) => !ALLOWED_PARTS.some((rule) => rule.test(part)))) {
    return "차트, 이미지 또는 고급 Excel 기능이 있어 읽기 전용으로 열었어요.";
  }

  const defaults = defaultWriterParts();
  if (
    !sameBytes(parts.get("xl/styles.xml"), defaults.get("xl/styles.xml")) ||
    !sameBytes(parts.get("xl/theme/theme1.xml"), defaults.get("xl/theme/theme1.xml"))
  ) {
    return "셀 서식이 있어 원본 보호를 위해 읽기 전용으로 열었어요.";
  }

  if ([...parts].some(([part, content]) =>
    part.endsWith(".rels") && /TargetMode="External"/i.test(new TextDecoder().decode(content)))) {
    return "외부 연결이 있어 원본 보호를 위해 읽기 전용으로 열었어요.";
  }

  const workbookXml = partText(parts, "xl/workbook.xml");
  if (/<(?:definedNames|externalReferences|workbookProtection|fileSharing|customWorkbookViews|pivotCaches|smartTagPr|webPublishing|webPublishObjects|oleSize|extLst)\b/i.test(workbookXml)) {
    return "고급 통합문서 설정이 있어 원본 보호를 위해 읽기 전용으로 열었어요.";
  }
  const sharedStrings = partText(parts, "xl/sharedStrings.xml");
  if (/<(?:rPr|phoneticPr|rPh)\b/i.test(sharedStrings)) {
    return "서식 있는 텍스트가 있어 원본 보호를 위해 읽기 전용으로 열었어요.";
  }
  for (const [part, content] of parts) {
    if (!/^xl\/worksheets\/sheet\d+\.xml$/i.test(part)) continue;
    const xml = new TextDecoder().decode(content);
    if (
      /<(?:f|sheetPr|cols|pane|autoFilter|sortState|conditionalFormatting|dataValidations?|hyperlinks|sheetProtection|protectedRanges|scenarios|customSheetViews|pageMargins|pageSetup|printOptions|headerFooter|rowBreaks|colBreaks|drawing|legacyDrawing(?:HF)?|picture|oleObjects|controls|webPublishItems|tableParts|extLst)\b/i.test(xml) ||
      /\b(?:customHeight|customFormat|outlineLevel|collapsed|hidden)="/i.test(xml)
    ) {
      return "시트 서식 또는 고급 기능이 있어 원본 보호를 위해 읽기 전용으로 열었어요.";
    }
  }
  return undefined;
}

export function readSpreadsheet(
  path: string,
  bytes: Uint8Array,
  draft = "",
): Spreadsheet {
  const workbook = readWorkbook(path, bytes);
  const edits = parseEdits(draft);
  const readOnlyReason = xlsxReadOnlyReason(path, bytes, workbook);
  applyEdits(workbook, edits);
  return {
    workbook,
    sheets: workbook.SheetNames.map((name) =>
      buildSheet(name, workbook.Sheets[name]),
    ),
    editable: !readOnlyReason,
    readOnlyReason,
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

export function serializeSpreadsheet(
  path: string,
  bytes: Uint8Array,
  draft: string,
): Uint8Array {
  if (!path.toLowerCase().endsWith(".xlsx")) {
    throw new Error("XLSX 파일만 수정해서 저장할 수 있어요.");
  }
  const workbook = readWorkbook(path, bytes);
  const readOnlyReason = xlsxReadOnlyReason(path, bytes, workbook);
  if (readOnlyReason) throw new Error(readOnlyReason);
  const edits = parseEdits(draft, true);
  if (!edits.length) return bytes;
  applyEdits(workbook, edits, true);
  // SheetJS가 읽은 theme raw 문자열을 다시 쓰면 한글 글꼴명이 매 저장마다
  // 중복 인코딩된다. 위 gate가 확인한 기본 테마를 새로 생성하게 한다.
  delete (workbook as XLSX.WorkBook & { Themes?: unknown }).Themes;
  const output = XLSX.write(workbook, {
    type: "array",
    bookType: "xlsx",
    cellStyles: true,
    compression: true,
  });
  return output instanceof Uint8Array ? output : new Uint8Array(output);
}
