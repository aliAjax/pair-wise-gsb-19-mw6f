// 剂量计算模块：纯函数，不碰 localStorage 与 React。
// 负责：缸体上限、库存需求、整批校验、停药日推算、换水顺延。
import { currentStock, findMedicine, findTank } from "./catalog";
import { addDays, datePart, diffDays, effectiveStopDate } from "./dateUtils";
import type { Course } from "./types";

/** 登记页一行输入 */
export interface RowInput {
  id: string;
  tankId: string;
  symptom: string;
  medicineId: string;
  doseText: string; // 单次剂量（ml），保留原始文本用于"保留输入"
  startedAt: string; // datetime-local
  durationText: string; // 疗程天数
}

export type BlockKind = "fields" | "open-course" | "over-cap" | "stock";

export interface BlockIssue {
  rowId: string;
  kind: BlockKind;
  tankName: string; // 受阻鱼缸（未知时用占位）
  medicineName: string; // 受阻药名
  detail: string; // 受阻原因
  shortfallMl?: number; // 库存差额（仅 stock）
}

export interface BatchCheckResult {
  ok: boolean;
  issues: BlockIssue[];
}

/** 单次投药缸体上限（ml）= 容量(L) × 单升上限 */
export function capMlOf(tankId: string): number {
  const tank = findTank(tankId);
  if (!tank) return NaN;
  return round3(tank.volumeL * tank.medLimitMlPerL);
}

/** 该疗程整疗程药量需求（ml）= 单次剂量 × 疗程天数 */
export function neededMl(doseMl: number, durationDays: number): number {
  return round3(doseMl * durationDays);
}

export function plannedStopOf(startedAt: string, durationDays: number): string {
  return addDays(datePart(startedAt), durationDays);
}

/** 截至 atDay 疗程剩余天数（含停药日当天，最小 0） */
export function remainingDays(course: Course, atDay: string): number {
  const stop = effectiveStopDate(course.plannedStopDate, course.postponementDays);
  return Math.max(0, diffDays(atDay, stop) + 1);
}

/** 疗程在 atDay 是否未结（状态 active 且日期在投药日之后、实际停药日之内） */
export function isOpenAt(course: Course, atDay: string): boolean {
  if (course.status !== "active") return false;
  const start = datePart(course.startedAt);
  const stop = effectiveStopDate(course.plannedStopDate, course.postponementDays);
  return atDay >= start && atDay <= stop;
}

/**
 * 换水顺延停药日：
 * 顺延天数 = ⌈换水量比例 × 当前剩余疗程天数⌉，不足 1 天按 1 天。
 */
export function waterPostponeDays(course: Course, percent: number, atDay: string): number {
  const rest = remainingDays(course, atDay);
  if (rest <= 0) return 0;
  return Math.max(1, Math.ceil((percent / 100) * rest));
}

interface ParsedRow {
  doseMl: number;
  durationDays: number;
}

/**
 * 整批校验：任意一行不通过则整批拒绝（ok=false），
 * 调用方必须保留全部输入并展示 issues。
 */
export function checkBatch(
  rows: RowInput[],
  ctx: { courses: Course[]; stockDelta: Record<string, number> }
): BatchCheckResult {
  const issues: BlockIssue[] = [];
  const parsed = new Map<string, ParsedRow>();
  const tankSeen = new Set<string>();

  rows.forEach((row) => {
    const tank = findTank(row.tankId);
    const med = findMedicine(row.medicineId);
    const tankName = tank?.name ?? "未选鱼缸";
    const medicineName = med?.name ?? "未选药品";

    // 1) 字段完整性 / 数值合法性
    const fieldProblems: string[] = [];
    if (!tank) fieldProblems.push("鱼缸未选");
    if (!row.symptom.trim()) fieldProblems.push("病症未填");
    if (!med) fieldProblems.push("药名未选");

    const doseMl = Number(row.doseText);
    const durationDays = Number(row.durationText);
    if (row.doseText.trim() === "" || !Number.isFinite(doseMl) || doseMl <= 0) {
      fieldProblems.push("单次剂量需为大于 0 的数字");
    }
    if (
      row.durationText.trim() === "" ||
      !Number.isInteger(durationDays) ||
      durationDays < 1
    ) {
      fieldProblems.push("疗程天数需为不小于 1 的整数");
    }
    if (!row.startedAt) fieldProblems.push("投药时刻未选");

    if (fieldProblems.length > 0) {
      issues.push({ rowId: row.id, kind: "fields", tankName, medicineName, detail: fieldProblems.join("；") });
      return; // 该行后续校验无意义，但不影响其他行
    }
    parsed.set(row.id, { doseMl, durationDays });

    // 2) 同批重复鱼缸
    if (tankSeen.has(row.tankId)) {
      issues.push({
        rowId: row.id,
        kind: "open-course",
        tankName: tankName!,
        medicineName: medicineName!,
        detail: "同一鱼缸在本批登记中重复",
      });
    }
    tankSeen.add(row.tankId);

    // 3) 同缸已有未结疗程
    const open = ctx.courses.find((c) => c.tankId === row.tankId && c.status === "active");
    if (open) {
      const openMed = findMedicine(open.medicineId)?.name ?? "未知药品";
      issues.push({
        rowId: row.id,
        kind: "open-course",
        tankName: tankName!,
        medicineName: medicineName!,
        detail: `同缸已有未结疗程（${openMed}，投药 ${open.startedAt.replace("T", " ")}）`,
      });
    }

    // 4) 剂量超缸体上限
    const cap = capMlOf(row.tankId);
    if (doseMl > cap) {
      issues.push({
        rowId: row.id,
        kind: "over-cap",
        tankName: tankName!,
        medicineName: medicineName!,
        detail: `单次剂量 ${fmt(doseMl)} ml 超过缸体上限 ${fmt(cap)} ml（${tank!.volumeL} L × ${tank!.medLimitMlPerL} ml/L）`,
      });
    }
  });

  // 5) 库存：同一药品本批需求汇总后与当前库存比较（只汇总通过字段校验的行）
  const needByMed = new Map<string, number>();
  for (const row of rows) {
    const p = parsed.get(row.id);
    if (!p) continue;
    needByMed.set(
      row.medicineId,
      round3((needByMed.get(row.medicineId) ?? 0) + neededMl(p.doseMl, p.durationDays))
    );
  }
  for (const row of rows) {
    const p = parsed.get(row.id);
    const med = findMedicine(row.medicineId);
    if (!p || !med) continue;
    const need = needByMed.get(row.medicineId)!;
    const stock = currentStock(row.medicineId, ctx.stockDelta);
    const shortfall = round3(need - stock);
    if (shortfall > 0) {
      const tank = findTank(row.tankId);
      issues.push({
        rowId: row.id,
        kind: "stock",
        tankName: tank?.name ?? "未选鱼缸",
        medicineName: med.name,
        detail: `本批共需 ${fmt(need)} ml，库存仅 ${fmt(stock)} ml`,
        shortfallMl: shortfall,
      });
    }
  }

  return { ok: issues.length === 0, issues };
}

export function fmt(n: number): string {
  return String(round3(n));
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
