import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = await readFile(join(root, "src/doc/xlsxModel.ts"), "utf8");
const xlsxUrl = pathToFileURL(join(root, "node_modules/xlsx/xlsx.mjs")).href;
const output = ts
  .transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  })
  .outputText.replace('from "xlsx"', `from "${xlsxUrl}"`);
const model = await import(
  `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`
);
const XLSX = await import(xlsxUrl);
const typesSource = await readFile(join(root, "src/doc/types.ts"), "utf8");
const typesOutput = ts.transpileModule(typesSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const types = await import(
  `data:text/javascript;base64,${Buffer.from(typesOutput).toString("base64")}`
);

if (!types.isEditableDoc("xlsx", "sample.xlsx")) {
  throw new Error("XLSX 편집이 허용되지 않음");
}

const emptySheet = XLSX.utils.aoa_to_sheet([]);
emptySheet["!ref"] = "A1:Z100";
const emptyWorkbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(emptyWorkbook, emptySheet, "Sheet1");
const emptyBytes = new Uint8Array(
  XLSX.write(emptyWorkbook, { type: "array", bookType: "xlsx" }),
);
const emptyLoaded = model.readSpreadsheet("new.xlsx", emptyBytes);
if (!emptyLoaded.editable || emptyLoaded.sheets[0].rows.length !== 100 || emptyLoaded.sheets[0].cols !== 26) {
  throw new Error("새 XLSX가 편집 가능한 100행 × 26열 통합문서가 아님");
}
for (const [kind, path] of [
  ["pdf", "sample.pdf"],
  ["xlsx", "sample.xls"],
  ["xlsx", "sample.csv"],
]) {
  if (types.isEditableDoc(kind, path)) throw new Error(`${path} 저장이 허용됨`);
}

const sheet = XLSX.utils.aoa_to_sheet([[1, 2], ["원본", true]]);
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, sheet, "데이터");
const sourceBytes = new Uint8Array(
  XLSX.write(workbook, { type: "array", bookType: "xlsx" }),
);

let loaded = model.readSpreadsheet("sample.xlsx", sourceBytes);
if (!loaded.editable) throw new Error(`기본 XLSX가 읽기 전용임: ${loaded.readOnlyReason}`);
const baseline = model.spreadsheetCellInput(loaded, 0, 0, 0);
loaded = model.editSpreadsheetCell(loaded, 0, 0, 0, "42");
const draft = model.updateSpreadsheetDraft("", "데이터", "A1", "42");
const saved = model.serializeSpreadsheet("sample.xlsx", sourceBytes, draft);
const reopened = XLSX.read(saved, { type: "array", cellFormula: true });

if (reopened.Sheets["데이터"].A1.v !== 42) throw new Error("숫자 저장 실패");
const revertedDraft = model.updateSpreadsheetDraft(
  draft,
  "데이터",
  "A1",
  baseline,
);
if (!revertedDraft) {
  throw new Error("저장 중 원래 값으로 되돌린 변경이 유실될 수 있음");
}
const revertedSaved = model.serializeSpreadsheet(
  "sample.xlsx",
  saved,
  revertedDraft,
);
const revertedBook = XLSX.read(revertedSaved, { type: "array" });
if (revertedBook.Sheets["데이터"].A1.v !== 1) throw new Error("원래 값 저장 실패");

const batchChanges = Array.from({ length: 1000 }, (_, index) => {
  const row = Math.floor(index / 10);
  const col = index % 10;
  return [row, col, String(index)];
});
const batchDraft = model.updateSpreadsheetDraftBatch(
  "",
  "데이터",
  batchChanges.map(([row, col, input]) => [
    XLSX.utils.encode_cell({ r: row, c: col }),
    input,
  ]),
);
const batchLoaded = model.editSpreadsheetCells(loaded, 0, batchChanges);
if (batchLoaded.sheets[0].rows[99][9] !== "999") {
  throw new Error("다중 셀 편집 실패");
}
const batchSaved = model.serializeSpreadsheet("sample.xlsx", sourceBytes, batchDraft);
const batchBook = XLSX.read(batchSaved, { type: "array" });
if (batchBook.Sheets["데이터"].J100.v !== 999) {
  throw new Error("다중 셀 저장 실패");
}

const numericDisplay = model.editSpreadsheetCell(loaded, 0, 1, 0, "001");
if (numericDisplay.sheets[0].rows[1][0] !== "1") {
  throw new Error("숫자 입력 표시와 저장 형식이 다름");
}
const textDisplay = model.editSpreadsheetCell(loaded, 0, 1, 0, "'001");
if (textDisplay.sheets[0].rows[1][0] !== "001") {
  throw new Error("텍스트 강제 입력 실패");
}

const unsafeNumberDisplay = model.editSpreadsheetCells(loaded, 0, [
  [0, 0, "1e309"],
  [0, 1, "12345678901234567890"],
]);
if (
  unsafeNumberDisplay.sheets[0].rows[0][0] !== "1e309" ||
  unsafeNumberDisplay.sheets[0].rows[0][1] !== "12345678901234567890" ||
  unsafeNumberDisplay.sheets[0].nums[0][0] ||
  unsafeNumberDisplay.sheets[0].nums[0][1]
) {
  throw new Error("유한 범위·15자리 정밀도를 넘는 숫자 원문이 보존되지 않음");
}
const unsafeNumberDraft = model.updateSpreadsheetDraftBatch("", "데이터", [
  ["A1", "1e309"],
  ["B1", "12345678901234567890"],
]);
const unsafeNumberBook = XLSX.read(
  model.serializeSpreadsheet("sample.xlsx", sourceBytes, unsafeNumberDraft),
  { type: "array" },
);
if (
  unsafeNumberBook.Sheets["데이터"].A1.t !== "s" ||
  unsafeNumberBook.Sheets["데이터"].A1.v !== "1e309" ||
  unsafeNumberBook.Sheets["데이터"].B1.t !== "s" ||
  unsafeNumberBook.Sheets["데이터"].B1.v !== "12345678901234567890"
) {
  throw new Error("정밀도 손실 가능 숫자가 문자열로 저장되지 않음");
}

