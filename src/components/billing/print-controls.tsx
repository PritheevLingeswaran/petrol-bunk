"use client";
import { markBillsPrinted } from "@/server/billing/actions";
export function PrintControls({ ids, layout }: { ids: string[]; layout: "THERMAL_80MM" | "A5" | "A4" }) { async function print() { const result = await markBillsPrinted({ billIds: ids, layout }); if (!result.ok) { alert(result.error); return; } window.print(); } return <div className="no-print print-controls"><button className="button" onClick={() => void print()}>Print now</button><a className="button button-secondary" href={`/api/billing/pdf?ids=${ids.join(",")}&layout=${layout}`}>Download PDF</a></div>; }
