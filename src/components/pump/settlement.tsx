"use client";

import { useMemo, useState } from "react";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { Decimal } from "decimal.js";
import { formatINR } from "@/lib/format";
import { computeSettlement, denominationTotal } from "@/lib/pump";
import { saveSettlement } from "@/server/pump/actions";
import type { PumpOptions, SettlementView } from "@/server/pump/queries";
import { Field, KeyboardForm, Messages, Money, PageHead, Stat } from "@/components/pump/ui";

type Collection = {
  kind: string;
  paymentModeId: string;
  amount: string;
  machineOrWallet: string;
  referenceNo: string;
  cardLast4: string;
  customerId: string;
  vehicleId: string;
  slipNo: string;
  productId: string;
  quantity: string;
  expenseHeadId: string;
  voucherRef: string;
  narration: string;
};

const KINDS = [
  { value: "CARD", label: "Card" },
  { value: "UPI", label: "UPI" },
  { value: "WALLET", label: "Wallet" },
  { value: "FLEET_CARD", label: "Fleet card" },
  { value: "COUPON", label: "Coupon" },
  { value: "CREDIT", label: "Credit sale" },
  { value: "OWN_USE", label: "Own use" },
  { value: "STAFF_VEHICLE", label: "Staff vehicle" },
  { value: "EXPENSE", label: "Expense from shift cash" },
];

const blankCollection = (kind: string): Collection => ({
  kind,
  paymentModeId: "",
  amount: "0",
  machineOrWallet: "",
  referenceNo: "",
  cardLast4: "",
  customerId: "",
  vehicleId: "",
  slipNo: "",
  productId: "",
  quantity: "",
  expenseHeadId: "",
  voucherRef: "",
  narration: "",
});

const bucketOf = (kind: string) =>
  kind === "CARD" ? "card" : kind === "UPI" ? "upi" : ["WALLET", "OTHER"].includes(kind) ? "wallet" : ["CREDIT", "FLEET_CARD", "COUPON"].includes(kind) ? "credit" : ["OWN_USE", "STAFF_VEHICLE"].includes(kind) ? "ownUse" : "expense";

