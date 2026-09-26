"use client";

import { useState } from "react";
import { Droplet, Loader2, Save, Thermometer } from "lucide-react";
import { formatNumber } from "@/lib/format";
import { saveDensityReading, saveDipReading } from "@/server/pump/actions";
import type { DipDensityView, PumpOptions } from "@/server/pump/queries";
import { Field, KeyboardForm, Litres, Messages, PageHead, Stat } from "@/components/pump/ui";

const DIP_TYPES = [
  { value: "OPENING", label: "Opening" },
  { value: "CLOSING", label: "Closing" },
  { value: "PRE_DECANT", label: "Before decantation" },
  { value: "POST_DECANT", label: "After decantation" },
  { value: "SPOT_CHECK", label: "Spot check" },
];

export function DipDensityScreen({ view, options, today }: { view: DipDensityView; options: PumpOptions; today: string }) {
  const [businessDate, setBusinessDate] = useState(view.businessDate);

  const alerts = view.tanks.flatMap((tank) => tank.readings.filter((reading) => reading.waterAlert).map((reading) => `Tank ${tank.tankCode}: water dip ${reading.waterDipMm} mm is above the ${view.waterAlertMm} mm alert threshold.`));
  const densityBreaches = view.tanks.flatMap((tank) =>
    tank.densities.filter((row) => !row.withinTolerance).map((row) => `Tank ${tank.tankCode}: density at 15 °C is ${row.deviation} kg/m³ off the last invoice density.`),
  );

  return (
    <section className="space-y-4">
      <PageHead eyebrow="PUMP OPERATIONS" title="Dip & density" description="Physical stock by dip rod, and the density check that catches wrong supply." />

      <div className="panel p-3">
        <div className="toolbar">
          <Field label="Date">
            <input
              type="date"
              value={businessDate}
              max={today}
              onChange={(event) => {
                setBusinessDate(event.target.value);
                window.location.search = `?date=${event.target.value}`;
              }}
            />
          </Field>
        </div>
      </div>

      <Messages warnings={[...alerts, ...densityBreaches]} />

      <div className="stat-grid">
        {view.tanks.map((tank) => {
          const closing = tank.readings.find((reading) => reading.readingType === "CLOSING");
          const latest = closing ?? tank.readings.at(-1);
          return (
            <Stat
              key={tank.tankId}
              label={`${tank.tankCode} · ${tank.productName}`}
              value={latest ? formatNumber(latest.netLitres) : "—"}
              sub={latest ? `${latest.readingType.toLowerCase()} · ${latest.fuelDipMm} mm · capacity ${formatNumber(tank.capacity, 0)} L` : "No dip taken"}
              tone={latest?.waterAlert ? "loss" : "neutral"}
            />
          );
        })}
      </div>

      {view.tanks.map((tank) => (
        <div className="panel space-y-3 p-3" key={tank.tankId}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2>
              {tank.tankCode} · {tank.tankName} <span className="muted text-sm">({tank.productName})</span>
            </h2>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <DipForm tankId={tank.tankId} businessDate={businessDate} employees={options.employees} />
            <DensityForm tankId={tank.tankId} businessDate={businessDate} employees={options.employees} />
          </div>

          <div className="overflow-auto">
            <table>
              <thead>
                <tr>
                  <th>Reading</th>
                  <th className="num">Fuel dip mm</th>
                  <th className="num">Water dip mm</th>
                  <th className="num">Fuel litres</th>
                  <th className="num">Water litres</th>
                  <th className="num">Net litres</th>
                  <th className="num">Temp °C</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {tank.readings.map((reading) => (
                  <tr key={reading.id}>
                    <td className="sticky-col font-medium">{reading.readingType.replaceAll("_", " ")}</td>
                    <td className="num">{formatNumber(reading.fuelDipMm, 1)}</td>
                    <td className={`num ${reading.waterAlert ? "loss" : ""}`}>{formatNumber(reading.waterDipMm, 1)}</td>
                    <td className="num">
                      <Litres value={reading.fuelLitres} />
                    </td>
                    <td className="num">
                      <Litres value={reading.waterLitres} />
                    </td>
                    <td className="num font-semibold">
                      <Litres value={reading.netLitres} />
                    </td>
                    <td className="num">{reading.temperatureC || "—"}</td>
                    <td>{reading.waterAlert ? <span className="badge alert">Water alert</span> : null}</td>
                  </tr>
                ))}
                {tank.readings.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-slate-500">
                      No dip recorded for this tank today.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {tank.densities.length > 0 ? (
            <div className="overflow-auto">
              <table>
                <thead>
                  <tr>
                    <th>Density</th>
                    <th className="num">Observed kg/m³</th>
                    <th className="num">Temp °C</th>
                    <th className="num">At 15 °C</th>
                    <th className="num">Invoice</th>
                    <th className="num">Deviation</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {tank.densities.map((row) => (
                    <tr key={row.id}>
                      <td className="sticky-col">Sample</td>
                      <td className="num">{formatNumber(row.observedDensity, 1)}</td>
                      <td className="num">{formatNumber(row.temperatureC, 1)}</td>
                      <td className="num font-semibold">{formatNumber(row.densityAt15C, 1)}</td>
                      <td className="num">{row.invoiceDensity ? formatNumber(row.invoiceDensity, 1) : "—"}</td>
                      <td className={`num ${row.withinTolerance ? "" : "loss"}`}>{row.deviation ? formatNumber(row.deviation, 1) : "—"}</td>
                      <td>{row.withinTolerance ? <span className="badge ok">In band</span> : <span className="badge alert">Out of band</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ))}
    </section>
  );
}

function DipForm({ tankId, businessDate, employees }: { tankId: string; businessDate: string; employees: { value: string; label: string }[] }) {
  const [readingType, setReadingType] = useState("CLOSING");
  const [fuelDipMm, setFuelDipMm] = useState("");
  const [waterDipMm, setWaterDipMm] = useState("0");
  const [temperatureC, setTemperatureC] = useState("");
  const [measuredBy, setMeasuredBy] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");

  const save = async () => {
    if (pending) return;
    setPending(true);
    setError("");
    const response = await saveDipReading({ tankId, businessDate, readingType, fuelDipMm, waterDipMm, temperatureC: temperatureC || undefined, measuredByEmployeeId: measuredBy || undefined });
    setPending(false);
    if (!response.ok) {
      setError(response.error);
      return;
    }
    setResult(`${formatNumber(response.netLitres)} L${response.waterAlert ? " · water above threshold" : ""}`);
    window.location.reload();
  };

  return (
    <KeyboardForm onSave={save} className="space-y-2 border border-slate-800 p-3">
      <p className="eyebrow">
        <Droplet size={12} className="mr-1 inline" /> RECORD DIP
      </p>
      <div className="collection-row">
        <Field label="Reading">
          <select value={readingType} onChange={(event) => setReadingType(event.target.value)}>
            {DIP_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Fuel dip mm">
          <input type="number" step="0.1" inputMode="decimal" className="num" value={fuelDipMm} onChange={(event) => setFuelDipMm(event.target.value)} required />
        </Field>
        <Field label="Water dip mm">
          <input type="number" step="0.1" inputMode="decimal" className="num" value={waterDipMm} onChange={(event) => setWaterDipMm(event.target.value)} />
        </Field>
        <Field label="Temp °C">
          <input type="number" step="0.1" inputMode="decimal" className="num" value={temperatureC} onChange={(event) => setTemperatureC(event.target.value)} />
        </Field>
        <Field label="Measured by">
          <select value={measuredBy} onChange={(event) => setMeasuredBy(event.target.value)}>
            <option value="">—</option>
            {employees.map((employee) => (
              <option key={employee.value} value={employee.value}>
                {employee.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Messages error={error} info={result || undefined} />
      <button className="button" type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />} Save dip
      </button>
    </KeyboardForm>
  );
}

function DensityForm({ tankId, businessDate, employees }: { tankId: string; businessDate: string; employees: { value: string; label: string }[] }) {
  const [observedDensity, setObservedDensity] = useState("");
  const [temperatureC, setTemperatureC] = useState("");
  const [measuredBy, setMeasuredBy] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (pending) return;
    setPending(true);
    setError("");
    const response = await saveDensityReading({ tankId, businessDate, observedDensity, temperatureC, measuredByEmployeeId: measuredBy || undefined });
    setPending(false);
    if (!response.ok) {
      setError(response.error);
      return;
    }
    window.location.reload();
  };

  return (
    <KeyboardForm onSave={save} className="space-y-2 border border-slate-800 p-3">
      <p className="eyebrow">
        <Thermometer size={12} className="mr-1 inline" /> RECORD DENSITY
      </p>
      <div className="collection-row">
        <Field label="Observed kg/m³">
          <input type="number" step="0.1" inputMode="decimal" className="num" value={observedDensity} onChange={(event) => setObservedDensity(event.target.value)} required />
        </Field>
        <Field label="Observed temp °C">
          <input type="number" step="0.1" inputMode="decimal" className="num" value={temperatureC} onChange={(event) => setTemperatureC(event.target.value)} required />
        </Field>
        <Field label="Measured by">
          <select value={measuredBy} onChange={(event) => setMeasuredBy(event.target.value)}>
            <option value="">—</option>
            {employees.map((employee) => (
              <option key={employee.value} value={employee.value}>
                {employee.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <p className="muted text-xs">Observed density and temperature are stored as read; the density at 15 °C is derived and kept separately.</p>
      <Messages error={error} />
      <button className="button" type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />} Save density
      </button>
    </KeyboardForm>
  );
}
