// Admin live board: who is in, who is on a warning, who is late / absent, right now.
import React, { useMemo, useState } from "react";
import { Download, RefreshCw, Search, UsersRound } from "lucide-react";
import { useAsync, useLiveRefresh, useTick } from "../../lib/hooks";
import { downloadCsv, fmtMinutes, fmtTime, istDateKey, timeAgo } from "../../lib/format";
import DayDetail from "./DayDetail";
import { Badge, Button, Card, Empty, ErrorNote, PageHeader, Select, Spinner, Stat, StatusBadge, Table, TextInput, useApi } from "./ui";

const FILTERS = {
  all: { label: "Everyone", test: () => true },
  inOffice: { label: "In office", test: (r) => ["PRESENT", "WARNING"].includes(r.display) },
  warning: { label: "Wi-Fi warnings", test: (r) => r.display === "WARNING" },
  left: { label: "Stepped out", test: (r) => r.display === "LEFT" },
  late: { label: "Late", test: (r) => r.lateMinutes > 10 },
  notIn: { label: "Not in / absent", test: (r) => ["NOT_YET_IN", "ABSENT", "INCOMPLETE"].includes(r.display) },
  away: { label: "Leave / WFH / off", test: (r) => ["ON_LEAVE", "HALF_LEAVE", "WFH", "HOLIDAY", "WEEKLY_OFF"].includes(r.display) },
  done: { label: "Completed", test: (r) => ["COMPLETED", "HALF_DAY"].includes(r.display) },
  loggedOut: { label: "Logged out", test: (r) => r.display === "LOGGED_OUT" },
  overtime: { label: "Overtime", test: (r) => r.overtimeMinutes > 0 || r.overtimeState === "CONFIRMED" },
  extra: { label: "Sunday / day-off work", test: (r) => r.offDayMinutes > 0 },
  review: { label: "Needs review (half day)", test: (r) => ["PENDING_EXPLANATION", "EXPLAINED"].includes(r.reviewState) },
  noDevice: { label: "Wi-Fi mode, no device", test: (r) => r.mode === "WIFI" && (!r.device || r.device.status !== "ACTIVE") },
};

