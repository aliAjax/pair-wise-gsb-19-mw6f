import { findMedicine, findTank } from "./catalog";
import type {
  BatchEntryInput,
  MedCourse,
  Medicine,
  Tank,
} from "./types";

// 剂量计算与整批校验：纯函数，无存储、无界面依赖

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function addDays(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * MS_PER_DAY).toISOString();
}

/** 疗程是否尚未结束（已到期但未确认完成仍算未结，仍拦截同缸新药） */
export function isCourseOpen(course: MedCourse, now: Date = new Date()): boolean {
  if (course.status !== "active") return false;
  return new Date(course.plannedStopAt).getTime() >= now.getTime();
}

/**
 * 换水顺延天数：按换水量占缸体容量的比例 × 剩余疗程天数，向上取整，至少 1 天。
 * 换水期间疗程暂停，因此停药日整体后移。
 */
export function calcPostponeDays(params: {
  changeLiters: number;
  tankLiters: number;
  plannedStopAt: string;
  nowIso: string;
}): number {
  const ratio = Math.min(1, params.changeLiters / params.tankLiters);
  const remainMs = new Date(params.plannedStopAt).getTime() - new Date(params.nowIso).getTime();
  const remainDays = Math.max(0, remainMs / MS_PER_DAY);
  return Math.max(1, Math.ceil(remainDays * ratio));
}

export interface RowError {
  row: number;
  tankName?: string;
  medicine?: string;
  reasons: string[];
}

export interface BatchRejection {
  rejected: true;
  errors: RowError[];
  /** 受阻库存差额：药名 -> 差额（需补药量） */
  stockDeficits: { medicine: string; unit: string; deficit: number }[];
}

export type BatchCheckResult =
  | { rejected: false }
  | BatchRejection;

/**
 * 整批校验：任一缸存在未结疗程、单次剂量超缸体上限、或某药总量超过库存，
 * 则整批拒绝（不产生任何数据变更，由界面保留输入）。
 */
export function checkBatchEntries(params: {
  entries: BatchEntryInput[];
  tanks: Tank[];
  medicines: Medicine[];
  courses: MedCourse[];
  now?: Date;
}): BatchCheckResult {
  const { entries, tanks, medicines, courses, now } = params;
  const errors: RowError[] = [];
  const seenTank = new Map<string, number>();
  // 按药名汇总本批用量，再统一与库存比较
  const needByMedicine = new Map<string, number>();
  const parsed: { row: number; tank?: Tank; medicine?: Medicine; dose: number }[] = [];

  entries.forEach((entry, index) => {
    const row = index + 1;
    const reasons: string[] = [];
    const tank = findTank(tanks, entry.tankId);
    const medicine = findMedicine(medicines, entry.medicine);
    const dose = Number(entry.doseAmount);
    const days = Number(entry.courseDays);

    if (!tank) reasons.push("未选择鱼缸");
    if (!entry.symptom.trim()) reasons.push("未填写病症");
    if (!medicine) reasons.push("未选择药品");
    if (!Number.isFinite(dose) || dose <= 0) reasons.push("剂量须为大于 0 的数字");
    if (!entry.startedAt) reasons.push("未选择投药时刻");
    if (!Number.isFinite(days) || days <= 0 || !Number.isInteger(days)) {
      reasons.push("疗程天数须为正整数");
    }

    if (tank) {
      if (seenTank.has(tank.id)) {
        reasons.push(`与本批第 ${seenTank.get(tank.id)} 行登记同一鱼缸`);
      } else {
        seenTank.set(tank.id, row);
      }
      const openCourse = courses.find(
        (c) => c.tankId === tank.id && isCourseOpen(c, now)
      );
      if (openCourse) {
        reasons.push(`该缸已有未结疗程：${openCourse.medicine}，计划停药 ${formatDate(openCourse.plannedStopAt)}`);
      }
      if (medicine && Number.isFinite(dose) && dose > tank.maxDose) {
        reasons.push(`剂量 ${dose}${medicine.unit} 超过缸体单次上限 ${tank.maxDose}${medicine.unit}`);
      }
    }

    if (medicine && Number.isFinite(dose) && dose > 0) {
      needByMedicine.set(medicine.name, (needByMedicine.get(medicine.name) ?? 0) + dose);
    }

    if (reasons.length > 0) {
      errors.push({
        row,
        tankName: tank?.name,
        medicine: medicine?.name,
        reasons,
      });
    }
    parsed.push({ row, tank, medicine, dose });
  });

  // 库存：整批合计与当前库存比较
  const stockDeficits: BatchRejection["stockDeficits"] = [];
  for (const [name, needed] of needByMedicine) {
    const medicine = medicines.find((m) => m.name === name)!;
    if (needed > medicine.stock) {
      const deficit = round1(needed - medicine.stock);
      stockDeficits.push({ medicine: name, unit: medicine.unit, deficit });
      // 将库存差额挂到用到该药的每一行，确保受阻时“显示鱼缸、药名、库存差额”
      parsed
        .filter((p) => p.medicine?.name === name)
        .forEach((p) => {
          const rowError =
            errors.find((e) => e.row === p.row) ??
            makeRowError(p.row, p.tank?.name, name);
          rowError.reasons.push(
            `库存不足：${name} 本批共需 ${round1(needed)}${medicine.unit}，库存 ${round1(medicine.stock)}${medicine.unit}，差额 ${deficit}${medicine.unit}`
          );
          if (!errors.includes(rowError)) errors.push(rowError);
        });
    }
  }

  if (errors.length > 0) {
    errors.sort((a, b) => a.row - b.row);
    return { rejected: true, errors, stockDeficits };
  }
  return { rejected: false };
}

function makeRowError(row: number, tankName: string | undefined, medicine: string | undefined): RowError {
  return { row, tankName, medicine, reasons: [] };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDay(iso: string): string {
  return formatDate(iso).slice(0, 10);
}
