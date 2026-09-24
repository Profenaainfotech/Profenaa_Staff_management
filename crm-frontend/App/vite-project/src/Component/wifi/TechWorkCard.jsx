// Technologies Task card inside the Daily Report (DHR).
//   <TechWorkCard>  staff: tick the allocated work / past work you completed today.
//                   Only staff with allocated work ever see it; the percentage has its own
//                   calculation:  ticked / allocated x 100  (nothing ticked = 0 %).
//   <TechWorkView>  read-only copy of a submitted report (staff history + admin views).
import React from "react";
import { Archive, CheckSquare, Cpu, ExternalLink, Square } from "lucide-react";
import { fmtDay } from "../../lib/format";
import { Badge, Card } from "./ui";

export const pctText = (p) => (p === null || p === undefined ? "--" : `${Number.isInteger(p) ? p : p.toFixed(1)}%`);
const calc = (ticked, total) => (total > 0 ? Math.round((ticked / total) * 1000) / 10 : null);
export const pctTone = (p) => (p === null || p === undefined ? "slate" : p >= 80 ? "green" : p >= 50 ? "amber" : "red");
const BAR = { green: "bg-emerald-500", amber: "bg-amber-500", red: "bg-red-500", slate: "bg-slate-300" };
const TXT = { green: "text-emerald-600", amber: "text-amber-600", red: "text-red-600", slate: "text-slate-400" };