export function SettlementScreen({
  view,
  options,
  today,
  shiftId,
  tolerance,
}: {
  view: SettlementView | null;
  options: PumpOptions;
  today: string;
  shiftId: string;
  tolerance: string;
}) {
  const [businessDate, setBusinessDate] = useState(today);
  const [shift, setShift] = useState(shiftId);
  const [active, setActive] = useState(view?.salesmen[0]?.employeeId ?? "");

  if (!view) {
    return (
      <section className="space-y-4">
        <PageHead eyebrow="PUMP OPERATIONS" title="Shift cash closing" description="Salesman-wise settlement, denomination count and short / excess." />
        <div className="panel space-y-3 p-3">
          <DateShift businessDate={businessDate} shift={shift} shifts={options.shifts} onDate={setBusinessDate} onShift={setShift} today={today} />
        </div>
        <p className="info-bar">No shift entry exists for this date and shift yet. Record the meter readings first.</p>
      </section>
    );
  }

  const salesman = view.salesmen.find((row) => row.employeeId === active) ?? view.salesmen[0];

  return (
    <section className="space-y-4">
      <PageHead eyebrow="PUMP OPERATIONS" title="Shift cash closing" description={`${view.shiftName} · ${view.businessDate} · salesman-wise settlement`} />

      <div className="panel space-y-3 p-3">
        <DateShift businessDate={businessDate} shift={shift} shifts={options.shifts} onDate={setBusinessDate} onShift={setShift} today={today} />
        {view.salesmen.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {view.salesmen.map((row) => (
              <button
                key={row.employeeId}
                className={`button ${row.employeeId === salesman?.employeeId ? "" : "button-secondary"}`}
                onClick={() => setActive(row.employeeId)}
                type="button"
              >
                {row.employeeName}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {salesman ? (
        <SalesmanSettlement key={salesman.employeeId} shiftEntryId={view.shiftEntryId} salesman={salesman} options={options} tolerance={tolerance} />
      ) : (
        <p className="info-bar">No nozzle was allocated to a salesman in this shift. Allocate nozzles on the shift entry screen first.</p>
      )}
    </section>
  );
}

function DateShift({
  businessDate,
  shift,
  shifts,
  onDate,
  onShift,
  today,
}: {
  businessDate: string;
  shift: string;
  shifts: PumpOptions["shifts"];
  onDate: (value: string) => void;
  onShift: (value: string) => void;
  today: string;
}) {
  return (
    <div className="toolbar">
      <Field label="Date">
        <input
          type="date"
          value={businessDate}
          max={today}
          onChange={(event) => {
            onDate(event.target.value);
            window.location.search = `?date=${event.target.value}&shift=${shift}`;
          }}
        />
      </Field>
      <Field label="Shift">
        <select
          value={shift}
          onChange={(event) => {
            onShift(event.target.value);
            window.location.search = `?date=${businessDate}&shift=${event.target.value}`;
          }}
        >
          {shifts.map((row) => (
            <option key={row.value} value={row.value}>
              {row.label}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}

function SalesmanSettlement({
  shiftEntryId,
  salesman,
  options,
  tolerance,
}: {
  shiftEntryId: string;
  salesman: SettlementView["salesmen"][number];
  options: PumpOptions;
  tolerance: string;
}) {
  const [denominations, setDenominations] = useState<Record<string, string>>(() =>
    Object.fromEntries(options.denominations.map((face) => [String(face), String(salesman.denominations[String(face)] ?? "")])),
  );
  const [coins, setCoins] = useState(salesman.coinsAmount || "0");
  const [declaredCash, setDeclaredCash] = useState(salesman.declaredCash || "0");
  const [counterSale, setCounterSale] = useState(salesman.counterSaleAmount || "0");
  const [collections, setCollections] = useState<Collection[]>(salesman.collections.length ? (salesman.collections as Collection[]) : []);
  const [acknowledged, setAcknowledged] = useState(false);
  const [note, setNote] = useState("");
  const [remarks, setRemarks] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  const counted = useMemo(() => {
    try {
      return denominationTotal(
        Object.fromEntries(Object.entries(denominations).map(([face, value]) => [face, value === "" ? 0 : value])),
        coins || "0",
      );
    } catch {
      return new Decimal(0);
    }
  }, [denominations, coins]);

  const difference = useMemo(() => counted.minus(new Decimal(declaredCash || "0")), [counted, declaredCash]);
  const mismatch = !difference.isZero();

  const totals = useMemo(() => {
    const buckets: Record<string, Decimal> = { card: new Decimal(0), upi: new Decimal(0), wallet: new Decimal(0), credit: new Decimal(0), ownUse: new Decimal(0), expense: new Decimal(0) };
    for (const collection of collections) buckets[bucketOf(collection.kind)] = buckets[bucketOf(collection.kind)].plus(new Decimal(collection.amount || "0"));
    return computeSettlement({
      nozzleSaleAmount: salesman.nozzleSaleAmount,
      counterSaleAmount: counterSale || "0",
      cash: declaredCash || "0",
      card: buckets.card,
      upi: buckets.upi,
      wallet: buckets.wallet,
      credit: buckets.credit,
      ownUse: buckets.ownUse,
      expenses: buckets.expense,
      toleranceAmount: tolerance,
    });
  }, [collections, counterSale, declaredCash, salesman.nozzleSaleAmount, tolerance]);

  const patch = (index: number, changes: Partial<Collection>) =>
    setCollections((current) => current.map((row, position) => (position === index ? { ...row, ...changes } : row)));

  const save = async () => {
    if (pending) return;
    // The grid must agree with the declared cash, or the difference is
    // acknowledged in writing. Refuse the save until one of those is true.
    if (mismatch && !acknowledged) {
      setError(
        `Counted ${formatINR(counted.toFixed(2))} against ${formatINR(new Decimal(declaredCash || "0").toFixed(2))} declared — a difference of ${formatINR(difference.toFixed(2))}. Recount, or acknowledge the difference below.`,
      );
      return;
    }
    setPending(true);
    setError("");
    setSaved("");
    const result = await saveSettlement({
      shiftEntryId,
      employeeId: salesman.employeeId,
      counterSaleAmount: counterSale || "0",
      declaredCash: declaredCash || "0",
      denominations: Object.fromEntries(Object.entries(denominations).map(([face, value]) => [face, value === "" ? 0 : value])),
      coinsAmount: coins || "0",
      differenceAcknowledged: acknowledged,
      differenceNote: note || undefined,
      remarks: remarks || undefined,
      collections: collections.map((row) => ({ ...row, quantity: row.quantity || undefined })),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSaved(`Settlement saved. Short / excess ${formatINR(result.shortExcess)} posted to the ledger.`);
    window.location.reload();
  };

  return (
    <KeyboardForm onSave={save} className="space-y-4">
      <Messages error={error} info={saved || undefined} />

      <div className="stat-grid">
        <Stat label="Nozzle sale" value={formatINR(salesman.nozzleSaleAmount)} sub={`${salesman.nozzleSaleLitres} L`} />
        <Stat label="Total sale value" value={formatINR(totals.totalSaleValue.toFixed(2))} />
        <Stat label="Total collections" value={formatINR(totals.totalCollections.toFixed(2))} />
        <Stat
          label={totals.isShort ? "Short" : totals.isExcess ? "Excess" : "Short / excess"}
          value={formatINR(totals.shortExcess.toFixed(2))}
          tone={totals.isShort ? "loss" : totals.isExcess ? "gain" : "neutral"}
          sub={totals.withinTolerance ? `Within the ₹${tolerance} tolerance` : "Posts to the salesman's ledger"}
        />
        <Stat label="Recoverable to date" value={formatINR(salesman.recoverableToDate)} tone={Number(salesman.recoverableToDate) > 0 ? "loss" : "neutral"} sub="Deducted in payroll" />
      </div>

      <div className="panel space-y-3 p-3">
        <h2>Cash denomination</h2>
        <div className="denom-grid">
          {options.denominations.map((face) => {
            const count = denominations[String(face)] ?? "";
            const line = new Decimal(count || "0").mul(face);
            return (
              <label className="denom" key={face}>
                <span>₹{face}</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={count}
                  onChange={(event) => setDenominations((current) => ({ ...current, [String(face)]: event.target.value }))}
                />
                <small>{formatINR(line.toFixed(2))}</small>
              </label>
            );
          })}
          <label className="denom">
            <span>Coins</span>
            <input type="number" min="0" step="0.01" inputMode="decimal" value={coins} onChange={(event) => setCoins(event.target.value)} />
            <small>loose</small>
          </label>
        </div>

        <div className="toolbar">
          <Field label="Counted total">
            <input type="text" className="num" value={formatINR(counted.toFixed(2))} readOnly tabIndex={-1} />
          </Field>
          <Field label="Cash declared ₹">
            <input type="number" step="0.01" inputMode="decimal" className="num" value={declaredCash} onChange={(event) => setDeclaredCash(event.target.value)} />
          </Field>
          <Field label="Counter / lube sales ₹">
            <input type="number" step="0.01" inputMode="decimal" className="num" value={counterSale} onChange={(event) => setCounterSale(event.target.value)} />
          </Field>
          <div className="field">
            <span>Difference</span>
            <input type="text" className={`num ${mismatch ? "loss" : ""}`} value={formatINR(difference.toFixed(2))} readOnly tabIndex={-1} style={mismatch ? { borderColor: "#6d2b30", color: "#ff9ba0" } : undefined} />
          </div>
        </div>

        {mismatch ? (
          <div className="space-y-2">
            <p className="alert-bar">
              The notes counted do not match the cash declared. This settlement will not save until the count is corrected or the difference is acknowledged.
            </p>
            <label className="check-row">
              <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
              I have recounted and accept the difference of {formatINR(difference.toFixed(2))}
            </label>
            {acknowledged ? (
              <Field label="Reason for the difference">
                <input type="text" value={note} onChange={(event) => setNote(event.target.value)} />
              </Field>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="panel space-y-3 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2>Collections</h2>
          <div className="flex flex-wrap gap-1">
            {KINDS.map((kind) => (
              <button key={kind.value} type="button" className="button button-secondary" onClick={() => setCollections((current) => [...current, blankCollection(kind.value)])}>
                <Plus size={13} /> {kind.label}
              </button>
            ))}
          </div>
        </div>

        {collections.length === 0 ? <p className="muted text-sm">Nothing collected other than cash. Add card, UPI, wallet, credit, own-use or expense lines as needed.</p> : null}

        {collections.map((collection, index) => (
          <div className="collection-row" key={index}>
            <Field label="Type">
              <select value={collection.kind} onChange={(event) => patch(index, { kind: event.target.value })}>
                {KINDS.map((kind) => (
                  <option key={kind.value} value={kind.value}>
                    {kind.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Amount ₹">
              <input type="number" step="0.01" inputMode="decimal" className="num" value={collection.amount} onChange={(event) => patch(index, { amount: event.target.value })} />
            </Field>

            {["CARD", "UPI", "WALLET", "FLEET_CARD"].includes(collection.kind) ? (
              <>
                <Field label="Machine / wallet">
                  <input type="text" value={collection.machineOrWallet} onChange={(event) => patch(index, { machineOrWallet: event.target.value })} />
                </Field>
                <Field label="Settlement ref">
                  <input type="text" value={collection.referenceNo} onChange={(event) => patch(index, { referenceNo: event.target.value })} />
                </Field>
                <Field label="Mode">
                  <select value={collection.paymentModeId} onChange={(event) => patch(index, { paymentModeId: event.target.value })}>
                    <option value="">—</option>
                    {options.paymentModes.map((mode) => (
                      <option key={mode.value} value={mode.value}>
                        {mode.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            ) : null}

            {["CREDIT", "COUPON", "OWN_USE", "STAFF_VEHICLE"].includes(collection.kind) ? (
              <>
                <Field label="Customer">
                  <select value={collection.customerId} onChange={(event) => patch(index, { customerId: event.target.value, vehicleId: "" })}>
                    <option value="">—</option>
                    {options.customers.map((customer) => (
                      <option key={customer.value} value={customer.value}>
                        {customer.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Vehicle">
                  <select value={collection.vehicleId} onChange={(event) => patch(index, { vehicleId: event.target.value })}>
                    <option value="">—</option>
                    {(options.customers.find((customer) => customer.value === collection.customerId)?.vehicles ?? []).map((vehicle) => (
                      <option key={vehicle.value} value={vehicle.value}>
                        {vehicle.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Slip no">
                  <input type="text" value={collection.slipNo} onChange={(event) => patch(index, { slipNo: event.target.value })} />
                </Field>
                <Field label="Litres">
                  <input type="number" step="0.01" inputMode="decimal" className="num" value={collection.quantity} onChange={(event) => patch(index, { quantity: event.target.value })} />
                </Field>
                <Field label="Product">
                  <select value={collection.productId} onChange={(event) => patch(index, { productId: event.target.value })}>
                    <option value="">—</option>
                    {options.products.map((product) => (
                      <option key={product.value} value={product.value}>
                        {product.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            ) : null}

            {collection.kind === "EXPENSE" ? (
              <>
                <Field label="Expense head">
                  <select value={collection.expenseHeadId} onChange={(event) => patch(index, { expenseHeadId: event.target.value })}>
                    <option value="">—</option>
                    {options.expenseHeads.map((head) => (
                      <option key={head.value} value={head.value}>
                        {head.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Voucher no">
                  <input type="text" value={collection.voucherRef} onChange={(event) => patch(index, { voucherRef: event.target.value })} />
                </Field>
                <Field label="Narration">
                  <input type="text" value={collection.narration} onChange={(event) => patch(index, { narration: event.target.value })} />
                </Field>
              </>
            ) : null}

            <div className="field">
              <span>&nbsp;</span>
              <button type="button" className="icon-button" aria-label="Remove line" onClick={() => setCollections((current) => current.filter((_, position) => position !== index))}>
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="panel p-3">
        <Field label="Settlement remarks">
          <textarea rows={2} value={remarks} onChange={(event) => setRemarks(event.target.value)} />
        </Field>
      </div>

      <div className="flex justify-end gap-2">
        <button className="button" type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} Save settlement
          <kbd className="ml-1 text-[0.62rem] opacity-70">Ctrl+S</kbd>
        </button>
      </div>
    </KeyboardForm>
  );
}
