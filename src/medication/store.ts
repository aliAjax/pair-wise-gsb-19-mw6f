import { DEFAULT_MEDICINES, DEFAULT_TANKS } from "./catalog";
import { addDays, calcPostponeDays } from "./dose";
import type {
  BatchEntryInput,
  MedCourse,
  MedState,
  Postponement,
} from "./types";

// 保存：localStorage 持久化与状态变更，独立于资料、剂量计算与界面

const STORAGE_KEY = "hxwl-05-medication-v1";

export function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function seed(): MedState {
  return {
    tanks: DEFAULT_TANKS,
    medicines: DEFAULT_MEDICINES,
    courses: [],
  };
}

export function loadState(): MedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seed();
    const parsed = JSON.parse(raw) as MedState;
    if (!Array.isArray(parsed.tanks) || !Array.isArray(parsed.medicines) || !Array.isArray(parsed.courses)) {
      return seed();
    }
    return parsed;
  } catch {
    return seed();
  }
}

export function saveState(state: MedState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/** 整批登记成功后调用：扣库存、建疗程（每个疗程带 create 版本）。调用前须已通过整批校验。 */
export function createCourses(state: MedState, entries: BatchEntryInput[]): MedState {
  const nowIso = new Date().toISOString();
  const courses = entries.map((entry): MedCourse => {
    const startIso = new Date(entry.startedAt).toISOString();
    const days = Number(entry.courseDays);
    return {
      id: uid("course"),
      tankId: entry.tankId,
      symptom: entry.symptom.trim(),
      medicine: entry.medicine,
      doseAmount: Number(entry.doseAmount),
      startedAt: startIso,
      courseDays: days,
      plannedStopAt: addDays(startIso, days),
      status: "active",
      postponements: [],
      versions: [
        {
          version: 1,
          createdAt: nowIso,
          change: "create",
          courseDays: days,
          plannedStopAt: addDays(startIso, days),
        },
      ],
    };
  });

  const medicines = state.medicines.map((m) => {
    const used = entries
      .filter((e) => e.medicine === m.name)
      .reduce((sum, e) => sum + Number(e.doseAmount), 0);
    return used > 0 ? { ...m, stock: round1(m.stock - used) } : m;
  });

  return { ...state, medicines, courses: [...state.courses, ...courses] };
}

/**
 * 疗程中换水：疗程暂停，按换水量顺延停药日，同时追加换水记录与新版本，
 * 并通过 version 号与换水记录保持对应。
 */
export function applyWaterChange(
  state: MedState,
  courseId: string,
  changeLiters: number
): MedState {
  const nowIso = new Date().toISOString();
  const courses = state.courses.map((course) => {
    if (course.id !== courseId || course.status !== "active") return course;
    const tank = state.tanks.find((t) => t.id === course.tankId);
    if (!tank) return course;

    const days = calcPostponeDays({
      changeLiters,
      tankLiters: tank.liters,
      plannedStopAt: course.plannedStopAt,
      nowIso,
    });
    const stopBefore = course.plannedStopAt;
    const stopAfter = addDays(stopBefore, days);
    const version = course.versions.length + 1;
    const record: Postponement = {
      id: uid("postpone"),
      at: nowIso,
      liters: changeLiters,
      postponedDays: days,
      stopBefore,
      stopAfter,
      version,
    };
    return {
      ...course,
      plannedStopAt: stopAfter,
      postponements: [...course.postponements, record],
      versions: [
        ...course.versions,
        {
          version,
          createdAt: nowIso,
          change: "water-change",
          courseDays: round1((new Date(stopAfter).getTime() - new Date(course.startedAt).getTime()) / 86400000),
          plannedStopAt: stopAfter,
          changeLiters,
          postponedDays: days,
        },
      ],
    };
  });
  return { ...state, courses };
}

/** 提前撤药：必须填写原因，新建版本保留旧值可查。 */
export function stopCourseEarly(
  state: MedState,
  courseId: string,
  reason: string
): MedState {
  const nowIso = new Date().toISOString();
  const courses = state.courses.map((course) => {
    if (course.id !== courseId || course.status !== "active") return course;
    const version = course.versions.length + 1;
    return {
      ...course,
      status: "stopped-early" as const,
      actualStopAt: nowIso,
      stopReason: reason,
      versions: [
        ...course.versions,
        {
          version,
          createdAt: nowIso,
          change: "early-stop",
          courseDays: round1((new Date(nowIso).getTime() - new Date(course.startedAt).getTime()) / 86400000),
          plannedStopAt: nowIso,
          reason,
        },
      ],
    };
  });
  return { ...state, courses };
}

/** 正常到期确认结束（旧计划停药日保留在版本历史中）。 */
export function completeCourse(state: MedState, courseId: string): MedState {
  const nowIso = new Date().toISOString();
  const courses = state.courses.map((course) => {
    if (course.id !== courseId || course.status !== "active") return course;
    const version = course.versions.length + 1;
    return {
      ...course,
      status: "completed" as const,
      actualStopAt: nowIso,
      versions: [
        ...course.versions,
        {
          version,
          createdAt: nowIso,
          change: "complete",
          courseDays: round1((new Date(nowIso).getTime() - new Date(course.startedAt).getTime()) / 86400000),
          plannedStopAt: course.plannedStopAt,
        },
      ],
    };
  });
  return { ...state, courses };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
