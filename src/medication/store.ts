// 保存模块：独立负责持久化与状态迁移。纯状态函数不依赖 localStorage，可单独验证。
import { currentStock } from "./catalog";
import { datePart, diffDays, effectiveStopDate, nowDateTimeLocal } from "./dateUtils";
import { neededMl, plannedStopOf, waterPostponeDays } from "./dose";
import type {
  Course,
  CourseVersion,
  MedicationState,
  VersionSnapshot,
  WaterRecord,
} from "./types";
import type { RowInput } from "./dose";

const STORAGE_KEY = "hxwl-05-medication-v1";

export function emptyState(): MedicationState {
  return { version: 1, courses: [], waterRecords: [], stockDelta: {}, seq: 0 };
}

export function loadState(): MedicationState {
  if (typeof localStorage === "undefined") return emptyState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as MedicationState;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.courses)) return emptyState();
    return {
      version: 1,
      courses: parsed.courses,
      waterRecords: Array.isArray(parsed.waterRecords) ? parsed.waterRecords : [],
      stockDelta: parsed.stockDelta ?? {},
      seq: typeof parsed.seq === "number" ? parsed.seq : 0,
    };
  } catch {
    return emptyState();
  }
}

export function saveState(state: MedicationState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 隐私模式等场景静默失败：本次会话内状态仍然有效
  }
}

export function resetState(): MedicationState {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  return emptyState();
}

function nextId(state: MedicationState, prefix: string): { id: string; seq: number } {
  const seq = state.seq + 1;
  return { id: `${prefix}-${String(seq).padStart(4, "0")}`, seq };
}

function snapshot(c: Course): VersionSnapshot {
  return {
    status: c.status,
    symptom: c.symptom,
    medicineId: c.medicineId,
    doseMl: c.doseMl,
    startedAt: c.startedAt,
    durationDays: c.durationDays,
    plannedStopDate: c.plannedStopDate,
    postponementDays: c.postponementDays,
  };
}

/**
 * 登记疗程（仅在剂量模块 checkBatch 通过后调用）。
 * 疗程、库存扣减一次写入；每疗程版本从 v1(created) 开始。
 */
export function registerCourses(prev: MedicationState, rows: RowInput[]): MedicationState {
  const state: MedicationState = {
    ...prev,
    courses: [...prev.courses],
    stockDelta: { ...prev.stockDelta },
  };

  for (const row of rows) {
    const doseMl = Number(row.doseText);
    const durationDays = Number(row.durationText);
    const idInfo = nextId(state, "course");
    state.seq = idInfo.seq;

    const course: Course = {
      id: idInfo.id,
      tankId: row.tankId,
      symptom: row.symptom.trim(),
      medicineId: row.medicineId,
      doseMl,
      startedAt: row.startedAt,
      durationDays,
      plannedStopDate: plannedStopOf(row.startedAt, durationDays),
      postponementDays: 0,
      waterChanges: [],
      versions: [],
      status: "active",
    };
    course.versions.push({
      version: 1,
      action: "created",
      changedAt: nowDateTimeLocal(),
      reason: "用药登记",
      snapshot: snapshot(course),
    });
    state.courses.push(course);

    const consume = neededMl(doseMl, durationDays);
    state.stockDelta[row.medicineId] = round3((state.stockDelta[row.medicineId] ?? 0) - consume);
  }
  return state;
}

/** 疗程中换水：先暂停拦截、确认后调用。顺延停药日并把事件挂到疗程上，保证重新打开后仍对应。 */
export function applyWaterChange(
  prev: MedicationState,
  args: {
    course?: Course;
    tankId: string;
    at: string;
    percent: number;
    note: string;
  }
): { state: MedicationState; addedDays: number } {
  const state: MedicationState = {
    ...prev,
    courses: prev.courses.map((c) => ({ ...c, waterChanges: [...c.waterChanges], versions: [...c.versions] })),
    waterRecords: [...prev.waterRecords],
  };

  const wId = nextId(state, "water");
  state.seq = wId.seq;
  const atDay = datePart(args.at);

  let addedDays = 0;
  let courseId: string | undefined;

  if (args.course) {
    addedDays = waterPostponeDays(args.course, args.percent, atDay);
    courseId = args.course.id;
    const idx = state.courses.findIndex((c) => c.id === args.course!.id);
    if (idx >= 0) {
      const c = state.courses[idx];
      c.postponementDays += addedDays;
      c.waterChanges.push({
        id: wId.id,
        at: args.at,
        percent: args.percent,
        addedDays,
        note: args.note.trim(),
      });
    }
  }

  const record: WaterRecord = {
    id: wId.id,
    tankId: args.tankId,
    at: args.at,
    percent: args.percent,
    note: args.note.trim(),
  };
  if (courseId) record.courseId = courseId;
  if (courseId) record.addedDays = addedDays;
  state.waterRecords.unshift(record);

  return { state, addedDays };
}

/**
 * 提前撤药：必须填写原因。不覆盖旧值——追加新版本，旧版本快照永久可查。
 */
export function stopCourseEarly(
  prev: MedicationState,
  courseId: string,
  reason: string
): MedicationState {
  const state: MedicationState = {
    ...prev,
    courses: prev.courses.map((c) =>
      c.id === courseId ? { ...c, waterChanges: [...c.waterChanges], versions: [...c.versions] } : c
    ),
  };
  const idx = state.courses.findIndex((c) => c.id === courseId);
  if (idx < 0) return prev;
  const c = state.courses[idx];
  if (c.status !== "active") return prev;

  c.status = "completed-early";
  c.endedAt = nowDateTimeLocal();
  c.versions.push({
    version: c.versions.length + 1,
    action: "early-stop",
    changedAt: c.endedAt,
    reason: reason.trim(),
    snapshot: snapshot(c),
  });
  return state;
}

/** 到期自动结案：到达实际停药日次日起视为完成，追加 scheduled-complete 版本 */
export function settleExpiredCourses(prev: MedicationState, today: string): MedicationState {
  let changed = false;
  const state: MedicationState = {
    ...prev,
    courses: prev.courses.map((c) =>
      c.status === "active"
        ? { ...c, waterChanges: [...c.waterChanges], versions: [...c.versions] }
        : c
    ),
  };
  for (const c of state.courses) {
    if (c.status !== "active") continue;
    const stop = effectiveStopDate(c.plannedStopDate, c.postponementDays);
    if (diffDays(stop, today) < 1) continue; // 停药日当天仍视为疗程内，次日才结案
    c.status = "completed-scheduled";
    c.endedAt = `${today}T00:00`;
    const v: CourseVersion = {
      version: c.versions.length + 1,
      action: "scheduled-complete",
      changedAt: c.endedAt,
      reason: "疗程到期，按停药日结案",
      snapshot: snapshot(c),
    };
    c.versions.push(v);
    changed = true;
  }
  return changed ? state : prev;
}

/** 只读辅助：当前某药库存（供界面展示，等价于 catalog.currentStock） */
export function stockOf(state: MedicationState, medicineId: string): number {
  return currentStock(medicineId, state.stockDelta);
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
