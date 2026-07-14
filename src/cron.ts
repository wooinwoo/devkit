// 크론 표현식 파서 — 라이브러리 없이 직접 구현.
// 표준 5필드: 분 시 일 월 요일
//   분(0-59) 시(0-23) 일(1-31) 월(1-12) 요일(0-7, 0·7=일요일)
// 지원 문법: *  숫자  a-b(범위)  a,b,c(리스트)  */n(스텝)  a-b/n

export type FieldKind = "minute" | "hour" | "dom" | "month" | "dow";

export type FieldSpec = {
  kind: FieldKind;
  label: string;
  min: number;
  max: number;
};

export const FIELDS: FieldSpec[] = [
  { kind: "minute", label: "분", min: 0, max: 59 },
  { kind: "hour", label: "시", min: 0, max: 23 },
  { kind: "dom", label: "일", min: 1, max: 31 },
  { kind: "month", label: "월", min: 1, max: 12 },
  { kind: "dow", label: "요일", min: 0, max: 6 },
];

export type ParsedField = {
  raw: string;
  /** 매치하는 값 집합 (정렬됨) */
  values: number[];
  /** 전체(*)인지 */
  isEvery: boolean;
};

export type ParseResult =
  | { ok: true; fields: ParsedField[] }
  | { ok: false; error: string; fieldIndex?: number };

/** 단일 필드 파싱 → 값 집합 */
function parseField(raw: string, spec: FieldSpec): ParsedField {
  const trimmed = raw.trim();
  if (trimmed === "") throw new Error(`${spec.label} 필드가 비어 있어요.`);

  const values = new Set<number>();

  for (const part of trimmed.split(",")) {
    const [rangePart, stepPart] = part.split("/");
    const step = stepPart === undefined ? 1 : Number(stepPart);

    if (stepPart !== undefined && (!Number.isInteger(step) || step <= 0)) {
      throw new Error(`${spec.label}: 스텝 "/${stepPart}" 은 1 이상 정수여야 해요.`);
    }

    let lo: number;
    let hi: number;

    if (rangePart === "*") {
      lo = spec.min;
      hi = spec.max;
    } else if (rangePart.includes("-")) {
      const [a, b] = rangePart.split("-");
      lo = Number(a);
      hi = Number(b);
      if (!Number.isInteger(lo) || !Number.isInteger(hi)) {
        throw new Error(`${spec.label}: 범위 "${rangePart}" 를 이해 못 했어요.`);
      }
    } else {
      lo = Number(rangePart);
      hi = lo;
      if (!Number.isInteger(lo)) {
        throw new Error(`${spec.label}: "${rangePart}" 는 숫자가 아니에요.`);
      }
    }

    // 요일 7 → 0(일요일) 정규화
    if (spec.kind === "dow") {
      if (lo === 7) lo = 0;
      if (hi === 7) hi = 0;
    }

    if (lo < spec.min || hi > spec.max || lo > hi) {
      throw new Error(
        `${spec.label}: "${part}" 이 허용 범위(${spec.min}~${spec.max}) 를 벗어났어요.`,
      );
    }

    for (let v = lo; v <= hi; v += step) values.add(v);
  }

  return {
    raw: trimmed,
    values: [...values].sort((a, b) => a - b),
    isEvery: trimmed === "*",
  };
}

export function parseCron(expr: string): ParseResult {
  const parts = expr.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { ok: false, error: "표현식을 입력해 주세요." };
  }
  if (parts.length !== 5) {
    return {
      ok: false,
      error: `필드가 ${parts.length}개예요. 표준 크론은 "분 시 일 월 요일" 5개입니다.`,
    };
  }

  const fields: ParsedField[] = [];
  for (let i = 0; i < 5; i++) {
    try {
      fields.push(parseField(parts[i], FIELDS[i]));
    } catch (e) {
      return { ok: false, error: (e as Error).message, fieldIndex: i };
    }
  }
  return { ok: true, fields };
}

/** 크론 규칙에 해당 시각이 매치하는지 */
function matches(date: Date, fields: ParsedField[]): boolean {
  const [min, hour, dom, month, dow] = fields;
  if (!min.values.includes(date.getMinutes())) return false;
  if (!hour.values.includes(date.getHours())) return false;
  if (!month.values.includes(date.getMonth() + 1)) return false;

  // dom / dow 결합 규칙: 둘 다 제한(non-*)이면 OR, 아니면 AND (표준 크론 동작)
  const domMatch = dom.values.includes(date.getDate());
  const dowMatch = dow.values.includes(date.getDay());
  if (!dom.isEvery && !dow.isEvery) return domMatch || dowMatch;
  return domMatch && dowMatch;
}

/** 다음 실행 시각 n개 (from 이후) */
export function nextRuns(fields: ParsedField[], from: Date, count: number): Date[] {
  const runs: Date[] = [];
  const cursor = new Date(from);
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);

  // 최대 4년치 분(안전 상한) 안에서 탐색
  const limit = 60 * 24 * 366 * 4;
  for (let i = 0; i < limit && runs.length < count; i++) {
    if (matches(cursor, fields)) runs.push(new Date(cursor));
    cursor.setMinutes(cursor.getMinutes() + 1);
  }
  return runs;
}
