import type { Medicine, Tank } from "./types";

// 资料：鱼缸与药品库存（与剂量计算、保存、界面解耦，可单独替换为后端数据）

export const DEFAULT_TANKS: Tank[] = [
  { id: "tank-grass-a", name: "草缸A", liters: 120, maxDose: 12 },
  { id: "tank-reef-b", name: "海缸B", liters: 200, maxDose: 20 },
  { id: "tank-breed-c", name: "繁殖缸C", liters: 80, maxDose: 8 },
];

export const DEFAULT_MEDICINES: Medicine[] = [
  { name: "甲基蓝溶液", unit: "mL", stock: 60 },
  { name: "土霉素", unit: "g", stock: 20 },
  { name: "福尔马林", unit: "mL", stock: 40 },
  { name: "大白片（甲硝唑）", unit: "片", stock: 30 },
];

export function findTank(tanks: Tank[], id: string): Tank | undefined {
  return tanks.find((t) => t.id === id);
}

export function findMedicine(medicines: Medicine[], name: string): Medicine | undefined {
  return medicines.find((m) => m.name === name);
}
