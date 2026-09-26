"use client";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
export function ProfitChart({
  rows,
}: {
  rows: { date: string; product: string; marginPerLitre: number }[];
}) {
  const products = [...new Set(rows.map((r) => r.product))];
  const dates = [...new Set(rows.map((r) => r.date))];
  const data = dates.map((date) => ({
    date,
    ...Object.fromEntries(
      products.map((product) => [
        product,
        rows.find((r) => r.date === date && r.product === product)
          ?.marginPerLitre ?? null,
      ]),
    ),
  }));
  return (
    <div className="panel chart-panel">
      <ResponsiveContainer width="100%" height={310}>
        <LineChart data={data}>
          <CartesianGrid stroke="#26364d" vertical={false} />
          <XAxis dataKey="date" stroke="#8fa1ba" />
          <YAxis stroke="#8fa1ba" />
          <Tooltip
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--line)",
            }}
          />
          <Legend />
          {products.map((p, i) => (
            <Line
              key={p}
              dataKey={p}
              type="monotone"
              stroke={i % 2 ? "#7fb9b1" : "#18b6a4"}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
