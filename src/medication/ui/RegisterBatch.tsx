// 界面模块（独立于资料/计算/保存）：批量用药登记表
import { useMemo, useState } from "react";
import { MEDICINES, TANKS } from "../catalog";
import { capMlOf, checkBatch, fmt, neededMl, type BlockIssue, type RowInput } from "../dose";
import type { Course } from "../types";
import { nowDateTimeLocal } from "../dateUtils";

interface Props {
  courses: Course[];
  stockDelta: Record<string, number>;
  onCommit: (rows: RowInput[]) => { ok: boolean; issues: BlockIssue[] };
  onNotice: (text: string) => void;
}

function emptyRow(seq: number): RowInput {
  return {
    id: `row-${seq}-${Math.random().toString(36).slice(2, 7)}`,
    tankId: TANKS[0]?.id ?? "",
    symptom: "",
    medicineId: MEDICINES[0]?.id ?? "",
    doseText: "",
    startedAt: nowDateTimeLocal(),
    durationText: "",
  };
}

const KIND_LABEL: Record<BlockIssue["kind"], string> = {
  fields: "资料不全",
  "open-course": "同缸未结疗程",
  "over-cap": "剂量超缸体上限",
  stock: "药量不足",
};

export default function RegisterBatch({ courses, stockDelta, onCommit, onNotice }: Props) {
  const [rows, setRows] = useState<RowInput[]>(() => [emptyRow(1)]);
  const [issues, setIssues] = useState<BlockIssue[]>([]);

  const issuesByRow = useMemo(() => {
    const map = new Map<string, BlockIssue[]>();
    for (const i of issues) {
      const list = map.get(i.rowId) ?? [];
      list.push(i);
      map.set(i.rowId, list);
    }
    return map;
  }, [issues]);

  function patch(id: string, key: keyof RowInput, value: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [key]: value } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow(prev.length + 1)]);
  }

  function removeRow(id: string) {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((r) => r.id !== id)));
  }

  function submit() {
    // 纯计算模块先校验；任何一行失败则整批拒绝，状态（输入）原样保留
    const check = checkBatch(rows, { courses, stockDelta });
    if (!check.ok) {
      setIssues(check.issues);
      return;
    }
    const result = onCommit(rows);
    if (!result.ok) {
      setIssues(result.issues);
      return;
    }
    setIssues([]);
    setRows([emptyRow(1)]);
    onNotice(`已登记 ${rows.length} 个疗程，库存按疗程总量扣减`);
  }

  return (
    <section className="panel med-panel">
      <div className="section-heading">
        <div>
          <p>用药登记</p>
          <h2>批量登记疗程</h2>
        </div>
        <div className="med-row-actions">
          <button type="button" onClick={addRow}>
            + 加一行
          </button>
          <button type="button" className="primary-action" onClick={submit}>
            整批提交
          </button>
        </div>
      </div>

      {issues.length > 0 && (
        <div className="med-block" role="alert">
          <h3>整批拒绝 · 输入已全部保留</h3>
          <ul>
            {issues.map((issue, i) => (
              <li key={`${issue.rowId}-${i}`}>
                <span className={`med-tag tag-${issue.kind}`}>{KIND_LABEL[issue.kind]}</span>
                <span className="med-block-target">
                  鱼缸「{issue.tankName}」 · 药名「{issue.medicineName}」
                </span>
                {issue.kind === "stock" && (
                  <span className="med-shortfall">库存差额 {fmt(issue.shortfallMl ?? 0)} ml</span>
                )}
                <span className="med-block-detail">{issue.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="med-form-list">
        {rows.map((row, index) => {
          const rowIssues = issuesByRow.get(row.id) ?? [];
          const cap = row.tankId ? capMlOf(row.tankId) : NaN;
          const tank = TANKS.find((t) => t.id === row.tankId);
          const need =
            Number(row.doseText) > 0 && Number(row.durationText) > 0
              ? neededMl(Number(row.doseText), Number(row.durationText))
              : null;
          return (
            <article
              key={row.id}
              className={`med-form-row${rowIssues.length ? " has-error" : ""}`}
            >
              <header>
                <span className="med-row-no">第 {index + 1} 缸</span>
                <button
                  type="button"
                  className="med-link-danger"
                  disabled={rows.length === 1}
                  onClick={() => removeRow(row.id)}
                >
                  删除该行
                </button>
              </header>
              <div className="med-form-grid">
                <label>
                  <span>鱼缸</span>
                  <select value={row.tankId} onChange={(e) => patch(row.id, "tankId", e.target.value)}>
                    {TANKS.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}（{t.kind} · {t.volumeL} L）
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>病症</span>
                  <input
                    value={row.symptom}
                    placeholder="如：白点 / 水霉 / 烂鳍"
                    onChange={(e) => patch(row.id, "symptom", e.target.value)}
                  />
                </label>
                <label>
                  <span>药名</span>
                  <select
                    value={row.medicineId}
                    onChange={(e) => patch(row.id, "medicineId", e.target.value)}
                  >
                    {MEDICINES.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>单次剂量（ml）</span>
                  <input
                    value={row.doseText}
                    inputMode="decimal"
                    placeholder={`缸体上限 ${fmt(cap)} ml`}
                    onChange={(e) => patch(row.id, "doseText", e.target.value)}
                  />
                  <small>
                    {tank
                      ? `${tank.volumeL} L × ${tank.medLimitMlPerL} ml/L = 上限 ${fmt(cap)} ml`
                      : ""}
                  </small>
                </label>
                <label>
                  <span>投药时刻</span>
                  <input
                    type="datetime-local"
                    value={row.startedAt}
                    onChange={(e) => patch(row.id, "startedAt", e.target.value)}
                  />
                </label>
                <label>
                  <span>疗程天数</span>
                  <input
                    value={row.durationText}
                    inputMode="numeric"
                    placeholder="整数，≥ 1"
                    onChange={(e) => patch(row.id, "durationText", e.target.value)}
                  />
                  {need !== null && <small>整疗程共需药量 {fmt(need)} ml</small>}
                </label>
              </div>
              {rowIssues.length > 0 && (
                <ul className="med-row-errors">
                  {rowIssues.map((issue, i) => (
                    <li key={i}>
                      <span className={`med-tag tag-${issue.kind}`}>{KIND_LABEL[issue.kind]}</span>
                      {issue.detail}
                      {issue.kind === "stock" && `（库存差额 ${fmt(issue.shortfallMl ?? 0)} ml）`}
                    </li>
                  ))}
                </ul>
              )}
            </article>
          );
        })}
      </div>
      <p className="med-hint">
        校验规则：同缸已有未结疗程、单次剂量超过缸体上限、整批汇总药量超过库存——任一不满足，整批拒绝且保留全部输入。
      </p>
    </section>
  );
}