export function PercentBar({ value, className = "" }) {
  const tone = pctTone(value);
  return (
    <div className={`h-2 rounded-full bg-slate-100 overflow-hidden ${className}`} role="progressbar" aria-valuenow={value ?? 0} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full transition-all ${BAR[tone]}`} style={{ width: `${Math.min(100, Math.max(0, value ?? 0))}%` }} />
    </div>
  );
}

const GROUPS = [
  { kind: "Task", title: "Allocated technologies tasks", icon: Cpu },
  { kind: "PastWork", title: "Past work", icon: Archive },
];

/** Live summary of the ticks on screen */
function live(items) {
  const of = (k) => items.filter((i) => i.kind === k);
  const t = (l) => l.filter((i) => i.done).length;
  return {
    all: calc(t(items), items.length),
    Task: calc(t(of("Task")), of("Task").length),
    PastWork: calc(t(of("PastWork")), of("PastWork").length),
    ticked: t(items),
  };
}

function Row({ item, checked, disabled, onToggle }) {
  const Box = checked ? CheckSquare : Square;
  const body = (
    <>
      <Box size={18} className={checked ? "text-emerald-600 shrink-0 mt-0.5" : "text-slate-300 shrink-0 mt-0.5"} />
      <span className="min-w-0 flex-1">
        <span className={`block text-xs font-bold ${checked ? "text-slate-500 line-through decoration-slate-300" : "text-slate-800"}`}>{item.title}</span>
        {(item.technology || item.description) && (
          <span className="block text-[11px] text-slate-500 mt-0.5">
            {item.technology && <b className="text-slate-600">{item.technology}</b>}
            {item.technology && item.description ? " · " : ""}
            {item.description}
          </span>
        )}
      </span>
    </>
  );
  return (
    <li className="flex items-start gap-1">
      {disabled ? (
        <div className="flex flex-1 items-start gap-3 rounded-xl border border-slate-100 bg-white px-3 py-2.5">{body}</div>
      ) : (
        <label className={`flex flex-1 items-start gap-3 rounded-xl border px-3 py-2.5 cursor-pointer transition ${checked ? "border-emerald-200 bg-emerald-50/50" : "border-slate-100 bg-white hover:bg-slate-50"}`}>
          <input type="checkbox" className="sr-only" checked={checked} onChange={onToggle} />
          {body}
        </label>
      )}
      {item.referenceUrl && (
        <a href={item.referenceUrl} target="_blank" rel="noreferrer" className="p-2 text-sky-600 hover:bg-sky-50 rounded-lg" title="Open reference" aria-label={`Open reference for ${item.title}`}>
          <ExternalLink size={14} />
        </a>
      )}
    </li>
  );
}

export function TechWorkCard({ tech, done, onToggle, confirmed, onConfirm }) {
  if (!tech?.items?.length) return null;
  const s = live(tech.items.map((i) => ({ ...i, done: done.has(String(i.taskId)) })));
  const tone = pctTone(s.all);
  const recent = tech.recent?.days || [];

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <p className="text-sm font-bold text-slate-800 flex items-center gap-2"><Cpu size={15} className="text-sky-500" /> Technologies Task</p>
          <p className="text-[11px] text-slate-500 mt-1 max-w-md">Tick only the allocated work you completed today. Anything you leave unticked counts as not done, and nothing ticked is 0%. This card is required before you can submit.</p>
        </div>
        <div className="text-right">
          <p className={`text-3xl font-black leading-none ${TXT[tone]}`}>{pctText(s.all)}</p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">{s.ticked} of {tech.items.length} done today</p>
        </div>
      </div>
      <PercentBar value={s.all} className="mb-5" />

      <div className="space-y-5">
        {GROUPS.map(({ kind, title, icon: Icon }) => {
          const list = tech.items.filter((i) => i.kind === kind);
          if (!list.length) return null;
          const p = s[kind];
          return (
            <div key={kind}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5"><Icon size={13} /> {title}</p>
                <Badge tone={pctTone(p)}>{list.filter((i) => done.has(String(i.taskId))).length}/{list.length} · {pctText(p)}</Badge>
              </div>
              <ul className="space-y-2">
                {list.map((i) => (
                  <Row key={String(i.taskId)} item={i} disabled={tech.locked} checked={done.has(String(i.taskId))} onToggle={() => onToggle(String(i.taskId))} />
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {!tech.locked && (
        <label className="mt-5 flex items-start gap-2.5 rounded-xl border border-sky-200 bg-sky-50/60 px-3 py-2.5 text-xs font-semibold text-slate-700 cursor-pointer">
          <input type="checkbox" className="mt-0.5" checked={confirmed} onChange={(e) => onConfirm(e.target.checked)} />
          <span>I have checked this list. The ticked work is what I completed today; the rest is not done. *</span>
        </label>
      )}

      {recent.length > 0 && (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">Your last days{tech.recent.average !== null ? ` · average ${pctText(tech.recent.average)}` : ""}</p>
          <div className="flex flex-wrap gap-2">
            {recent.map((d) => (
              <span key={d.date} className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600">
                {fmtDay(d.date, { day: "2-digit", month: "short" })} · <b className={TXT[pctTone(d.percent)]}>{pctText(d.percent)}</b>
              </span>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

/** Read-only: a submitted report's copy of the Technologies Task card. */
export function TechWorkView({ techWork }) {
  if (!techWork || !(techWork.allocated > 0)) return null;
  const tone = pctTone(techWork.percent);
  return (
    <div className="rounded-2xl border border-slate-100 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1.5"><Cpu size={12} /> Technologies Task</p>
        <span className={`text-xl font-black ${TXT[tone]}`}>{pctText(techWork.percent)} <span className="text-[11px] font-bold text-slate-400">({techWork.ticked}/{techWork.allocated} ticked)</span></span>
      </div>
      <PercentBar value={techWork.percent} className="mb-3" />
      {GROUPS.map(({ kind, title }) => {
        const list = (techWork.items || []).filter((i) => i.kind === kind);
        if (!list.length) return null;
        return (
          <div key={kind} className="mt-2">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">{title} · {pctText(kind === "Task" ? techWork.taskPercent : techWork.pastPercent)}</p>
            <ul className="space-y-1">
              {list.map((i, k) => (
                <li key={k} className="flex items-start gap-2 text-xs">
                  {i.done ? <CheckSquare size={15} className="text-emerald-600 shrink-0" /> : <Square size={15} className="text-slate-300 shrink-0" />}
                  <span className={i.done ? "text-slate-800 font-semibold" : "text-slate-400"}>{i.title}{i.technology ? <span className="text-slate-400"> · {i.technology}</span> : null}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}