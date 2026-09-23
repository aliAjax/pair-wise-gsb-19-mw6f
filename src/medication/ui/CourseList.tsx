// 界面模块：疗程列表（换水顺延、提前撤药、版本可查）
import { useMemo, useState } from "react";
import { findMedicine, findTank } from "../catalog";
import { fmt, remainingDays, waterPostponeDays } from "../dose";
import {
  datePart,
  diffDays,
  effectiveStopDate,
  fmtDateTimeLocal,
  nowDateTimeLocal,
  todayStr,
} from "../dateUtils";
import type { Course } from "../types";

interface Props {
  courses: Course[];
  onWater: (course: Course, at: string, percent: number, note: string) => void;
  onEarlyStop: (course: Course, reason: string) => void;
}

type Panel =
  | { kind: "none" }
  | { kind: "water"; courseId: string }
  | { kind: "stop"; courseId: string }
  | { kind: "history"; courseId: string };

const STATUS_TEXT: Record<Course["status"], string> = {
  active: "疗程中",
  "completed-early": "已提前撤药",
  "completed-scheduled": "已到期结案",
};

export default function CourseList({ courses, onWater, onEarlyStop }: Props) {
  const [panel, setPanel] = useState<Panel>({ kind: "none" });
  const today = todayStr();

  const sorted = useMemo(
    () =>
      [...courses].sort((a, b) => {
        if ((a.status === "active") !== (b.status === "active")) return a.status === "active" ? -1 : 1;
        return b.startedAt.localeCompare(a.startedAt);
      }),
    [courses]
  );

  return (
    <section className="panel med-panel">
      <div className="section-heading">
        <div>
          <p>停药期管理</p>
          <h2>疗程与停药日</h2>
        </div>
        <span className="med-count">共 {courses.length} 个疗程 · {courses.filter((c) => c.status === "active").length} 个进行中</span>
      </div>

      {sorted.length === 0 && <p className="med-empty">暂无疗程，先在上方登记。</p>}

      <div className="med-course-list">
        {sorted.map((course) => {
          const tank = findTank(course.tankId);
          const med = findMedicine(course.medicineId);
          const stop = effectiveStopDate(course.plannedStopDate, course.postponementDays);
          const active = course.status === "active";
          return (
            <article key={course.id} className={`med-course${active ? " active" : " closed"}`}>
              <header>
                <div>
                  <h3>{tank?.name ?? course.tankId} 的疗程</h3>
                  <p className="med-course-sub">
                    {med?.name ?? course.medicineId} · 单次 {fmt(course.doseMl)} ml · 疗程{" "}
                    {course.durationDays} 天 · v{course.versions.length}
                  </p>
                </div>
                <span className={`med-badge ${active ? "badge-active" : "badge-closed"}`}>
                  {STATUS_TEXT[course.status]}
                </span>
              </header>

              <dl className="med-course-facts">
                <div>
                  <dt>病症</dt>
                  <dd>{course.symptom}</dd>
                </div>
                <div>
                  <dt>投药时刻</dt>
                  <dd>{fmtDateTimeLocal(course.startedAt)}</dd>
                </div>
                <div>
                  <dt>计划停药日</dt>
                  <dd>{course.plannedStopDate}</dd>
                </div>
                <div>
                  <dt>换水顺延</dt>
                  <dd className={course.postponementDays > 0 ? "med-postpone" : ""}>
                    +{course.postponementDays} 天
                  </dd>
                </div>
                <div>
                  <dt>实际停药日</dt>
                  <dd>
                    {stop}
                    {active && ` · 剩 ${remainingDays(course, today)} 天`}
                  </dd>
                </div>
                {course.endedAt && (
                  <div>
                    <dt>结案时刻</dt>
                    <dd>{fmtDateTimeLocal(course.endedAt)}</dd>
                  </div>
                )}
              </dl>

              {course.waterChanges.length > 0 && (
                <ul className="med-water-summary">
                  {course.waterChanges.map((w) => (
                    <li key={w.id}>
                      换水 {w.percent}%（{fmtDateTimeLocal(w.at)}）→ 停药日顺延 +{w.addedDays} 天
                      {w.note ? ` · ${w.note}` : ""}
                    </li>
                  ))}
                </ul>
              )}

              <div className="med-course-actions">
                <button
                  type="button"
                  disabled={!active}
                  onClick={() => setPanel({ kind: "water", courseId: course.id })}
                >
                  换水登记
                </button>
                <button
                  type="button"
                  disabled={!active}
                  onClick={() => setPanel({ kind: "stop", courseId: course.id })}
                >
                  提前撤药
                </button>
                <button
                  type="button"
                  className="med-link-btn"
                  onClick={() => setPanel({ kind: "history", courseId: course.id })}
                >
                  历史版本（{course.versions.length}）
                </button>
              </div>

              {panel.kind === "water" && panel.courseId === course.id && (
                <WaterPanel
                  course={course}
                  onCancel={() => setPanel({ kind: "none" })}
                  onSubmit={(at, percent, note) => {
                    onWater(course, at, percent, note);
                    setPanel({ kind: "none" });
                  }}
                />
              )}
              {panel.kind === "stop" && panel.courseId === course.id && (
                <StopPanel
                  course={course}
                  onCancel={() => setPanel({ kind: "none" })}
                  onSubmit={(reason) => {
                    onEarlyStop(course, reason);
                    setPanel({ kind: "none" });
                  }}
                />
              )}
              {panel.kind === "history" && panel.courseId === course.id && (
                <HistoryPanel course={course} onClose={() => setPanel({ kind: "none" })} />
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function WaterPanel({
  course,
  onCancel,
  onSubmit,
}: {
  course: Course;
  onCancel: () => void;
  onSubmit: (at: string, percent: number, note: string) => void;
}) {
  const [at, setAt] = useState(nowDateTimeLocal());
  const [percentText, setPercentText] = useState("30");
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const percent = Number(percentText);
  const atDay = at.slice(0, 10);
  const stopNow = effectiveStopDate(course.plannedStopDate, course.postponementDays);
  const inRange =
    !!at && diffDays(datePart(course.startedAt), atDay) >= 0 && diffDays(stopNow, atDay) >= 0;
  const valid =
    Number.isFinite(percent) && percent > 0 && percent <= 100 && confirmed && inRange;
  const added =
    Number.isFinite(percent) && percent > 0 && percent <= 100
      ? waterPostponeDays(course, percent, atDay)
      : 0;

  return (
    <div className="med-action-panel">
      <h4>疗程中换水（默认暂停，需确认）</h4>
      <p className="med-warn-text">
        疗程中换水会稀释药效，系统默认暂停换水。已知晓影响并确认后，按换水量顺延停药日。
      </p>
      <label className="med-confirm-line">
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
        <span>我已知晓换水对疗程的影响，要求登记本次换水</span>
      </label>
      <div className="med-inline-grid">
        <label>
          <span>换水时刻</span>
          <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
        </label>
        <label>
          <span>换水量（%）</span>
          <input value={percentText} inputMode="numeric" onChange={(e) => setPercentText(e.target.value)} />
        </label>
        <label className="med-span2">
          <span>备注</span>
          <input value={note} placeholder="可选" onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
      {confirmed && valid && (
        <p className="med-preview">
          预览：换水 {percent}% → 停药日顺延 <strong>+{added} 天</strong>
          （{stopNow} →{" "}
          {effectiveStopDate(course.plannedStopDate, course.postponementDays + added)}）
        </p>
      )}
      {at && !inRange && (
        <p className="med-row-error-text">
          换水时刻必须在疗程区间内：{datePart(course.startedAt)} ~ {stopNow}
        </p>
      )}
      <div className="med-row-actions">
        <button type="button" onClick={onCancel}>
          取消（维持暂停）
        </button>
        <button
          type="button"
          className="primary-action"
          disabled={!valid}
          onClick={() => onSubmit(at, percent, note)}
        >
          确认换水并顺延停药日
        </button>
      </div>
    </div>
  );
}

function StopPanel({
  course,
  onCancel,
  onSubmit,
}: {
  course: Course;
  onCancel: () => void;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <div className="med-action-panel">
      <h4>提前撤药（新建版本，旧值保留可查）</h4>
      <label>
        <span>撤药原因（必填）</span>
        <textarea
          rows={3}
          value={reason}
          placeholder="如：鱼只状态恢复 / 药物反应异常，经观察后决定提前停药"
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <div className="med-row-actions">
        <button type="button" onClick={onCancel}>
          取消
        </button>
        <button
          type="button"
          className="primary-action"
          disabled={reason.trim().length === 0}
          onClick={() => onSubmit(reason)}
        >
          确认撤药并生成 v{course.versions.length + 1}
        </button>
      </div>
    </div>
  );
}

function HistoryPanel({ course, onClose }: { course: Course; onClose: () => void }) {
  const tank = findTank(course.tankId);
  return (
    <div className="med-history" role="dialog" aria-label="疗程历史版本">
      <header>
        <h4>{tank?.name ?? course.tankId} · 历史版本（旧值可查）</h4>
        <button type="button" onClick={onClose}>
          关闭
        </button>
      </header>
      <ol className="med-version-list">
        {[...course.versions].reverse().map((v) => (
          <li key={v.version} className={`med-version ver-${v.action}`}>
            <div className="med-version-head">
              <strong>v{v.version}</strong>
              <span className="med-tag tag-version">{versionActionText(v.action)}</span>
              <time>{fmtDateTimeLocal(v.changedAt)}</time>
            </div>
            <p className="med-version-reason">原因：{v.reason}</p>
            <dl className="med-version-snapshot">
              <div>
                <dt>状态</dt>
                <dd>{STATUS_TEXT[v.snapshot.status]}</dd>
              </div>
              <div>
                <dt>病症</dt>
                <dd>{v.snapshot.symptom}</dd>
              </div>
              <div>
                <dt>药品</dt>
                <dd>{findMedicine(v.snapshot.medicineId)?.name ?? v.snapshot.medicineId}</dd>
              </div>
              <div>
                <dt>单次剂量</dt>
                <dd>{fmt(v.snapshot.doseMl)} ml</dd>
              </div>
              <div>
                <dt>投药时刻</dt>
                <dd>{fmtDateTimeLocal(v.snapshot.startedAt)}</dd>
              </div>
              <div>
                <dt>疗程天数</dt>
                <dd>{v.snapshot.durationDays}</dd>
              </div>
              <div>
                <dt>计划停药日</dt>
                <dd>{v.snapshot.plannedStopDate}</dd>
              </div>
              <div>
                <dt>累计顺延</dt>
                <dd>+{v.snapshot.postponementDays} 天</dd>
              </div>
              <div>
                <dt>实际停药日</dt>
                <dd>
                  {effectiveStopDate(v.snapshot.plannedStopDate, v.snapshot.postponementDays)}
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ol>
    </div>
  );
}

function versionActionText(action: Course["versions"][number]["action"]): string {
  if (action === "created") return "登记用药";
  if (action === "early-stop") return "提前撤药";
  return "到期结案";
}
