import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const xlsxUrl = pathToFileURL(join(root, "node_modules/xlsx/xlsx.mjs")).href;

/** TS 모듈을 data: URL 로 올린다. 상대 임포트는 먼저 올린 모듈 URL 로 바꾼다. */
const moduleCache = new Map();
async function load(relative) {
  const cached = moduleCache.get(relative);
  if (cached) return cached;
  const source = await readFile(join(root, relative), "utf8");
  let output = ts
    .transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    })
    .outputText.replaceAll('from "xlsx"', `from "${xlsxUrl}"`);
  for (const spec of source.match(/from "\.\/[\w-]+"/g) ?? []) {
    const name = spec.slice(7, -1);
    const dep = await load(`${dirname(relative)}/${name}.ts`);
    output = output.replaceAll(spec, `from "${dep.url}"`);
  }
  const url = `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`;
  const module = { url, ...(await import(url)) };
  moduleCache.set(relative, module);
  return module;
}

const model = await load("src/doc/xlsxModel.ts");
const patch = await load("src/doc/xlsxPatch.ts");
const types = await load("src/doc/types.ts");
const XLSX = await import(xlsxUrl);

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
  ["docx", "sample.docx"],
]) {
  if (types.isEditableDoc(kind, path)) throw new Error(`${path} 저장이 허용됨`);
}
for (const path of ["sample.csv", "sample.tsv"]) {
  if (!types.isEditableDoc("xlsx", path)) throw new Error(`${path} 편집이 막힘`);
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

// 수식이 있는 통합문서: 통합문서는 열되 수식 셀만 막고, 저장해도 수식이 남는다.
const formulaSheet = XLSX.utils.aoa_to_sheet([[1, 2]]);
formulaSheet.B1 = { t: "n", f: "A1*2", v: 2 };
const formulaWorkbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(formulaWorkbook, formulaSheet, "수식");
const formulaBytes = new Uint8Array(
  XLSX.write(formulaWorkbook, { type: "array", bookType: "xlsx" }),
);
const formulaLoaded = model.readSpreadsheet("formula.xlsx", formulaBytes);
if (!formulaLoaded.editable) {
  throw new Error(`수식 통합문서가 읽기 전용임: ${formulaLoaded.readOnlyReason}`);
}
if (model.spreadsheetCellEditable(formulaLoaded, 0, 0, 1)) {
  throw new Error("수식 셀이 편집 가능함");
}
if (!model.spreadsheetCellEditable(formulaLoaded, 0, 0, 0)) {
  throw new Error("수식이 참조하는 일반 셀이 편집 불가함");
}
const formulaSaved = XLSX.read(
  model.serializeSpreadsheet(
    "formula.xlsx",
    formulaBytes,
    model.updateSpreadsheetDraft("", "수식", "A1", "9"),
  ),
  { type: "array", cellFormula: true },
);
if (formulaSaved.Sheets["수식"].B1?.f !== "A1*2") {
  throw new Error("저장 후 수식이 사라짐");
}
if (formulaSaved.Sheets["수식"].A1?.v !== 9) throw new Error("수식 옆 셀 저장 실패");
let formulaCellRejected = false;
try {
  model.serializeSpreadsheet(
    "formula.xlsx",
    formulaBytes,
    JSON.stringify([["수식", "B1", "7"]]),
  );
} catch {
  formulaCellRejected = true;
}
if (!formulaCellRejected) throw new Error("수식 셀 덮어쓰기가 허용됨");

// 서식이 있는 통합문서: 편집 가능해야 하고, 저장해도 표시 형식이 남는다.
const styledSheet = XLSX.utils.aoa_to_sheet([[1.25, 2.5]]);
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
if (!styledLoaded.editable) {
  throw new Error(`서식 통합문서가 읽기 전용임: ${styledLoaded.readOnlyReason}`);
}
const styledSaved = model.serializeSpreadsheet(
  "styled.xlsx",
  styledBytes,
  model.updateSpreadsheetDraft("", "서식", "A1", "3.5"),
);
const styledBook = XLSX.read(styledSaved, { type: "array", cellStyles: true, cellNF: true });
if (styledBook.Sheets["서식"].A1?.v !== 3.5) throw new Error("서식 셀 값 저장 실패");
if (styledBook.Sheets["서식"].A1?.z !== "0.00") {
  throw new Error(`저장 후 표시 형식이 사라짐: ${styledBook.Sheets["서식"].A1?.z}`);
}

// 편집한 시트 XML과 workbook.xml 외의 파트는 바이트 그대로 남아야 한다.
const partsOf = (bytes) => {
  const cfb = XLSX.CFB.read(bytes, { type: "buffer" });
  const map = new Map();
  cfb.FullPaths.forEach((full, index) => {
    const entry = cfb.FileIndex[index];
    if (entry?.type === 2 && entry.content) {
      map.set(full.replace(/^Root Entry\//, ""), Uint8Array.from(entry.content));
    }
  });
  return map;
};
const beforeParts = partsOf(styledBytes);
const afterParts = partsOf(styledSaved);
const changedParts = [...afterParts.keys()].filter((name) => {
  const before = beforeParts.get(name);
  const after = afterParts.get(name);
  return !before || before.length !== after.length || !before.every((b, i) => b === after[i]);
});
if (changedParts.some((name) => !/worksheets\/sheet1\.xml$|\/workbook\.xml$/.test(name))) {
  throw new Error(`편집과 무관한 파트가 다시 쓰임: ${changedParts.join(", ")}`);
}
if (!afterParts.has("xl/styles.xml")) throw new Error("styles.xml 이 사라짐");

// CSV: 값 편집 후 저장하면 텍스트가 그대로 다시 쓰인다.
const csvBytes = new TextEncoder().encode("이름,수량\r\n가,1\r\n나,2\r\n");
const csvLoaded = model.readSpreadsheet("sample.csv", csvBytes);
if (!csvLoaded.editable) throw new Error("CSV 가 읽기 전용임");
if (csvLoaded.sheets[0].rows[1][0] !== "가") throw new Error("CSV 파싱 실패");
const csvSaved = model.serializeSpreadsheet(
  "sample.csv",
  csvBytes,
  model.updateSpreadsheetDraft("", csvLoaded.workbook.SheetNames[0], "B3", "99"),
);
const csvText = new TextDecoder().decode(csvSaved);
if (!csvText.includes("나,99")) throw new Error(`CSV 저장 실패: ${csvText}`);
if (!csvText.includes("\r\n")) throw new Error("CSV 줄바꿈이 원본과 달라짐");

const tsvBytes = new TextEncoder().encode("이름\t수량\n가\t1\n");
const tsvSaved = model.serializeSpreadsheet(
  "sample.tsv",
  tsvBytes,
  model.updateSpreadsheetDraft(
    "",
    model.readSpreadsheet("sample.tsv", tsvBytes).workbook.SheetNames[0],
    "B2",
    "7",
  ),
);
const tsvText = new TextDecoder().decode(tsvSaved);
if (!tsvText.includes("가\t7")) throw new Error(`TSV 저장 실패: ${tsvText}`);

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

// --- 다른 프로그램이 만든 통합문서 (예전엔 통째로 막던 케이스) ---
// SheetJS 가 만들지 않는 파트(차트·공유문자열)를 넣어 실제 Excel 파일을 흉내낸다.
const foreignBase = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(
  foreignBase,
  XLSX.utils.aoa_to_sheet([["머리글", 1], ["행", 2]]),
  "Sheet1",
);
// bookSST 로 실제 Excel 처럼 공유 문자열 테이블을 쓰게 한다.
const foreignArchive = XLSX.CFB.read(
  new Uint8Array(
    XLSX.write(foreignBase, {
      type: "array",
      bookType: "xlsx",
      bookSST: true,
      compression: true,
    }),
  ),
  { type: "buffer" },
);
const encode = (text) => new TextEncoder().encode(text);
const partText = (archive, suffix) => {
  const index = archive.FullPaths.findIndex((full) => full.endsWith(suffix));
  return index < 0
    ? null
    : new TextDecoder().decode(Uint8Array.from(archive.FileIndex[index].content));
};
XLSX.CFB.utils.cfb_add(
  foreignArchive,
  "/xl/charts/chart1.xml",
  encode('<?xml version="1.0"?><chartSpace>차트 자리</chartSpace>'),
);
// 우리가 모델링하지 않는 시트 기능(열 너비·조건부 서식)을 원본 XML 에 심는다.
XLSX.CFB.utils.cfb_add(
  foreignArchive,
  "/xl/worksheets/sheet1.xml",
  encode(
    partText(foreignArchive, "worksheets/sheet1.xml")
      .replace(
        "<sheetData>",
        '<cols><col min="1" max="1" width="20" customWidth="1"/></cols><sheetData>',
      )
      .replace(
        "</worksheet>",
        '<conditionalFormatting sqref="B1:B2"><cfRule type="cellIs" dxfId="0" priority="1" operator="greaterThan"><formula>1</formula></cfRule></conditionalFormatting></worksheet>',
      ),
  ),
);
XLSX.CFB.utils.cfb_add(
  foreignArchive,
  "/docProps/app.xml",
  encode(
    partText(foreignArchive, "docProps/app.xml").replace(
      /<Application>[^<]*<\/Application>/,
      "<Application>Microsoft Excel</Application>",
    ),
  ),
);
const foreignBytes = new Uint8Array(
  XLSX.CFB.write(foreignArchive, { type: "array", fileType: "zip", compression: true }),
);

const foreignLoaded = model.readSpreadsheet("foreign.xlsx", foreignBytes);
if (!foreignLoaded.editable) {
  throw new Error(`외부 프로그램 통합문서가 읽기 전용임: ${foreignLoaded.readOnlyReason}`);
}
if (foreignLoaded.sheets[0].rows[0][0] !== "머리글") {
  throw new Error(`공유 문자열 읽기 실패: ${JSON.stringify(foreignLoaded.sheets[0].rows)}`);
}
const foreignSaved = model.serializeSpreadsheet(
  "foreign.xlsx",
  foreignBytes,
  model.updateSpreadsheetDraftBatch("", "Sheet1", [["B2", "50"], ["C1", "새 값"]]),
);
const foreignParts = partsOf(foreignSaved);
const foreignSheetXml = new TextDecoder().decode(foreignParts.get("xl/worksheets/sheet1.xml"));
if (!foreignParts.has("xl/charts/chart1.xml")) throw new Error("차트 파트가 사라짐");
if (
  new TextDecoder().decode(foreignParts.get("xl/sharedStrings.xml")) !==
  new TextDecoder().decode(partsOf(foreignBytes).get("xl/sharedStrings.xml"))
) {
  throw new Error("공유 문자열 테이블이 다시 쓰임");
}
if (!foreignSheetXml.includes("<conditionalFormatting")) throw new Error("조건부 서식이 사라짐");
if (!foreignSheetXml.includes('<col min="1" max="1" width="20"')) throw new Error("열 너비가 사라짐");
if (!foreignSheetXml.includes('<c r="A1" t="s"><v>0</v></c>')) {
  throw new Error(`건드리지 않은 공유 문자열 셀이 바뀜: ${JSON.stringify(foreignSheetXml)}`);
}
if (!foreignSheetXml.includes("<ignoredErrors>")) {
  throw new Error("모델링하지 않은 시트 요소가 사라짐");
}
const foreignBook = XLSX.read(foreignSaved, { type: "array" });
if (foreignBook.Sheets.Sheet1.B2?.v !== 50) throw new Error("외부 통합문서 값 저장 실패");
if (foreignBook.Sheets.Sheet1.C1?.v !== "새 값") throw new Error("새 셀 추가 실패");
if (foreignBook.Sheets.Sheet1.A2?.v !== "행") throw new Error("공유 문자열 참조가 깨짐");

// 패처 단위: 열 순서와 XML 이스케이프
const patched = patch.patchSheetXml(
  '<worksheet><sheetData><row r="1"><c r="B1"><v>1</v></c></row></sheetData></worksheet>',
  new Map([["A1", { kind: "string", value: "<&>" }]]),
);
if (!patched.includes('<c r="A1" t="inlineStr"><is><t>&lt;&amp;&gt;</t></is></c><c r="B1">')) {
  throw new Error(`셀 삽입 순서 또는 이스케이프 실패: ${patched}`);
}

console.log("xlsx edit round-trip ok");
