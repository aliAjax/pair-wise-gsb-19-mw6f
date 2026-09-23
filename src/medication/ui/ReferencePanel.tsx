// 界面模块：鱼缸 / 药品资料与库存一览（资料来源于 catalog，库存来自保存模块）
import { MEDICINES, TANKS, currentStock } from "../catalog";
import { capMlOf, fmt } from "../dose";

export default function ReferencePanel({ stockDelta }: { stockDelta: Record<string, number> }) {
  return (
    <section className="panel med-panel med-reference">
      <div className="section-heading">
        <div>
          <p>资料</p>
          <h2>鱼缸与药品库存</h2>
        </div>
      </div>

      <h4>鱼缸（缸体上限 = 容量 × 单升上限）</h4>
      <ul className="med-ref-list">
        {TANKS.map((t) => (
          <li key={t.id}>
            <strong>{t.name}</strong>
            <span>
              {t.kind} · {t.volumeL} L
            </span>
            <span className="med-cap">单次上限 {fmt(capMlOf(t.id))} ml</span>
          </li>
        ))}
      </ul>

      <h4>药品库存</h4>
      <ul className="med-ref-list">
        {MEDICINES.map((m) => {
          const stock = currentStock(m.id, stockDelta);
          const low = stock <= m.stockMl * 0.2;
          return (
            <li key={m.id}>
              <strong>{m.name}</strong>
              <span>{m.spec}</span>
              <span className={`med-stock${low ? " low" : ""}`}>库存 {fmt(stock)} ml</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
