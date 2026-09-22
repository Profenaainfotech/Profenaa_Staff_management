// Admin monthly report: one row per employee, click a row for their calendar.
import React, { useState } from "react";
import { BarChart3, Download } from "lucide-react";
import { useAsync } from "../../lib/hooks";
import { downloadCsv, fmtMinutes, istDateKey, monthLabel, shiftMonth } from "../../lib/format";
import DayDetail from "./DayDetail";
import MonthCalendar from "./MonthCalendar";
import { Badge, Button, Card, Empty, ErrorNote, Modal, PageHeader, Select, Spinner, Table, TextInput, useApi } from "./ui";

function PersonCalendar({ person, month, onClose, onPickDay }) {
  const api = useApi();
  const [m, setM] = useState(month);
  const { data, loading, error } = useAsync(() => api.get(`/api/attendance/admin/user/${person.userId}`, { month: m }), [m, person.userId]);
  return (
    <Modal open onClose={onClose} size="lg" title={person.name} subtitle={`${person.role || ""}${person.branch ? ` · ${person.branch}` : ""}`}>
      <ErrorNote message={error} />
      {loading && !data ? <Spinner /> : data && (
        <>
          <div className="flex flex-wrap gap-2 mb-4">
            <Badge tone="green">Present {data.summary.present}</Badge>
            <Badge tone="amber">Half {data.summary.halfDays}</Badge>
            <Badge tone="red">Absent {data.summary.absent}</Badge>
            <Badge tone="violet">Leave {data.summary.leave}</Badge>
            <Badge tone="amber">Late {data.summary.lateDays}×</Badge>
            <Badge tone="slate">{fmtMinutes(data.summary.totalMinutes)}</Badge>
            <Badge tone="blue">{data.summary.attendancePercent}%</Badge>
          </div>
          <MonthCalendar month={m} onMonthChange={setM} days={data.days} onSelect={(d) => onPickDay({ userId: person.userId, name: person.name, date: d.date })} />
          <p className="text-[10px] text-slate-400 mt-3">Click a day for the sessions, audit trail and to correct times.</p>
        </>
      )}
    </Modal>
  );
}

export default function MonthlyReport() {
  const api = useApi();
  const [month, setMonth] = useState(istDateKey().slice(0, 7));
  const [branchId, setBranchId] = useState("");
  const [q, setQ] = useState("");
  const [person, setPerson] = useState(null);
  const [day, setDay] = useState(null);
  const branches = useAsync(() => api.get("/api/branches"), []);
  const report = useAsync(() => api.get("/api/attendance/admin/report", { month, branchId }), [month, branchId]);

  const rows = (report.data?.rows || []).filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase()));
  const canNext = shiftMonth(month, 1) <= istDateKey().slice(0, 7);

  const exportCsv = () =>
    downloadCsv(`attendance-report-${month}.csv`, [
      ["Employee", "Role", "Branch", "Working days", "Present", "Half days", "Absent", "Leave", "WFH", "Late days", "Worked (h)", "Overtime (h)", "Overtime days", "Sunday / day-off (h)", "Sunday / day-off days", "Attendance %"],
      ...rows.map((r) => [r.name, r.role, r.branch, r.workingDays, r.present, r.halfDays, r.absent, r.leave, r.wfh, r.lateDays, (r.totalMinutes / 60).toFixed(1), (r.overtimeMinutes / 60).toFixed(1), r.overtimeDays || 0, ((r.offDayMinutes || 0) / 60).toFixed(1), r.offDayDays || 0, r.attendancePercent]),
    ]);

  return (
    <div className="space-y-5">
      <PageHeader
        icon={<BarChart3 size={20} />}
        title="Monthly report"
        subtitle={monthLabel(month)}
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => setMonth(shiftMonth(month, -1))}>‹ Prev</Button>
            <Button variant="ghost" size="sm" onClick={() => canNext && setMonth(shiftMonth(month, 1))} disabled={!canNext}>Next ›</Button>
            <Button variant="ghost" onClick={exportCsv} disabled={!rows.length}><Download size={13} /> CSV</Button>
          </>
        }
      />
      <ErrorNote message={report.error} onRetry={report.reload} />
      <Card padded={false}>
        <div className="flex flex-col md:flex-row gap-3 p-4 border-b border-slate-100">
          <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search employee" />
          <Select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="md:!w-52">
            <option value="">All branches</option>
            {(branches.data?.branches || []).map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
          </Select>
        </div>
        {report.loading && !report.data ? <Spinner /> : rows.length === 0 ? <Empty title="No staff found" /> : (
          <Table head={["Employee", "Branch", "Days", "Present", "Half", "Absent", "Leave", "Late", "Worked", "Overtime", "Sunday work", "Attendance"]} className="!border-0 !rounded-none">
            {rows.map((r) => (
              <tr key={r.userId} className="cursor-pointer hover:bg-sky-50/60" onClick={() => setPerson(r)}>
                <td className="px-4 py-3"><p className="font-bold text-slate-800">{r.name}</p><p className="text-[10px] text-slate-400">{r.role}</p></td>
                <td className="px-4 py-3 text-slate-600">{r.branch || "--"}</td>
                <td className="px-4 py-3">{r.workingDays}</td>
                <td className="px-4 py-3 font-semibold text-emerald-700">{r.present}</td>
                <td className="px-4 py-3">{r.halfDays || "--"}</td>
                <td className={`px-4 py-3 font-semibold ${r.absent ? "text-red-600" : "text-slate-300"}`}>{r.absent || "--"}</td>
                <td className="px-4 py-3">{r.leave || "--"}</td>
                <td className={`px-4 py-3 ${r.lateDays ? "text-amber-600 font-semibold" : "text-slate-300"}`}>{r.lateDays || "--"}</td>
                <td className="px-4 py-3 whitespace-nowrap">{fmtMinutes(r.totalMinutes)}</td>
                <td className="px-4 py-3 whitespace-nowrap">{r.overtimeMinutes ? <Badge tone="orange">{fmtMinutes(r.overtimeMinutes)}</Badge> : <span className="text-slate-300">--</span>}</td>
                <td className="px-4 py-3 whitespace-nowrap">{r.offDayMinutes ? <Badge tone="violet">{fmtMinutes(r.offDayMinutes)} · {r.offDayDays}d</Badge> : <span className="text-slate-300">--</span>}</td>
                <td className="px-4 py-3 min-w-[7rem]">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className={`h-full rounded-full ${r.attendancePercent >= 90 ? "bg-emerald-500" : r.attendancePercent >= 75 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${Math.min(100, r.attendancePercent)}%` }} /></div>
                    <span className="text-[11px] font-bold text-slate-700 w-9 text-right">{r.attendancePercent}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      {person && <PersonCalendar person={person} month={month} onClose={() => setPerson(null)} onPickDay={setDay} />}
      <DayDetail target={day} onClose={() => setDay(null)} onChanged={() => report.reload({ silent: true })} />
    </div>
  );
}
