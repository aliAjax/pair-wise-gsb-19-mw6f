// 日期工具：全部按本地日期以 "YYYY-MM-DD" 字符串参与加减，避免时区漂移

export function todayStr(d: Date = new Date()): string {
  return toDayStr(d);
}

export function toDayStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function nowDateTimeLocal(d: Date = new Date()): string {
  return `${toDayStr(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 从 datetime-local 值取日期部分（YYYY-MM-DD） */
export function datePart(dateTimeLocal: string): string {
  return dateTimeLocal.slice(0, 10);
}

export function parseDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** a 加 n 天，返回 YYYY-MM-DD */
export function addDays(day: string, n: number): string {
  const d = parseDay(day);
  d.setDate(d.getDate() + n);
  return toDayStr(d);
}

/** 两个 YYYY-MM-DD 相差天数：b - a */
export function diffDays(a: string, b: string): number {
  const ms = parseDay(b).getTime() - parseDay(a).getTime();
  return Math.round(ms / 86400000);
}

/** 实际停药日 = 计划停药日 + 换水累计顺延天数 */
export function effectiveStopDate(plannedStopDate: string, postponementDays: number): string {
  return addDays(plannedStopDate, postponementDays);
}

export function fmtDateTimeLocal(v: string): string {
  return v.replace("T", " ");
}
