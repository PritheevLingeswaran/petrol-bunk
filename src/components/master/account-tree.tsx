"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Landmark } from "lucide-react";
import type { MasterRecord } from "@/server/master/queries";

export function AccountTree({ groups, accounts }: { groups: MasterRecord[]; accounts: MasterRecord[] }) {
  const [open, setOpen] = useState<Set<string>>(new Set(groups.map((group) => group.id)));
  const render = (parentId: string | undefined, level: number) => groups.filter((group) => String(group.values.parentId || "") === (parentId ?? "")).map((group) => { const children = groups.some((item) => item.values.parentId === group.id); const ledgers = accounts.filter((account) => account.values.groupId === group.id); const expanded = open.has(group.id); return <div key={group.id}><button className="tree-row" style={{ paddingLeft: `${level * 20 + 10}px` }} onClick={() => setOpen((current) => { const next = new Set(current); expanded ? next.delete(group.id) : next.add(group.id); return next; })}>{children ? expanded ? <ChevronDown size={15}/> : <ChevronRight size={15}/> : <span className="w-[15px]"/>}<span>{group.values.name}</span><span className="ml-auto text-xs text-slate-500">{group.values.nature}</span></button>{expanded && <>{ledgers.map((ledger) => <div key={ledger.id} className="tree-row text-slate-300" style={{ paddingLeft: `${level * 20 + 42}px` }}><Landmark size={14}/>{ledger.values.name}<span className="ml-auto text-xs text-slate-500">{ledger.values.code}</span></div>)}{render(group.id, level + 1)}</>}</div>; });
  return <section className="panel p-4"><div className="mb-3"><p className="eyebrow">LEDGER HIERARCHY</p><h2>Chart of accounts</h2></div><div className="divide-y divide-slate-800">{render(undefined, 0)}</div></section>;
}
