// 界面模块入口：用药与停药期管理页。
// 仅本文件连接 React 状态与保存模块；资料(catalog)、剂量计算(dose)、保存(store) 彼此独立。
import { useEffect, useState } from "react";
import {
  applyWaterChange,
  loadState,
  registerCourses,
  resetState,
  saveState,
  settleExpiredCourses,
  stopCourseEarly,
} from "./store";
import { checkBatch, type BlockIssue, type RowInput } from "./dose";
import { todayStr } from "./dateUtils";
import type { Course, MedicationState } from "./types";
import RegisterBatch from "./ui/RegisterBatch";
import CourseList from "./ui/CourseList";
import WaterLog from "./ui/WaterLog";
import ReferencePanel from "./ui/ReferencePanel";
import "./medication.css";

export default function MedicationPage() {
  const [state, setState] = useState<MedicationState>(() =>
    settleExpiredCourses(loadState(), todayStr())
  );
  const [notice, setNotice] = useState("");

  // 疗程 / 换水顺延 / 版本随状态整体持久化，重开页面仍一一对应
  useEffect(() => {
    saveState(state);
  }, [state]);

  // 跨日打开时自动给到期疗程结案（追加 scheduled-complete 版本）
  useEffect(() => {
    const id = window.setInterval(() => {
      setState((prev) => settleExpiredCourses(prev, todayStr()));
    }, 60000);
    return () => window.clearInterval(id);
  }, []);

  // 保存前用纯计算模块再校验一次（防止界面状态过期）：
  // 任一缸不通过则整批拒绝、不写入；输入由 RegisterBatch 自行保留。
  function commit(rows: RowInput[]): { ok: boolean; issues: BlockIssue[] } {
    const check = checkBatch(rows, { courses: state.courses, stockDelta: state.stockDelta });
    if (!check.ok) return check;
    setState((prev) => registerCourses(prev, rows));
    return { ok: true, issues: [] };
  }

  function handleCourseWater(course: Course, at: string, percent: number, note: string) {
    setState((prev) => applyWaterChange(prev, { course, tankId: course.tankId, at, percent, note }).state);
    setNotice("已登记疗程内换水，停药日已按换水量顺延");
  }

  function handleIdleWater(tankId: string, at: string, percent: number, note: string) {
    setState((prev) => applyWaterChange(prev, { tankId, at, percent, note }).state);
    setNotice("已记录常规换水");
  }

  function handleEarlyStop(course: Course, reason: string) {
    setState((prev) => stopCourseEarly(prev, course.id, reason));
    setNotice(`「${course.id}」已提前撤药，新版本已生成，旧版本保留可查`);
  }

  function handleReset() {
    if (window.confirm("清空本机保存的全部疗程、换水记录与库存扣减？资料目录不受影响。")) {
      setState(resetState());
      setNotice("已清空本机用药数据");
    }
  }

  return (
    <section className="medication-page">
      <div className="med-page-head panel">
        <div>
          <p className="eyebrow">Medication &amp; Withdrawal</p>
          <h2>鱼缸用药与停药期管理</h2>
          <p className="med-page-desc">
            登记鱼缸、病症、药名、剂量、投药时刻与疗程天数；同缸未结疗程、剂量超缸体上限或药量不足时整批拒绝并保留输入。
            疗程中换水默认暂停，确认后按换水量顺延停药日；提前撤药须填原因并生成新版本，旧值可查。数据保存在本机浏览器。
          </p>
        </div>
        <button type="button" className="med-reset" onClick={handleReset}>
          清空本机数据
        </button>
      </div>

      {notice && (
        <div className="med-toast" role="status" onClick={() => setNotice("")}>
          {notice}
        </div>
      )}

      <div className="med-layout">
        <div className="med-main-col">
          <RegisterBatch
            courses={state.courses}
            stockDelta={state.stockDelta}
            onCommit={commit}
            onNotice={setNotice}
          />
          <CourseList
            courses={state.courses}
            onWater={handleCourseWater}
            onEarlyStop={handleEarlyStop}
          />
          <WaterLog
            courses={state.courses}
            waterRecords={state.waterRecords}
            onLog={handleIdleWater}
          />
        </div>
        <div className="med-side-col">
          <ReferencePanel stockDelta={state.stockDelta} />
          <section className="panel med-panel med-rules">
            <h3>规则速览</h3>
            <ol>
              <li>整批登记：任一缸未通过校验，全部拒绝，输入原样保留。</li>
              <li>同缸同一时间只允许一个未结疗程。</li>
              <li>单次剂量不得超过「缸容量 × 单升上限」。</li>
              <li>整疗程药量 = 单次剂量 × 疗程天数，同药汇总后校验库存。</li>
              <li>疗程内换水：默认暂停，确认后按 顺延天数 = ⌈换水量% × 剩余疗程天数⌉ 顺延，至少 1 天。</li>
              <li>提前撤药必须填写原因，生成新版本，历史版本可查。</li>
            </ol>
            <p className="med-hint">资料、剂量计算、保存、界面四模块相互独立，未新增任何依赖。</p>
          </section>
        </div>
      </div>
    </section>
  );
}
