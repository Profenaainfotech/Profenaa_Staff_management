// Admin "Daily Reports": every employee's Daily Report (DHR).
// Filter by date range, name, branch and status; see who has NOT submitted; open a full report,
// reopen it for correction, print it, or export every entry to CSV.
import React, { useMemo, useState } from "react";
import { ClipboardList, Cpu, Download, Eye, Printer, RefreshCw, RotateCcw, Search, UserX } from "lucide-react";
import { useAsync, useLiveRefresh } from "../../lib/hooks";
import { downloadCsv, fmtDay, fmtMinutes, fmtTime, istDateKey } from "../../lib/format";
import { Badge, Button, Card, Empty, ErrorNote, Field, Modal, PageHeader, Select, Spinner, Stat, Table, Tabs, TextArea, TextInput, Themed, useApi, useToast } from "./ui";
import { TechWorkView, pctText, pctTone } from "./TechWorkCard";
import TechTasksAdmin from "./TechTasksAdmin";

const STATUS_TONE = { Completed: "green", "In Progress": "blue", Blocked: "red" };
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function printReport(r, att) {
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) return;
  const rows = (r.entries || [])
    .map((e) => `<tr><td>${esc(e.from)} – ${esc(e.to)}</td><td>${esc(e.project)}</td><td>${esc(e.category)}</td><td>${esc(e.task)}</td><td>${esc(e.status)}</td><td style="text-align:right">${esc(fmtMinutes(e.minutes))}</td></tr>`)
    .join("");
  const block = (t, v) => (v ? `<h3>${t}</h3><p>${esc(v).replace(/\n/g, "<br>")}</p>` : "");
  const tw = r.techWork;
  const techBlock =
    tw && tw.allocated > 0
      ? `<h3>Technologies Task - ${esc(pctText(tw.percent))} (${tw.ticked}/${tw.allocated} ticked)</h3><table><thead><tr><th>Type</th><th>Work</th><th>Technology</th><th>Done</th></tr></thead><tbody>${(tw.items || [])
          .map((i) => `<tr><td>${i.kind === "PastWork" ? "Past work" : "Task"}</td><td>${esc(i.title)}</td><td>${esc(i.technology)}</td><td>${i.done ? "Yes" : "No"}</td></tr>`)
          .join("")}</tbody></table>`
      : "";
  w.document.write(`<!doctype html><html><head><title>Daily Report - ${esc(r.userName)} - ${esc(r.date)}</title>
<style>body{font-family:Segoe UI,Arial,sans-serif;color:#0f172a;margin:32px;font-size:13px}h1{font-size:20px;margin:0}h2{font-size:12px;color:#64748b;margin:2px 0 18px;font-weight:600}
.meta{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px}.meta div{border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px}.meta b{display:block;font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em}
table{width:100%;border-collapse:collapse;margin-bottom:16px}th{background:#f1f5f9;text-align:left;font-size:11px;padding:7px;border:1px solid #e2e8f0}td{padding:7px;border:1px solid #e2e8f0;vertical-align:top}h3{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#475569;margin:14px 0 4px}
@media print{body{margin:14mm}}</style></head><body>
<h1>Daily Report</h1><h2>${esc(r.userName)}${r.role ? ` · ${esc(r.role)}` : ""}${r.branchId?.name ? ` · ${esc(r.branchId.name)}` : ""} · ${esc(fmtDay(r.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" }))}</h2>
<div class="meta"><div><b>Status</b>${esc(r.status === "SUBMITTED" ? "Submitted" : "Draft")}</div><div><b>Reported</b>${esc(fmtMinutes(r.reportedMinutes))}</div><div><b>Attendance</b>${esc(att ? fmtMinutes(att.totalMinutes) : "--")}</div><div><b>Submitted at</b>${esc(r.submittedAt ? fmtTime(r.submittedAt) : "--")}</div></div>
<table><thead><tr><th>Time</th><th>Project</th><th>Category</th><th>Work done</th><th>Status</th><th>Hours</th></tr></thead><tbody>${rows}</tbody></table>
${techBlock}${block("Achievements", r.summary?.achievements)}${block("Blockers / issues", r.summary?.blockers)}${block("Plan for tomorrow", r.summary?.tomorrowPlan)}${block("Notes", r.summary?.notes)}
<script>window.onload=function(){window.print()}</script></body></html>`);
  w.document.close();
}

