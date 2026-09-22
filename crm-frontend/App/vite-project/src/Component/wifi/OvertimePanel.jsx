// Overtime and Sunday / day-off work, kept apart from normal hours and highlighted.
//   <OvertimeReport />  inside the Attendance hub (needs the Themed wrapper it already has)
//   <OvertimePanel />   stand-alone (wraps itself) - used at the top of the admin Performance tab
import React, { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Download, Flame, RefreshCw, Sun } from "lucide-react";
import { useAsync } from "../../lib/hooks";
import { downloadCsv, fmtDay, fmtMinutes, fmtTime, istDateKey } from "../../lib/format";
import { Badge, Button, Card, Empty, ErrorNote, Select, Spinner, Table, TextInput, Themed, useApi } from "./ui";

const KIND = {
  SUNDAY: { label: "Sunday", tone: "violet" },
  WEEKLY_OFF: { label: "Weekly off", tone: "violet" },
  HOLIDAY: { label: "Holiday", tone: "indigo" },
  OVERTIME: { label: "Overtime", tone: "orange" },
};

const monthStart = () => `${istDateKey().slice(0, 7)}-01`;

export function OvertimeReport({ title = "Overtime & Sunday work", compact = false }) {
  const api = useApi();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(istDateKey());
  const [branchId, setBranchId] = useState("");
  const [open, setOpen] = useState(null);

  const branches = useAsync(() => api.get("/api/branches"), []);
  const report = useAsync(() => api.get("/api/attendance/admin/extra", { from, to, branchId }), [from, to, branchId]);
  const rows = useMemo(() => report.data?.rows || [], [report.data]);
  const s = report.data?.summary;

  const exportCsv = () =>
    downloadCsv(`overtime-sunday-${from}_${to}.csv`, [
      ["Employee", "Branch", "Overtime (min)", "Overtime days", "Sunday / day-off (min)", "Sunday / day-off days"],
      ...rows.map((r) => [r.name, r.branch, r.overtimeMinutes, r.overtimeDays, r.offDayMinutes, r.offDayDays]),
    ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-orange-500 to-violet-600 text-white flex items-center justify-center"><Flame size={21} /></div>
          <div>
            <h3 className="font-black text-lg text-slate-900">{title}</h3>
            <p className="text-[11px] text-slate-500">Work after shift end and on Sundays is counted here, apart from normal hours.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TextInput type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value || monthStart())} className="!w-auto" aria-label="From date" />
          <TextInput type="date" value={to} min={from} max={istDateKey()} onChange={(e) => setTo(e.target.value || istDateKey())} className="!w-auto" aria-label="To date" />
          {!compact && (
            <Select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="!w-40">
              <option value="">All branches</option>
              {(branches.data?.branches || []).map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
            </Select>
          )}
          <Button variant="ghost" onClick={() => report.reload()}><RefreshCw size={13} className={report.loading ? "animate-spin" : ""} /></Button>
          <Button variant="ghost" onClick={exportCsv} disabled={!rows.length}><Download size={13} /> CSV</Button>
        </div>
      </div>

      <ErrorNote message={report.error} onRetry={report.reload} />

      {s && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-2xl bg-gradient-to-br from-violet-600 to-purple-700 text-white p-4 shadow-md">
            <p className="text-[10px] uppercase tracking-widest font-bold text-white/70 flex items-center gap-1.5"><Sun size={12} /> Sunday / day-off work</p>
            <p className="text-3xl font-black tabular-nums mt-1">{fmtMinutes(s.offDayMinutes)}</p>
            <p className="text-[11px] text-white/80 mt-0.5">{s.offDayDays} day{s.offDayDays === 1 ? "" : "s"} worked on a day off</p>
          </div>
          <div className="rounded-2xl bg-gradient-to-br from-orange-500 to-red-500 text-white p-4 shadow-md">
            <p className="text-[10px] uppercase tracking-widest font-bold text-white/70 flex items-center gap-1.5"><Flame size={12} /> Overtime after shift end</p>
            <p className="text-3xl font-black tabular-nums mt-1">{fmtMinutes(s.overtimeMinutes)}</p>
            <p className="text-[11px] text-white/80 mt-0.5">{s.overtimeDays} day{s.overtimeDays === 1 ? "" : "s"} · confirmed by the employee</p>
          </div>
        </div>
      )}

      <Card padded={false}>
        {report.loading && !report.data ? <Spinner /> : rows.length === 0 ? (
          <Empty icon={<Flame size={20} />} title="No overtime or Sunday work in this period" hint="It appears here as soon as someone confirms they are still working after shift end, or works on a day off." />
        ) : (
          <Table head={["", "Employee", "Overtime", "Sunday / day-off", "Total extra"]} className="!border-0 !rounded-none">
            {rows.map((r) => (
              <Fragment key={String(r.userId)}>
                <tr className="cursor-pointer hover:bg-orange-50/40" onClick={() => setOpen(open === String(r.userId) ? null : String(r.userId))}>
                  <td className="pl-4 py-3 w-6 text-slate-400">{open === String(r.userId) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                  <td className="px-4 py-3">
                    <p className="font-bold text-slate-800">{r.name}</p>
                    <p className="text-[10px] text-slate-400">{[r.role, r.branch].filter(Boolean).join(" · ")}</p>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {r.overtimeDays ? <Badge tone="orange" className="!text-[11px]">{fmtMinutes(r.overtimeMinutes)} · {r.overtimeDays}d</Badge> : <span className="text-slate-300">--</span>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {r.offDayDays ? <Badge tone="violet" className="!text-[11px]">{fmtMinutes(r.offDayMinutes)} · {r.offDayDays}d</Badge> : <span className="text-slate-300">--</span>}
                  </td>
                  <td className="px-4 py-3 font-black text-slate-800 whitespace-nowrap">{fmtMinutes(r.overtimeMinutes + r.offDayMinutes)}</td>
                </tr>
                {open === String(r.userId) && (
                  <tr>
                    <td colSpan={5} className="bg-slate-50/70 px-6 py-3">
                      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {r.days.map((d) => (
                          <li key={d.date + d.kind} className="flex items-center gap-3 rounded-xl bg-white border border-slate-100 px-3 py-2 text-xs">
                            <span className="font-bold text-slate-700 w-28 shrink-0">{fmtDay(d.date, { weekday: "short", day: "2-digit", month: "short" })}</span>
                            <Badge tone={KIND[d.kind]?.tone || "slate"}>{KIND[d.kind]?.label || d.kind}</Badge>
                            <span className="font-black text-slate-800">{fmtMinutes(d.minutes)}</span>
                            <span className="ml-auto text-[10px] text-slate-400 tabular-nums">{fmtTime(d.checkIn)} – {d.checkOut ? fmtTime(d.checkOut) : "open"}</span>
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}

export default function OvertimePanel(props) {
  return (
    <Themed role="admin">
      <OvertimeReport {...props} />
    </Themed>
  );
}
