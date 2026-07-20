import * as XLSX from "xlsx";

/**
 * 원본 xlsx 아카이브에서 편집한 셀이 들어 있는 시트 XML만 고쳐 쓰고 나머지
 * 파트는 바이트 그대로 보존한다. 통합문서를 다시 만들지 않으므로 서식·수식·
 * 차트·피벗처럼 우리가 모델링하지 않는 기능도 원본 그대로 남는다.
 */

export type PatchValue =
  | { kind: "number"; value: number }
  | { kind: "string"; value: string }
  | { kind: "bool"; value: boolean }
  | { kind: "blank" };

/** 시트 이름 → 그 시트의 셀 주소별 새 값 */
export type PatchPlan = Map<string, Map<string, PatchValue>>;

const ROOT = "Root Entry/";

type Archive = {
  FullPaths: string[];
  FileIndex: { type?: number; content?: Uint8Array | number[] }[];
};

function partName(fullPath: string): string {
  return fullPath.startsWith(ROOT) ? fullPath.slice(ROOT.length) : fullPath;
}

function contentOf(archive: Archive, path: string): Uint8Array | undefined {
  const index = archive.FullPaths.findIndex((full) => partName(full) === path);
  if (index < 0) return undefined;
  const entry = archive.FileIndex[index];
  return entry?.content ? Uint8Array.from(entry.content) : undefined;
}

function textOf(archive: Archive, path: string): string {
  const bytes = contentOf(archive, path);
  return bytes ? new TextDecoder().decode(bytes) : "";
}

function replacePart(archive: Archive, path: string, text: string) {
  XLSX.CFB.utils.cfb_add(
    archive as never,
    `/${path}`,
    new TextEncoder().encode(text) as never,
  );
}