function ReportModal({ id, onClose, onChanged }) {
  const api = useApi();
  const toast = useToast();
  const [note, setNote] = useState("");
  const [reopening, setReopening] = useState(false);
  const [busy, setBusy] = useState(false);
  const res = useAsync(() => (id ? api.get(`/api/reports/${id}`) : Promise.resolve(null)), [id]);
  const r = res.data?.report;
  const att = res.data?.attendance;

  const reopen = async () => {
    setBusy(true);
    try {
      await api.patch(`/api/reports/${id}/reopen`, { note });
      toast("Report reopened - the employee was notified");
      setReopening(false);
      setNote("");
      res.reload({ silent: true });
      onChanged?.();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={Boolean(id)} onClose={onClose} size="xl" title={r ? `${r.userName} · Daily Report` : "Daily Report"} subtitle={r ? fmtDay(r.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : ""}>
      {res.loading && !r ? <Spinner /> : res.error ? <ErrorNote message={res.error} onRetry={res.reload} /> : r && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              ["Employee", `${r.userName}${r.role ? ` · ${r.role}` : ""}`],
              ["Branch", r.branchId?.name || "--"],
              ["Reported", fmtMinutes(r.reportedMinutes)],
              ["Attendance", att ? fmtMinutes(att.totalMinutes) : "--"],
              ["Status", r.status === "SUBMITTED" ? `Submitted ${fmtTime(r.submittedAt)}` : "Draft"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-slate-50 px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">{k}</p>
                <p className="text-xs font-bold text-slate-800 mt-0.5 truncate">{v}</p>
              </div>
            ))}
          </div>

          <Table head={["Time", "Project", "Category", "Work done", "Status", "Hours"]}>
            {(r.entries || []).map((e, i) => (
              <tr key={i}>
                <td className="px-4 py-3 whitespace-nowrap font-semibold tabular-nums">{e.from} – {e.to}</td>
                <td className="px-4 py-3 text-slate-600">{e.project || <span className="text-slate-300">--</span>}</td>
                <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{e.category}</td>
                <td className="px-4 py-3 text-slate-800 min-w-[14rem]">{e.task}</td>
                <td className="px-4 py-3"><Badge tone={STATUS_TONE[e.status] || "slate"}>{e.status}</Badge></td>
                <td className="px-4 py-3 whitespace-nowrap font-semibold">{fmtMinutes(e.minutes)}</td>
              </tr>
            ))}
          </Table>

          <TechWorkView techWork={r.techWork} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[["Achievements", r.summary?.achievements], ["Blockers / issues", r.summary?.blockers], ["Plan for tomorrow", r.summary?.tomorrowPlan], ["Notes", r.summary?.notes]].map(([k, v]) =>
              v ? (
                <div key={k} className="rounded-2xl border border-slate-100 p-4">
                  <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1">{k}</p>
                  <p className="text-xs text-slate-700 whitespace-pre-wrap">{v}</p>
                </div>
              ) : null
            )}
          </div>

          {r.reopenedBy && <p className="text-[11px] text-slate-400">Reopened by {r.reopenedBy}{r.reopenedAt ? ` on ${fmtDay(istDateKey(r.reopenedAt))}` : ""}.</p>}

          {reopening ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
              <Field label="What should the employee fix? (optional)"><TextArea value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} rows={2} /></Field>
              <div className="flex justify-end gap-2 mt-3">
                <Button size="sm" variant="ghost" onClick={() => setReopening(false)}>Cancel</Button>
                <Button size="sm" onClick={reopen} loading={busy}><RotateCcw size={13} /> Reopen for correction</Button>
              </div>
            </div>
          ) : (
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => printReport(r, att)}><Printer size={13} /> Print / PDF</Button>
              {r.status === "SUBMITTED" && <Button variant="ghost" size="sm" onClick={() => setReopening(true)}><RotateCcw size={13} /> Reopen</Button>}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function ReportsBody() {
  const api = useApi();
  const today = istDateKey();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [q, setQ] = useState("");
  const [branchId, setBranchId] = useState("");
  const [status, setStatus] = useState("");
  const [openId, setOpenId] = useState(null);
  const [showMissing, setShowMissing] = useState(false);

  const branches = useAsync(() => api.get("/api/branches"), []);
  const list = useAsync(() => api.get("/api/reports", { from, to, q, branchId, status }), [from, to, q, branchId, status]);
  const oneDay = from === to;
  const missing = useAsync(() => (oneDay ? api.get("/api/reports/summary", { date: to }) : Promise.resolve(null)), [from, to]);
  useLiveRefresh("admin", (o) => { list.reload(o); missing.reload(o); }, { events: ["notification"], pollMs: 30000 });

  const reports = useMemo(() => list.data?.reports || [], [list.data]);
  const submitted = reports.filter((r) => r.status === "SUBMITTED").length;
  const drafts = reports.length - submitted;
  const totalMin = reports.reduce((t, r) => t + (r.reportedMinutes || 0), 0);
  const notSubmitted = missing.data?.missing || [];

  const exportCsv = () =>
    downloadCsv(`daily-reports-${from}_${to}.csv`, [
      ["Date", "Employee", "Role", "Branch", "Status", "From", "To", "Project", "Category", "Work done", "Entry status", "Minutes", "Tech task % (day)", "Tech ticked / allocated"],
      ...reports.flatMap((r) =>
        (r.entries?.length ? r.entries : [{}]).map((e) => [r.date, r.userName, r.role, r.branchId?.name || "", r.status, e.from || "", e.to || "", e.project || "", e.category || "", e.task || "", e.status || "", e.minutes ?? "", r.techWork?.allocated > 0 ? r.techWork.percent : "", r.techWork?.allocated > 0 ? `${r.techWork.ticked}/${r.techWork.allocated}` : ""])
      ),
    ]);

  return (
    <div className="space-y-5">
      <PageHeader
        icon={<ClipboardList size={20} />}
        title="Daily Reports"
        subtitle="What every employee did during their working day."
        actions={
          <>
            <Button variant="ghost" onClick={() => { list.reload(); missing.reload(); }}><RefreshCw size={13} className={list.loading ? "animate-spin" : ""} /> Refresh</Button>
            <Button variant="ghost" onClick={exportCsv} disabled={!reports.length}><Download size={13} /> CSV</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Reports" value={reports.length} tone="blue" />
        <Stat label="Submitted" value={submitted} tone="green" onClick={() => setStatus(status === "SUBMITTED" ? "" : "SUBMITTED")} active={status === "SUBMITTED"} />
        <Stat label="Drafts" value={drafts} tone={drafts ? "amber" : "slate"} onClick={() => setStatus(status === "DRAFT" ? "" : "DRAFT")} active={status === "DRAFT"} />
        {oneDay ? (
          <Stat label="Not submitted" value={notSubmitted.length} tone={notSubmitted.length ? "red" : "slate"} hint="worked, no report" onClick={() => setShowMissing((v) => !v)} active={showMissing} />
        ) : (
          <Stat label="Hours reported" value={fmtMinutes(totalMin)} tone="violet" />
        )}
      </div>

      {oneDay && showMissing && (
        <Card>
          <p className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2"><UserX size={15} className="text-red-500" /> Worked on {fmtDay(to)} but has not submitted</p>
          {notSubmitted.length === 0 ? <p className="text-xs text-slate-400">Everyone who worked has submitted.</p> : (
            <div className="flex flex-wrap gap-2">
              {notSubmitted.map((m) => <Badge key={String(m.userId)} tone={m.draft ? "amber" : "red"}>{m.name}{m.draft ? " · draft only" : ""} · {fmtMinutes(m.totalMinutes)} worked</Badge>)}
            </div>
          )}
        </Card>
      )}

      <Card padded={false}>
        <div className="grid grid-cols-2 md:flex md:flex-wrap gap-3 p-4 border-b border-slate-100">
          <TextInput type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value || today)} className="md:!w-40" aria-label="From date" />
          <TextInput type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value || today)} className="md:!w-40" aria-label="To date" />
          <div className="relative col-span-2 md:flex-1 md:min-w-[12rem]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
            <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search employee name" className="!pl-9" />
          </div>
          <Select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="md:!w-44">
            <option value="">All branches</option>
            {(branches.data?.branches || []).map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="md:!w-36">
            <option value="">All statuses</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="DRAFT">Draft</option>
          </Select>
        </div>
        <ErrorNote message={list.error} onRetry={list.reload} />
        {list.loading && !list.data ? <Spinner /> : reports.length === 0 ? (
          <Empty icon={<ClipboardList size={20} />} title="No reports for these filters" hint="Reports appear here as soon as employees start writing them." />
        ) : (
          <Table head={["Date", "Employee", "Branch", "Entries", "Reported", "Attendance", "Tech task %", "Status", ""]} className="!border-0 !rounded-none">
            {reports.map((r) => (
              <tr key={r._id} className="cursor-pointer hover:bg-sky-50/60" onClick={() => setOpenId(r._id)}>
                <td className="px-4 py-3 whitespace-nowrap font-semibold text-slate-700">{fmtDay(r.date, { day: "2-digit", month: "short" })}</td>
                <td className="px-4 py-3">
                  <p className="font-bold text-slate-800">{r.userName}</p>
                  <p className="text-[10px] text-slate-400">{[r.role, r.department].filter(Boolean).join(" · ")}</p>
                </td>
                <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{r.branchId?.name || "--"}</td>
                <td className="px-4 py-3 tabular-nums">{r.entries?.length || 0}</td>
                <td className="px-4 py-3 font-semibold whitespace-nowrap">{fmtMinutes(r.reportedMinutes)}</td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{r.attendanceMinutes ? fmtMinutes(r.attendanceMinutes) : "--"}</td>
                <td className="px-4 py-3 whitespace-nowrap">{r.techWork?.allocated > 0 ? <span title={`${r.techWork.ticked} of ${r.techWork.allocated} allocated ticked`}><Badge tone={pctTone(r.status === "SUBMITTED" ? r.techWork.percent : null)}><Cpu size={10} /> {r.status === "SUBMITTED" ? pctText(r.techWork.percent) : "draft"}</Badge></span> : <span className="text-slate-300">--</span>}</td>
                <td className="px-4 py-3"><Badge tone={r.status === "SUBMITTED" ? "green" : "amber"}>{r.status === "SUBMITTED" ? "Submitted" : "Draft"}</Badge>{r.submittedAt && <span className="block text-[10px] text-slate-400 mt-0.5">{fmtTime(r.submittedAt)}</span>}</td>
                <td className="px-4 py-3 text-right text-[11px] font-semibold text-blue-700"><Eye size={13} className="inline mr-1" />View</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <ReportModal id={openId} onClose={() => setOpenId(null)} onChanged={() => list.reload({ silent: true })} />
    </div>
  );
}

export default function AdminDailyReports() {
  const [tab, setTab] = useState("reports");
  return (
    <Themed role="admin">
      <div className="p-4 sm:p-6 lg:p-8 space-y-5">
        <Tabs
          tabs={[
            { id: "reports", label: "Daily reports", icon: <ClipboardList size={14} /> },
            { id: "tech", label: "Technologies tasks", icon: <Cpu size={14} /> },
          ]}
          value={tab}
          onChange={setTab}
        />
        {tab === "reports" ? <ReportsBody /> : <TechTasksAdmin />}
      </div>
    </Themed>
  );
}