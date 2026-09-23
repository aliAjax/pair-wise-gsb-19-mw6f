// 资料模块：鱼缸与药品目录、初始库存（独立维护，剂量计算 / 保存均只读取本模块导出）
import type { Medicine, Tank } from "./types";

export const TANKS: Tank[] = [
  { id: "tank-a", name: "草缸A", kind: "草缸", volumeL: 120, medLimitMlPerL: 0.05 },
  { id: "tank-b", name: "海缸B", kind: "海缸", volumeL: 200, medLimitMlPerL: 0.03 },
  { id: "tank-c", name: "繁殖缸C", kind: "繁殖缸", volumeL: 60, medLimitMlPerL: 0.08 },
  { id: "tank-d", name: "三湖缸D", kind: "三湖缸", volumeL: 150, medLimitMlPerL: 0.04 },
];

export const MEDICINES: Medicine[] = [
  { id: "med-01", name: "甲基蓝溶液", spec: "100ml/瓶，水霉白点", stockMl: 60 },
  { id: "med-02", name: "高锰酸钾片", spec: "24片/盒，消毒杀菌", stockMl: 24 },
  { id: "med-03", name: "大白片（甲硝唑）", spec: "40片/瓶，内寄头洞", stockMl: 40 },
  { id: "med-04", name: "黄粉（呋喃西林）", spec: "50g/瓶，烂尾外伤", stockMl: 50 },
  { id: "med-05", name: "海盐", spec: "500g/袋，渗透压辅助", stockMl: 500 },
];

export function findTank(id: string): Tank | undefined {
  return TANKS.find((t) => t.id === id);
}

export function findMedicine(id: string): Medicine | undefined {
  return MEDICINES.find((m) => m.id === id);
}

/** 当前库存 = 资料初始库存 + 保存模块中的增量 */
export function currentStock(medicineId: string, stockDelta: Record<string, number>): number {
  const med = findMedicine(medicineId);
  if (!med) return 0;
  return round1(med.stockMl + (stockDelta[medicineId] ?? 0));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
