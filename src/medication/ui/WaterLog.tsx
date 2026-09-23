// 界面模块：换水记录。无未结疗程的鱼缸可直接记录；有未结疗程的缸显示暂停提醒。
import { useState } from "react";
import { TANKS, findTank } from "../catalog";
import { isOpenAt } from "../dose";
import { fmtDateTimeLocal, nowDateTimeLocal, todayStr } from "../dateUtils";
import type { Course, WaterRecord } from "../types";

interface Props {
  courses: Course[];
  waterRecords: WaterRecord[];
  onLog: (tankId: string, at: string, percent: number, note: string) => void;
}

export default function WaterLog({ courses, waterRecords, onLog }: Props) {
  const [tankId, setTankId] = useState(TANKS[0]?.id ?? "");
  const [at, setAt] = useState(nowDateTimeLocal());
  const [percentText, setPercentText] = useState("20");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const today = todayStr();
  const openCourse = courses.find((c) => c.tankId === tankId && isOpenAt(c, at.slice(0, 10)));
  const percent = Number(percentText);

  function submit() {
    if (openCourse) {
      setError(
        `「${findTank(tankId)?.name}」疗程中，换水已暂停。请到「疗程与停药日」中通过换水确认顺延停药日。`
      );
      return;
    }
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
      setError("换水量需为 1-100 的数字百分比");
      return;
    }
    onLog(tankId, at, percent, note);
    setError("");
    setNote("");
    setPercentText("20");
  }

  return (
    <section className="panel med-panel">
      <div className="section-heading">
        <div>
          <p>换水</p>
          <h2>换水记录与顺延联动</h2>
        </div>
      </div>

      <div className="med-inline-grid">
        <label>
          <span>鱼缸</span>
          <select value={tankId} onChange={(e) => setTankId(e.target.value)}>
            {TANKS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
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

      {openCourse && (
        <p className="med-pause">
          ⏸ {findTank(tankId)?.name} 疗程中：换水默认暂停；如确需换水，请在疗程卡片中确认，系统会按换水量顺延停药日。
        </p>
      )}
      {error && <p className="med-row-error-text">{error}</p>}

      <div className="med-row-actions">
        <button type="button" className="primary-action" onClick={submit}>
          记录换水
        </button>
      </div>

      <h4 className="med-log-title">近期换水流水</h4>
      {waterRecords.length === 0 ? (
        <p className="med-empty">暂无换水记录。</p>
      ) : (
        <ul className="med-water-log">
          {waterRecords.slice(0, 12).map((w) => (
            <li key={w.id} className={w.courseId ? "linked" : ""}>
              <strong>{findTank(w.tankId)?.name ?? w.tankId}</strong>
              <span>{fmtDateTimeLocal(w.at)}</span>
              <span>{w.percent}%</span>
              {w.courseId ? (
                <span className="med-postpone">疗程内换水 · 停药日 +{w.addedDays} 天</span>
              ) : (
                <span>常规换水</span>
              )}
              {w.note && <span className="med-log-note">{w.note}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