function attr(tag: string, name: string): string | undefined {
  const match = new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`).exec(tag);
  return match?.[1];
}

function escapeXml(text: string): string {
  return text
    // XML 1.0이 허용하지 않는 제어문자는 Excel이 파일을 거부하게 만든다.
    .replace(/[\0-\x08\x0b\x0c\x0e-\x1f]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** 시트 이름 → xl/worksheets/sheetN.xml 경로 (workbook.xml + rels 기준) */
function sheetPartMap(archive: Archive): Map<string, string> {
  const workbookXml = textOf(archive, "xl/workbook.xml");
  const relsXml = textOf(archive, "xl/_rels/workbook.xml.rels");
  const targets = new Map<string, string>();
  for (const tag of relsXml.match(/<Relationship\b[^>]*>/g) ?? []) {
    const id = attr(tag, "Id");
    const target = attr(tag, "Target");
    if (!id || !target) continue;
    const normalized = target.replace(/^\/?(?:xl\/)?/, "");
    targets.set(id, `xl/${normalized}`);
  }

  const map = new Map<string, string>();
  const sheets = /<sheets\b[^>]*>([\s\S]*?)<\/sheets>/.exec(workbookXml)?.[1] ?? "";
  let fallback = 0;
  for (const tag of sheets.match(/<sheet\b[^>]*\/?>/g) ?? []) {
    fallback += 1;
    const name = attr(tag, "name");
    if (!name) continue;
    const rid = attr(tag, "r:id") ?? attr(tag, "relationships:id");
    const part = (rid && targets.get(rid)) || `xl/worksheets/sheet${fallback}.xml`;
    map.set(decodeXmlName(name), part);
  }
  return map;
}

function decodeXmlName(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** 여는 태그 하나를 읽어 `<row ...>` 인지 `<row .../>` 인지 구분한다. */
function tagEnd(xml: string, start: number): { end: number; selfClosed: boolean } {
  let quote: string | null = null;
  for (let i = start; i < xml.length; i++) {
    const char = xml[i];
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === ">") {
      return { end: i + 1, selfClosed: xml[i - 1] === "/" };
    }
  }
  throw new Error("시트 XML의 태그가 닫히지 않았어요.");
}

interface Chunk {
  /** 요소 전체 원문 */
  raw: string;
  /** 여는 태그 */
  open: string;
  /** 여는 태그와 닫는 태그 사이 (self-closing 이면 "") */
  inner: string;
  /** r 속성값 (행 번호 또는 셀 주소) */
  ref: string;
  selfClosed: boolean;
}

/** `<row>` 또는 `<c>` 요소를 순서대로 잘라낸다. */
function splitChunks(xml: string, tag: "row" | "c"): { chunks: Chunk[]; gaps: string[] } {
  const chunks: Chunk[] = [];
  const gaps: string[] = [];
  const open = `<${tag}`;
  const close = `</${tag}>`;
  let cursor = 0;

  while (cursor < xml.length) {
    const start = xml.indexOf(open, cursor);
    // `<row` 가 `<rowBreaks` 같은 다른 태그의 접두사로 걸리지 않게 한다.
    if (start < 0) break;
    const next = xml[start + open.length];
    if (next !== undefined && !/[\s/>]/.test(next)) {
      cursor = start + open.length;
      continue;
    }
    const { end, selfClosed } = tagEnd(xml, start);
    let finish = end;
    let inner = "";
    if (!selfClosed) {
      const closeAt = xml.indexOf(close, end);
      if (closeAt < 0) throw new Error(`시트 XML의 <${tag}> 가 닫히지 않았어요.`);
      inner = xml.slice(end, closeAt);
      finish = closeAt + close.length;
    }
    gaps.push(xml.slice(cursor, start));
    const openTag = xml.slice(start, end);
    chunks.push({
      raw: xml.slice(start, finish),
      open: openTag,
      inner,
      ref: attr(openTag, "r") ?? "",
      selfClosed,
    });
    cursor = finish;
  }
  gaps.push(xml.slice(cursor));
  return { chunks, gaps };
}

function columnIndex(address: string): number {
  const letters = /^([A-Z]+)/.exec(address)?.[1] ?? "";
  let index = 0;
  for (const char of letters) index = index * 26 + (char.charCodeAt(0) - 64);
  return index;
}

function rowNumber(address: string): number {
  return Number(/(\d+)$/.exec(address)?.[1] ?? 0);
}

/** 값 부분만 새로 쓰고 style(s) 등 나머지 속성은 원본 여는 태그에서 가져온다. */
function buildCell(address: string, open: string | undefined, value: PatchValue): string {
  const style = open ? attr(open, "s") : undefined;
  const meta = open ? attr(open, "cm") : undefined;
  const attrs = [
    ` r="${address}"`,
    style != null ? ` s="${style}"` : "",
    meta != null ? ` cm="${meta}"` : "",
  ];

  if (value.kind === "blank") {
    return `<c${attrs.join("")}/>`;
  }
  if (value.kind === "number") {
    return `<c${attrs.join("")}><v>${value.value}</v></c>`;
  }
  if (value.kind === "bool") {
    return `<c${attrs.join("")} t="b"><v>${value.value ? 1 : 0}</v></c>`;
  }
  // sharedStrings.xml 을 건드리지 않으려고 inline string 으로 쓴다. 원본의
  // 공유 문자열 테이블과 그 참조 카운트가 그대로 유지된다.
  const space = /^\s|\s$/.test(value.value) ? ' xml:space="preserve"' : "";
  return `<c${attrs.join("")} t="inlineStr"><is><t${space}>${escapeXml(value.value)}</t></is></c>`;
}

function patchRow(row: Chunk, edits: Map<string, PatchValue>): string {
  const { chunks } = splitChunks(row.inner, "c");
  const seen = new Set<string>();
  const cells = chunks.map((cell) => {
    const value = edits.get(cell.ref);
    if (value) seen.add(cell.ref);
    return {
      ref: cell.ref,
      xml: value ? buildCell(cell.ref, cell.open, value) : cell.raw,
    };
  });
  for (const [address, value] of edits) {
    if (seen.has(address)) continue;
    cells.push({ ref: address, xml: buildCell(address, undefined, value) });
  }
  // Excel 은 열 순서가 어긋난 셀이 있으면 파일을 복구 대상으로 본다.
  cells.sort((a, b) => columnIndex(a.ref) - columnIndex(b.ref));
  // spans 는 행의 사용 열 범위 힌트라 셀을 늘리면 낡는다. 지우면 Excel 이 새로 계산한다.
  const open = row.open.replace(/\s+spans="[^"]*"/, "");
  return `${open}${cells.map((cell) => cell.xml).join("")}</row>`;
}

function openRowTag(rowNum: number): string {
  return `<row r="${rowNum}">`;
}

/** sheetData 안의 대상 행·셀만 교체한 새 시트 XML을 만든다. */
export function patchSheetXml(xml: string, edits: Map<string, PatchValue>): string {
  if (!edits.size) return xml;

  const empty = /<sheetData\s*\/>/.exec(xml);
  const body = empty
    ? { start: empty.index, end: empty.index + empty[0].length, inner: "" }
    : (() => {
        const open = /<sheetData\b[^>]*>/.exec(xml);
        if (!open) throw new Error("시트 XML에 sheetData 가 없어요.");
        const from = open.index + open[0].length;
        const closeAt = xml.indexOf("</sheetData>", from);
        if (closeAt < 0) throw new Error("시트 XML의 sheetData 가 닫히지 않았어요.");
        return { start: open.index, end: closeAt + "</sheetData>".length, inner: xml.slice(from, closeAt) };
      })();

  const openTag = empty ? "<sheetData>" : /<sheetData\b[^>]*>/.exec(xml)![0];
  const { chunks, gaps } = splitChunks(body.inner, "row");

  const byRow = new Map<number, Map<string, PatchValue>>();
  for (const [address, value] of edits) {
    const line = rowNumber(address);
    if (!line) throw new Error(`셀 주소 ${address} 를 해석할 수 없어요.`);
    if (!byRow.has(line)) byRow.set(line, new Map());
    byRow.get(line)!.set(address, value);
  }

  const rows: { num: number; xml: string }[] = [];
  chunks.forEach((row) => {
    const num = Number(row.ref) || 0;
    const rowEdits = byRow.get(num);
    if (!rowEdits) {
      rows.push({ num, xml: row.raw });
      return;
    }
    byRow.delete(num);
    const source = row.selfClosed
      ? { ...row, open: row.open.replace(/\/>$/, ">"), inner: "" }
      : row;
    rows.push({ num, xml: patchRow(source, rowEdits) });
  });

  for (const [num, rowEdits] of byRow) {
    const cells = [...rowEdits.entries()]
      .sort(([a], [b]) => columnIndex(a) - columnIndex(b))
      .map(([address, value]) => buildCell(address, undefined, value));
    rows.push({ num, xml: `${openRowTag(num)}${cells.join("")}</row>` });
  }
  rows.sort((a, b) => a.num - b.num);

  // 행 사이 공백(들여쓰기)은 첫 gap 만 유지해 원문 결을 크게 흐트러뜨리지 않는다.
  const lead = gaps[0] ?? "";
  const tail = gaps[gaps.length - 1] ?? "";
  const sheetData = `${openTag}${lead}${rows.map((row) => row.xml).join("")}${tail}</sheetData>`;
  const patched = xml.slice(0, body.start) + sheetData + xml.slice(body.end);
  return updateDimension(patched, edits);
}

/** 편집으로 사용 범위가 넓어졌으면 dimension 을 넓힌다 (좁히지는 않는다). */
function updateDimension(xml: string, edits: Map<string, PatchValue>): string {
  const tag = /<dimension\b[^>]*\/>/.exec(xml);
  const ref = tag ? attr(tag[0], "ref") : undefined;
  if (!tag || !ref) return xml;
  const [from, to = from] = ref.split(":");
  let maxRow = rowNumber(to);
  let maxCol = columnIndex(to);
  let minRow = rowNumber(from) || 1;
  let minCol = columnIndex(from) || 1;
  for (const [address, value] of edits) {
    if (value.kind === "blank") continue;
    maxRow = Math.max(maxRow, rowNumber(address));
    maxCol = Math.max(maxCol, columnIndex(address));
    minRow = Math.min(minRow, rowNumber(address));
    minCol = Math.min(minCol, columnIndex(address));
  }
  const next = `${colName(minCol)}${minRow}:${colName(maxCol)}${maxRow}`;
  if (next === ref) return xml;
  return xml.replace(tag[0], tag[0].replace(`ref="${ref}"`, `ref="${next}"`));
}

function colName(index: number): string {
  let name = "";
  let rest = Math.max(1, index);
  while (rest > 0) {
    const rem = (rest - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    rest = Math.floor((rest - 1) / 26);
  }
  return name;
}

/**
 * 값이 바뀌면 그 값을 참조하는 수식의 캐시가 낡는다. Excel 이 열 때 전체
 * 재계산하도록 표시해 화면에 옛 결과가 남지 않게 한다.
 */
function forceRecalc(workbookXml: string): string {
  if (/<calcPr\b[^>]*\bfullCalcOnLoad="1"/.test(workbookXml)) return workbookXml;
  const calc = /<calcPr\b[^>]*\/>/.exec(workbookXml);
  if (calc) {
    const next = calc[0].replace(/\s*\/>$/, ' fullCalcOnLoad="1"/>');
    return workbookXml.replace(calc[0], next);
  }
  return workbookXml.replace(
    /<\/workbook>\s*$/,
    '<calcPr calcId="0" fullCalcOnLoad="1"/></workbook>',
  );
}

/**
 * 편집분을 되쓸 수 없는 구조인지 확인한다. 시트마다 대응하는 XML 파트가
 * 있어야 값만 고쳐 쓸 수 있다. 막을 이유가 없으면 undefined.
 */
export function patchBlocker(
  bytes: Uint8Array,
  sheetNames: string[],
): string | undefined {
  let archive: Archive;
  try {
    archive = XLSX.CFB.read(bytes, { type: "buffer" }) as Archive;
  } catch {
    return "파일 구조를 안전하게 확인할 수 없어 읽기 전용으로 열었어요.";
  }
  if (!archive.FullPaths?.length) {
    return "파일 구조를 안전하게 확인할 수 없어 읽기 전용으로 열었어요.";
  }
  const parts = sheetPartMap(archive);
  for (const name of sheetNames) {
    const part = parts.get(name);
    if (!part || !contentOf(archive, part)) {
      return "시트 구조를 확인할 수 없어 원본 보호를 위해 읽기 전용으로 열었어요.";
    }
  }
  return undefined;
}

/**
 * 원본 바이트에 편집을 적용한 새 xlsx 바이트를 만든다. 대상 시트 XML과
 * workbook.xml(재계산 표시) 외의 모든 파트는 원본 그대로 복사된다.
 */
export function patchWorkbookBytes(bytes: Uint8Array, plan: PatchPlan): Uint8Array {
  if (!plan.size) return bytes;
  const archive = XLSX.CFB.read(bytes, { type: "buffer" }) as Archive;
  const sheetParts = sheetPartMap(archive);

  for (const [sheetName, edits] of plan) {
    if (!edits.size) continue;
    const part = sheetParts.get(sheetName);
    if (!part) throw new Error(`${sheetName} 시트를 원본에서 찾을 수 없어요.`);
    const xml = textOf(archive, part);
    if (!xml) throw new Error(`${sheetName} 시트의 원본 데이터를 읽을 수 없어요.`);
    replacePart(archive, part, patchSheetXml(xml, edits));
  }

  const workbookXml = textOf(archive, "xl/workbook.xml");
  if (workbookXml) replacePart(archive, "xl/workbook.xml", forceRecalc(workbookXml));

  const output = XLSX.CFB.write(archive as never, {
    type: "array",
    fileType: "zip",
    compression: true,
  } as never);
  return output instanceof Uint8Array ? output : new Uint8Array(output as ArrayLike<number>);
}
