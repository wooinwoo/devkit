// 파싱된 크론 필드 → 사람이 읽는 한국어 문장.
import type { ParsedField } from "./cron";

const DOW_KR = ["일", "월", "화", "수", "목", "금", "토"];

/** 연속 구간을 "a-b" 로 압축해 나열 (예: [1,2,3,5] → "1~3, 5") */
function listRuns(values: number[], fmt: (n: number) => string): string {
  if (values.length === 0) return "";
  const runs: string[] = [];
  let start = values[0];
  let prev = values[0];
  for (let i = 1; i <= values.length; i++) {
    const v = values[i];
    if (v === prev + 1) {
      prev = v;
      continue;
    }
    runs.push(start === prev ? fmt(start) : `${fmt(start)}~${fmt(prev)}`);
    start = v;
    prev = v;
  }
  return runs.join(", ");
}

function isStep(values: number[], min: number, max: number): number | null {
  if (values.length < 3 || values[0] !== min) return null;
  const step = values[1] - values[0];
  if (step <= 1) return null;
  for (let i = 1; i < values.length; i++) {
    if (values[i] - values[i - 1] !== step) return null;
  }
  // 마지막 값이 max 근처까지 커버하는지 (부분 리스트면 스텝으로 안 봄)
  if (values[values.length - 1] + step <= max) return null;
  return step;
}

export function describe(fields: ParsedField[]): string {
  const [min, hour, dom, month, dow] = fields;

  // ── 시각(분·시) 파트 ──────────────────────────
  let timePart: string;
  const everyMin = min.isEvery;
  const everyHour = hour.isEvery;

  const minStep = isStep(min.values, 0, 59);
  const hourStep = isStep(hour.values, 0, 23);

  if (everyMin && everyHour) {
    timePart = "매 분";
  } else if (minStep && everyHour) {
    timePart = `${minStep}분마다`;
  } else if (everyMin && !everyHour) {
    timePart = `${listRuns(hour.values, (h) => `${h}시`)} 동안 매 분`;
  } else if (min.values.length === 1 && everyHour) {
    timePart = `매시 ${min.values[0]}분`;
  } else if (hourStep && min.values.length === 1) {
    timePart = `${hourStep}시간마다 ${min.values[0]}분`;
  } else if (min.values.length === 1 && hour.values.length >= 1) {
    const hh = listRuns(hour.values, (h) => `${String(h).padStart(2, "0")}시`);
    timePart = `${hh} ${String(min.values[0]).padStart(2, "0")}분`;
  } else {
    const hh = everyHour ? "매시" : listRuns(hour.values, (h) => `${h}시`);
    const mm = listRuns(min.values, (m) => `${m}분`);
    timePart = `${hh}, ${mm}`;
  }

  // ── 날짜(요일·일·월) 파트 ─────────────────────
  const dateParts: string[] = [];

  if (!dow.isEvery) {
    // 평일/주말 특수 표현
    const set = new Set(dow.values);
    const isWeekday = [1, 2, 3, 4, 5].every((d) => set.has(d)) && set.size === 5;
    const isWeekend = set.has(0) && set.has(6) && set.size === 2;
    if (isWeekday) dateParts.push("평일(월~금)");
    else if (isWeekend) dateParts.push("주말(토·일)");
    else dateParts.push(`${listRuns(dow.values, (d) => DOW_KR[d] + "요일")}`);
  }

  if (!dom.isEvery) {
    dateParts.push(`${listRuns(dom.values, (d) => `${d}일`)}`);
  }

  if (!month.isEvery) {
    const MONTH_KR = (m: number) => `${m}월`;
    dateParts.push(`${listRuns(month.values, MONTH_KR)}`);
  }

  // ── 조합 ──────────────────────────────────────
  if (dateParts.length === 0) {
    // 날짜 제약 없음 → 매일
    if (timePart === "매 분") return "매 분 (1분마다)";
    if (timePart.endsWith("마다")) return timePart;
    return `매일 ${timePart}`;
  }

  // dom + dow 둘 다 있으면 크론은 OR — 문장도 "또는"
  const dateJoiner =
    !dom.isEvery && !dow.isEvery ? " 또는 " : " ";
  const datePhrase = dateParts.join(dateJoiner);
  return `${datePhrase} ${timePart}`;
}
