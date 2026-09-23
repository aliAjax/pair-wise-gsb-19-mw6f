// 用药与停药期管理 —— 领域模型（独立模块，不依赖 React / 存储 / 界面）

/** 疗程状态：active 未结疗程；completed-* 已结案，不再阻挡同缸新登记 */
export type CourseStatus = "active" | "completed-early" | "completed-scheduled";

/** 鱼缸资料 */
export interface Tank {
  id: string;
  name: string;
  kind: string; // 缸型：草缸 / 海缸 …
  volumeL: number; // 缸体容量（升）
  medLimitMlPerL: number; // 单次投药缸体上限（ml/L）
}

/** 药品资料 */
export interface Medicine {
  id: string;
  name: string;
  spec: string; // 规格说明
  stockMl: number; // 初始库存（ml）
}

/** 疗程中的换水事件：每次换水都会顺延停药日 */
export interface WaterChangeEvent {
  id: string;
  at: string; // 换水时刻（YYYY-MM-DDTHH:mm）
  percent: number; // 换水量百分比 1-100
  addedDays: number; // 本次顺延停药日的天数
  note: string;
}

/** 疗程版本快照：登记即 v1，提前撤药 / 结案追加新版本，旧值永久可查 */
export interface CourseVersion {
  version: number;
  action: "created" | "early-stop" | "scheduled-complete";
  changedAt: string; // 版本产生时刻
  reason: string; // created: "用药登记"；early-stop: 必填的撤药原因
  snapshot: VersionSnapshot;
}

export interface VersionSnapshot {
  status: CourseStatus;
  symptom: string;
  medicineId: string;
  doseMl: number;
  startedAt: string;
  durationDays: number;
  plannedStopDate: string; // 不含顺延的计划停药日
  postponementDays: number; // 截至该版本累计顺延天数
}

/** 用药疗程 */
export interface Course {
  id: string;
  tankId: string;
  symptom: string;
  medicineId: string;
  doseMl: number; // 单次剂量（ml）
  startedAt: string; // 投药时刻（YYYY-MM-DDTHH:mm）
  durationDays: number; // 疗程天数
  plannedStopDate: string; // 计划停药日（YYYY-MM-DD）
  postponementDays: number; // 换水导致的累计顺延天数
  waterChanges: WaterChangeEvent[];
  versions: CourseVersion[];
  status: CourseStatus;
  endedAt?: string; // 结案时刻
}

/** 换水流水（疗程内 / 非疗程都记录，疗程内的通过 courseId 与疗程对应） */
export interface WaterRecord {
  id: string;
  tankId: string;
  at: string;
  percent: number;
  note: string;
  courseId?: string;
  addedDays?: number;
}

/** 持久化状态：库存以相对资料初始值的增量记录（ml，消耗为负） */
export interface MedicationState {
  version: 1;
  courses: Course[];
  waterRecords: WaterRecord[];
  stockDelta: Record<string, number>;
  seq: number;
}
