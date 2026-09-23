// 用药管理：资料模型（独立于计算、保存与界面）

export interface Tank {
  id: string;
  name: string;
  /** 缸体容量（升） */
  liters: number;
  /** 单次投药剂量上限（与药品单位一致） */
  maxDose: number;
}

export interface Medicine {
  name: string;
  /** 库存单位，如 mL / g */
  unit: string;
  /** 当前库存量 */
  stock: number;
}

/** 批量登记表单中的一行（保留原始输入文本，被拒绝时不丢失） */
export interface BatchEntryInput {
  tankId: string;
  symptom: string;
  medicine: string;
  doseAmount: string;
  startedAt: string;
  courseDays: string;
}

export type VersionChange = "create" | "water-change" | "early-stop" | "complete";

export interface CourseVersion {
  version: number;
  createdAt: string;
  change: VersionChange;
  /** 该版本下的疗程天数 */
  courseDays: number;
  /** 该版本下的计划停药时刻 */
  plannedStopAt: string;
  /** 提前撤药原因 */
  reason?: string;
  /** 换水顺延对应的换水量（升） */
  changeLiters?: number;
  /** 换水顺延天数 */
  postponedDays?: number;
}

/** 疗程中的一次换水顺延记录 */
export interface Postponement {
  id: string;
  at: string;
  liters: number;
  postponedDays: number;
  stopBefore: string;
  stopAfter: string;
  /** 对应的版本号，保证“换水顺延和版本仍对应” */
  version: number;
}

export type CourseStatus = "active" | "completed" | "stopped-early";

export interface MedCourse {
  id: string;
  tankId: string;
  symptom: string;
  medicine: string;
  doseAmount: number;
  /** 投药时刻 */
  startedAt: string;
  /** 原始疗程天数 */
  courseDays: number;
  /** 当前计划停药时刻（随换水顺延累积后移） */
  plannedStopAt: string;
  status: CourseStatus;
  actualStopAt?: string;
  stopReason?: string;
  postponements: Postponement[];
  versions: CourseVersion[];
}

export interface MedState {
  tanks: Tank[];
  medicines: Medicine[];
  courses: MedCourse[];
}