const textSourceSheet = XLSX.utils.aoa_to_sheet([
  ["001", "TRUE", "=SUM(A1:A2)", "'lead"],
]);
const textSourceBook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(textSourceBook, textSourceSheet, "텍스트");
const textSourceBytes = new Uint8Array(
  XLSX.write(textSourceBook, { type: "array", bookType: "xlsx" }),
);
const textSourceLoaded = model.readSpreadsheet("text.xlsx", textSourceBytes);
const clipboardInputs = [0, 1, 2, 3].map((col) =>
  model.spreadsheetCellClipboardInput(textSourceLoaded, 0, 0, col),
);
if (JSON.stringify(clipboardInputs) !== JSON.stringify(["'001", "'TRUE", "'=SUM(A1:A2)", "''lead"])) {
  throw new Error("텍스트 셀의 복사 타입 보존 실패");
}
const copiedDraft = model.updateSpreadsheetDraftBatch(
  "",
  "텍스트",
  clipboardInputs.map((input, col) => [XLSX.utils.encode_cell({ r: 1, c: col }), input]),
);
const copiedBook = XLSX.read(
  model.serializeSpreadsheet("text.xlsx", textSourceBytes, copiedDraft),
  { type: "array" },
);
if (
  JSON.stringify(["A2", "B2", "C2", "D2"].map((address) => copiedBook.Sheets["텍스트"][address]?.v)) !==
  JSON.stringify(["001", "TRUE", "=SUM(A1:A2)", "'lead"])
) {
  throw new Error("텍스트 셀 복사·붙여넣기 저장 타입이 바뀜");
}

const tsvRows = [["a\nb", "x\ty", '따옴표 "값"'], ["001", ""]];
const tsv = model.stringifyTsv(tsvRows);
if (JSON.stringify(model.parseTsv(`${tsv}\r\n`)) !== JSON.stringify(tsvRows)) {
  throw new Error("따옴표·줄바꿈 포함 TSV 왕복 실패");
}
let malformedTsvRejected = false;
try {
  model.parseTsv('"닫히지 않음');
} catch {
  malformedTsvRejected = true;
}
if (!malformedTsvRejected) throw new Error("잘못된 TSV 따옴표가 허용됨");

const beforeFormula = loaded;
if (model.editSpreadsheetCell(loaded, 0, 0, 1, "=A1+5") !== beforeFormula) {
  throw new Error("지원하지 않는 수식 입력이 허용됨");
}

let hostileRejected = false;
try {
  model.serializeSpreadsheet(
    "sample.xlsx",
    sourceBytes,
    JSON.stringify([["__proto__", "A1", "오염"]]),
  );
} catch {
  hostileRejected = true;
}
if (!hostileRejected || Object.prototype.A1 !== undefined) {
  throw new Error("잘못된 시트 패치가 거부되지 않음");
}

let invalidAddressRejected = false;
try {
  model.serializeSpreadsheet(
    "sample.xlsx",
    sourceBytes,
    JSON.stringify([["데이터", "a1", "2"]]),
  );
} catch {
  invalidAddressRejected = true;
}
if (!invalidAddressRejected) throw new Error("비표준 셀 주소가 거부되지 않음");

const formulaSheet = XLSX.utils.aoa_to_sheet([[1, 2]]);
formulaSheet.B1 = { t: "n", f: "A1*2", v: 2 };
const formulaWorkbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(formulaWorkbook, formulaSheet, "수식");
const formulaBytes = new Uint8Array(
  XLSX.write(formulaWorkbook, { type: "array", bookType: "xlsx" }),
);
const formulaLoaded = model.readSpreadsheet("formula.xlsx", formulaBytes);
if (formulaLoaded.editable || !formulaLoaded.readOnlyReason?.includes("수식")) {
  throw new Error("수식 통합문서가 읽기 전용이 아님");
}

const styledSheet = XLSX.utils.aoa_to_sheet([[1.25]]);
styledSheet.A1.z = "0.00";
const styledWorkbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(styledWorkbook, styledSheet, "서식");
const styledBytes = new Uint8Array(
  XLSX.write(styledWorkbook, {
    type: "array",
    bookType: "xlsx",
    cellStyles: true,
  }),
);
const styledLoaded = model.readSpreadsheet("styled.xlsx", styledBytes);
if (styledLoaded.editable || !styledLoaded.readOnlyReason?.includes("서식")) {
  throw new Error("서식 통합문서가 읽기 전용이 아님");
}

const dateSheet = XLSX.utils.aoa_to_sheet([[46219]]);
dateSheet.A1 = { t: "n", v: 46219, z: "yyyy-mm-dd" };
const dateWorkbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(dateWorkbook, dateSheet, "날짜");
const dateBytes = new Uint8Array(
  XLSX.write(dateWorkbook, { type: "array", bookType: "xlsx" }),
);
const dateLoaded = model.readSpreadsheet("date.xlsx", dateBytes);
if (model.spreadsheetCellInput(dateLoaded, 0, 0, 0) !== "2026-07-16") {
  throw new Error("날짜가 시간대에 따라 달라짐");
}

let legacyRejected = false;
try {
  model.serializeSpreadsheet("sample.xls", sourceBytes, draft);
} catch {
  legacyRejected = true;
}
if (!legacyRejected) throw new Error("legacy 형식 저장이 허용됨");

console.log("xlsx edit round-trip ok");