function Countdown({ deadline, reason }) {
  useTick(1000);
  const s = Math.max(0, Math.round((new Date(deadline).getTime() - Date.now()) / 1000));
  return (
    <span className="block text-[10px] text-amber-600 font-semibold mt-0.5 tabular-nums">
      {reason === "WIFI_CHANGED" ? "other network" : reason === "WIFI_DISCONNECTED" ? "disconnected" : "no signal"} · {Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")} left
    </span>
  );
}

export default function LiveBoard({ onPendingChanged }) {
  const api = useApi();
  const [date, setDate] = useState(istDateKey());
  const [branchId, setBranchId] = useState("");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [detail, setDetail] = useState(null);

  const branches = useAsync(() => api.get("/api/branches"), []);
  const board = useAsync(() => api.get("/api/attendance/admin/board", { date, branchId, q }), [date, branchId, q]);
  useLiveRefresh("admin", board.reload, { pollMs: 20000 });

  const data = board.data;
  const rows = useMemo(() => (data?.rows || []).filter(FILTERS[filter].test), [data, filter]);
  const s = data?.summary;
  const isToday = date === istDateKey();

  const exportCsv = () =>
    downloadCsv(`attendance-${date}.csv`, [
      ["Employee", "Role", "Branch", "Mode", "Status", "Check-in", "Check-out", "Worked (min)", "Late (min)", "Overtime (min)", "Day-off work (min)", "Sessions"],
      ...rows.map((r) => [r.name, r.role, r.branch?.name || "", r.mode, r.display, r.checkIn ? fmtTime(r.checkIn) : "", r.checkOut ? fmtTime(r.checkOut) : "", r.workedMinutes, r.lateMinutes, r.overtimeMinutes || 0, r.offDayMinutes || 0, r.sessions]),
    ]);

  return (
    <div className="space-y-5">
      <PageHeader
        icon={<UsersRound size={20} />}
        title="Live attendance"
        subtitle={isToday ? "Updates instantly as staff connect and disconnect." : "Historical view"}
        actions={
          <>
            <TextInput type="date" value={date} max={istDateKey()} onChange={(e) => setDate(e.target.value || istDateKey())} className="!w-auto" />
            <Button variant="ghost" onClick={() => board.reload()}><RefreshCw size={13} className={board.loading ? "animate-spin" : ""} /> Refresh</Button>
            <Button variant="ghost" onClick={exportCsv} disabled={!rows.length}><Download size={13} /> CSV</Button>
          </>
        }
      />

      <ErrorNote message={board.error} onRetry={board.reload} />

      {s && (
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-5 gap-3">
          <Stat label="In office" value={s.inOffice} tone="green" onClick={() => setFilter("inOffice")} active={filter === "inOffice"} />
          <Stat label="Warnings" value={s.warning} tone={s.warning ? "amber" : "slate"} onClick={() => setFilter("warning")} active={filter === "warning"} />
          <Stat label="Stepped out" value={s.left} tone="blue" onClick={() => setFilter("left")} active={filter === "left"} />
          <Stat label="Late" value={s.late} tone={s.late ? "amber" : "slate"} onClick={() => setFilter("late")} active={filter === "late"} />
          <Stat label={isToday ? "Not in yet" : "Absent"} value={s.notYetIn + s.absent} tone={s.notYetIn + s.absent ? "red" : "slate"} onClick={() => setFilter("notIn")} active={filter === "notIn"} />
          <Stat label="Leave / WFH" value={s.onLeave + s.wfh} tone="violet" onClick={() => setFilter("away")} active={filter === "away"} />
          <Stat label="Completed" value={s.completed + s.halfDay} tone="green" onClick={() => setFilter("done")} active={filter === "done"} />
          <Stat label="Overtime / Sunday" value={(s.overtime || 0) + (s.offDayWork || 0)} tone={(s.overtime || 0) + (s.offDayWork || 0) ? "violet" : "slate"} hint="worked extra" onClick={() => setFilter((s.offDayWork || 0) && !(s.overtime || 0) ? "extra" : "overtime")} active={filter === "overtime" || filter === "extra"} />
          <Stat label="Needs review" value={s.needsReview || 0} tone={s.needsReview ? "red" : "slate"} hint="no shift-end reply" onClick={() => setFilter("review")} active={filter === "review"} />
          <Stat label="Logged out" value={s.loggedOut || 0} tone="slate" onClick={() => setFilter("loggedOut")} active={filter === "loggedOut"} />
          <Stat label="No device" value={s.wifiWithoutDevice} tone={s.wifiWithoutDevice ? "amber" : "slate"} hint="Wi-Fi mode" onClick={() => setFilter("noDevice")} active={filter === "noDevice"} />
        </div>
      )}

      <Card padded={false}>
        <div className="flex flex-col md:flex-row gap-3 p-4 border-b border-slate-100">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
            <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, role, department" className="!pl-9" />
          </div>
          <Select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="md:!w-48">
            <option value="">All branches</option>
            {(branches.data?.branches || []).map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
          </Select>
          <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="md:!w-52">
            {Object.entries(FILTERS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
        </div>

        {board.loading && !data ? <Spinner /> : rows.length === 0 ? (
          <Empty icon={<UsersRound size={20} />} title="Nobody matches" hint="Try another filter or date." />
        ) : (
          <Table head={["Employee", "Branch", "Status", "In", "Out / last", "Worked", "Late", "Agent", ""]} className="!border-0 !rounded-none">
            {rows.map((r) => (
              <tr key={r.userId} className="cursor-pointer hover:bg-sky-50/60" onClick={() => setDetail({ userId: r.userId, name: r.name, date })}>
                <td className="px-4 py-3">
                  <p className="font-bold text-slate-800">{r.name}</p>
                  <p className="text-[10px] text-slate-400">{[r.role, r.department].filter(Boolean).join(" · ")}</p>
                </td>
                <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{r.branch?.name || "--"}</td>
                <td className="px-4 py-3">
                  <StatusBadge code={r.display} overdue={r.overdue} label={r.label} />
                  {r.display === "WARNING" && r.graceDeadline && <Countdown deadline={r.graceDeadline} reason={r.warningReason} />}
                  {r.mode === "CRM_LOGIN" && <span className="block text-[10px] text-slate-300">CRM login</span>}
                  <span className="flex flex-wrap gap-1 mt-1">
                    {r.offDayMinutes > 0 && <Badge tone="violet">Sunday work {fmtMinutes(r.offDayMinutes)}</Badge>}
                    {r.overtimeMinutes > 0 && <Badge tone="orange">Overtime {fmtMinutes(r.overtimeMinutes)}</Badge>}
                    {r.overtimeState === "ASKING" && <Badge tone="amber">Asked: still working?</Badge>}
                    {r.reviewState === "PENDING_EXPLANATION" && <Badge tone="red">Needs explanation</Badge>}
                    {r.reviewState === "EXPLAINED" && <Badge tone="amber">Explained - decide</Badge>}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap tabular-nums">{fmtTime(r.checkIn)}</td>
                <td className="px-4 py-3 whitespace-nowrap tabular-nums text-slate-600">{r.checkOut ? fmtTime(r.checkOut) : r.display === "PRESENT" || r.display === "WARNING" ? "in office" : "--"}{r.sessions > 1 && <span className="text-[10px] text-slate-400"> ·{r.sessions}×</span>}</td>
                <td className="px-4 py-3 whitespace-nowrap font-semibold">{r.workedMinutes ? fmtMinutes(r.workedMinutes) : "--"}</td>
                <td className="px-4 py-3">{r.lateMinutes > 10 ? <Badge tone="amber">{r.lateMinutes}m</Badge> : <span className="text-slate-300">--</span>}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {r.mode !== "WIFI" ? <span className="text-slate-300">n/a</span> : !r.device ? <Badge tone="red">No device</Badge> : r.device.status === "PENDING" ? <Badge tone="amber">Pending</Badge> : (
                    <span className="inline-flex items-center gap-1.5 text-[10px] text-slate-500"><span className={`w-2 h-2 rounded-full ${r.agentOnline ? "bg-emerald-500" : "bg-slate-300"}`} />{r.device.lastSeenAt ? timeAgo(r.device.lastSeenAt) : "never"}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-[11px] font-semibold text-blue-700">Details</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <DayDetail target={detail} onClose={() => setDetail(null)} onChanged={() => { board.reload({ silent: true }); onPendingChanged?.(); }} />
    </div>
  );
}
