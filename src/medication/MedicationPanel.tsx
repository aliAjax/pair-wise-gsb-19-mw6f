import { useEffect, useMemo, useState } from "react";
import type {
  BatchEntryInput,
  CourseVersion,
  MedCourse,
  MedState,
} from "./types";
import { checkBatchEntries, formatDate, formatDay, type BatchRejection } from "./dose";
import {
  applyWaterChange,
  completeCourse,
  createCourses,
  loadState,
  saveState,
  stopCourseEarly,
} from "./store";

// 界面：用药与停药期管理面板，只负责展示与交互

function emptyEntry(tankId = "", medicine = ""): BatchEntryInput {
  return {
    tankId,
    symptom: "",
    medicine,
    doseAmount: "",
    startedAt: "",
    courseDays: "",
  };
}

const VERSION_LABEL: Record<CourseVersion["change"], string> = {
  create: "建立疗程",
  "water-change": "换水顺延",
  "early-stop": "提前撤药",
  complete: "疗程完成",
};

function nowLocalInputValue(): string {
  const d = new Date();
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function MedicationPanel() {
  const [state, setState] = useState<MedState>(() => loadState());
  const [entries, setEntries] = useState<BatchEntryInput[]>(() => [
    emptyEntry(undefined, undefined),
  ]);
  const [rejection, setRejection] = useState<BatchRejection | null>(null);
  const [success, setSuccess] = useState<string>("");

  // 任何变更立即独立保存，重开页面后疗程、换水顺延与版本仍对应
  useEffect(() => {
    saveState(state);
  }, [state]);

  const tankName = (id: string) => state.tanks.find((t) => t.id === id)?.name ?? "未知鱼缸";
  const medUnit = (name: string) => state.medicines.find((m) => m.name === name)?.unit ?? "";

  const openCourses = useMemo(
    () => state.courses.filter((c) => c.status === "active"),
    [state.courses]
  );
  const closedCourses = useMemo(
    () => state.courses.filter((c) => c.status !== "active"),
    [state.courses]
  );

  function patchEntry(index: number, patch: Partial<BatchEntryInput>) {
    setEntries((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
    setRejection(null);
    setSuccess("");
  }

  function submitBatch() {
    const result = checkBatchEntries({
      entries,
      tanks: state.tanks,
      medicines: state.medicines,
      courses: state.courses,
    });
    if (result.rejected) {
      // 整批拒绝：不改动任何数据，输入原样保留
      setRejection(result);
      setSuccess("");
      return;
    }
    setState((s) => createCourses(s, entries));
    setEntries([emptyEntry()]);
    setRejection(null);
    setSuccess(`已登记 ${entries.length} 个疗程，库存已扣减。`);
  }

  return (
    <section className="panel med-panel">
      <div className="section-heading">
        <div>
          <p>用药与停药期</p>
          <h2>鱼缸用药登记</h2>
        </div>
        <div className="med-stock-summary">
          {state.medicines.map((m) => (
            <span key={m.name} className={m.stock <= 5 ? "stock-low" : ""}>
              {m.name}：{m.stock}
              {m.unit}
            </span>
          ))}
        </div>
      </div>

      <div className="med-batch-head">
        <span>鱼缸</span>
        <span>病症</span>
        <span>药名</span>
        <span>剂量</span>
        <span>投药时刻</span>
        <span>疗程天数</span>
        <span />
      </div>
      <div className="med-batch-rows">
        {entries.map((entry, index) => (
          <div className="med-batch-row" key={index}>
            <select value={entry.tankId} onChange={(e) => patchEntry(index, { tankId: e.target.value })}>
              <option value="">选择鱼缸</option>
              {state.tanks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}（{t.liters}L / 上限{t.maxDose}）
                </option>
              ))}
            </select>
            <input
              value={entry.symptom}
              placeholder="如：白点病"
              onChange={(e) => patchEntry(index, { symptom: e.target.value })}
            />
            <select value={entry.medicine} onChange={(e) => patchEntry(index, { medicine: e.target.value })}>
              <option value="">选择药品</option>
              {state.medicines.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.name}（库存 {m.stock}
                  {m.unit}）
                </option>
              ))}
            </select>
            <input
              value={entry.doseAmount}
              inputMode="decimal"
              placeholder="数值"
              onChange={(e) => patchEntry(index, { doseAmount: e.target.value })}
            />
            <input
              type="datetime-local"
              value={entry.startedAt}
              onChange={(e) => patchEntry(index, { startedAt: e.target.value })}
            />
            <input
              value={entry.courseDays}
              inputMode="numeric"
              placeholder="天"
              onChange={(e) => patchEntry(index, { courseDays: e.target.value })}
            />
            <button
              className="med-row-del"
              disabled={entries.length === 1}
              onClick={() => setEntries((rows) => rows.filter((_, i) => i !== index))}
            >
              删除
            </button>
          </div>
        ))}
      </div>

      <div className="med-batch-actions">
        <button onClick={() => setEntries((rows) => [...rows, emptyEntry()])}>+ 增加一行</button>
        <button className="primary-action" onClick={submitBatch}>
          整批登记
        </button>
        <button
          onClick={() => {
            setEntries([{ ...emptyEntry(), startedAt: nowLocalInputValue() }]);
            setRejection(null);
          }}
        >
          清空输入
        </button>
      </div>

      {success && <div className="med-feedback ok">{success}</div>}

      {rejection && (
        <div className="med-feedback reject">
          <strong>整批拒绝，未保存任何登记，输入已保留：</strong>
          <ul>
            {rejection.errors.map((err) => (
              <li key={err.row}>
                第 {err.row} 行
                {err.tankName ? `（${err.tankName}` : "（"}
                {err.medicine ? ` · ${err.medicine}）` : "）"}
                <ul>
                  {err.reasons.map((reason, i) => (
                    <li key={i}>{reason}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          {rejection.stockDeficits.length > 0 && (
            <div className="med-deficits">
              库存差额：
              {rejection.stockDeficits.map((d) => (
                <span key={d.medicine} className="deficit-tag">
                  {d.medicine} 缺 {d.deficit}
                  {d.unit}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="med-courses">
        <h3>进行中的疗程（{openCourses.length}）</h3>
        {openCourses.length === 0 && <p className="med-empty">暂无未结疗程。</p>}
        {openCourses.map((course) => (
          <CourseCard
            key={course.id}
            course={course}
            tankName={tankName(course.tankId)}
            unit={medUnit(course.medicine)}
            onWaterChange={(liters) => setState((s) => applyWaterChange(s, course.id, liters))}
            onEarlyStop={(reason) => setState((s) => stopCourseEarly(s, course.id, reason))}
            onComplete={() => setState((s) => completeCourse(s, course.id))}
          />
        ))}

        {closedCourses.length > 0 && (
          <>
            <h3>已结束疗程（{closedCourses.length}）</h3>
            {closedCourses.map((course) => (
              <CourseCard
                key={course.id}
                course={course}
                tankName={tankName(course.tankId)}
                unit={medUnit(course.medicine)}
                readonly
              />
            ))}
          </>
        )}
      </div>
    </section>
  );
}

function CourseCard({
  course,
  tankName,
  unit,
  readonly = false,
  onWaterChange,
  onEarlyStop,
  onComplete,
}: {
  course: MedCourse;
  tankName: string;
  unit: string;
  readonly?: boolean;
  onWaterChange?: (liters: number) => void;
  onEarlyStop?: (reason: string) => void;
  onComplete?: () => void;
}) {
  const [waterLiters, setWaterLiters] = useState("");
  const [waterError, setWaterError] = useState("");
  const [stopping, setStopping] = useState(false);
  const [stopReason, setStopReason] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  const overdue = course.status === "active" && new Date(course.plannedStopAt).getTime() < Date.now();
  const statusText =
    course.status === "stopped-early"
      ? "已提前撤药"
      : course.status === "completed"
        ? "已完成"
        : overdue
          ? "已到停药日（待确认）"
          : "疗程中";

  function submitWater() {
    const liters = Number(waterLiters);
    if (!Number.isFinite(liters) || liters <= 0) {
      setWaterError("请输入大于 0 的换水量（升）");
      return;
    }
    onWaterChange?.(liters);
    setWaterLiters("");
    setWaterError("");
  }

  function submitStop() {
    if (!stopReason.trim()) return;
    onEarlyStop?.(stopReason.trim());
    setStopping(false);
    setStopReason("");
  }

  return (
    <article className={`med-course status-${course.status}${overdue ? " overdue" : ""}`}>
      <header>
        <div>
          <strong>{tankName}</strong>
          <span className="med-badge">{statusText}</span>
        </div>
        <button onClick={() => setShowHistory((v) => !v)}>
          {showHistory ? "收起版本" : `版本（${course.versions.length}）`}
        </button>
      </header>

      <dl className="med-course-info">
        <div>
          <dt>病症</dt>
          <dd>{course.symptom}</dd>
        </div>
        <div>
          <dt>药名 / 剂量</dt>
          <dd>
            {course.medicine} {course.doseAmount}
            {unit}
          </dd>
        </div>
        <div>
          <dt>投药时刻</dt>
          <dd>{formatDate(course.startedAt)}</dd>
        </div>
        <div>
          <dt>疗程</dt>
          <dd>{course.courseDays} 天</dd>
        </div>
        <div>
          <dt>计划停药日</dt>
          <dd>{formatDay(course.plannedStopAt)}</dd>
        </div>
        <div>
          <dt>累计顺延</dt>
          <dd>
            {course.postponements.reduce((s, p) => s + p.postponedDays, 0)} 天（{course.postponements.length} 次换水）
          </dd>
        </div>
      </dl>

      {course.postponements.length > 0 && (
        <ul className="med-postpone-list">
          {course.postponements.map((p) => (
            <li key={p.id}>
              {formatDate(p.at)} 换水 {p.liters}L，疗程暂停，停药日 {formatDay(p.stopBefore)} →{" "}
              {formatDay(p.stopAfter)}（顺延 {p.postponedDays} 天，对应版本 v{p.version}）
            </li>
          ))}
        </ul>
      )}

      {course.status === "stopped-early" && (
        <p className="med-stop-reason">提前撤药原因：{course.stopReason}（{formatDate(course.actualStopAt!)}）</p>
      )}

      {!readonly && course.status === "active" && (
        <div className="med-course-actions">
          <div className="med-water">
            <label>
              <span>疗程中换水（升，换水期间暂停疗程并按比例顺延停药日）</span>
              <input
                value={waterLiters}
                inputMode="decimal"
                placeholder="换水量（升）"
                onChange={(e) => setWaterLiters(e.target.value)}
              />
            </label>
            <button onClick={submitWater}>登记换水顺延</button>
            {waterError && <em className="med-field-error">{waterError}</em>}
          </div>
          <div className="med-action-row">
            {!stopping ? (
              <>
                <button onClick={() => setStopping(true)}>提前撤药</button>
                <button className="primary-action" onClick={onComplete}>
                  确认疗程完成
                </button>
              </>
            ) : (
              <div className="med-stop-form">
                <input
                  value={stopReason}
                  placeholder="必须填写提前撤药原因"
                  onChange={(e) => setStopReason(e.target.value)}
                />
                <button className="primary-action" disabled={!stopReason.trim()} onClick={submitStop}>
                  确认撤药并存为新版本
                </button>
                <button
                  onClick={() => {
                    setStopping(false);
                    setStopReason("");
                  }}
                >
                  取消
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {showHistory && (
        <ol className="med-versions">
          {course.versions.map((v) => (
            <li key={v.version}>
              <div>
                <strong>v{v.version}</strong> · {VERSION_LABEL[v.change]} · {formatDate(v.createdAt)}
              </div>
              <div>
                疗程天数：{v.courseDays}；计划停药日：{formatDay(v.plannedStopAt)}
                {v.changeLiters !== undefined && `；换水 ${v.changeLiters}L，顺延 ${v.postponedDays} 天`}
                {v.reason ? `；撤药原因：${v.reason}` : ""}
              </div>
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}
