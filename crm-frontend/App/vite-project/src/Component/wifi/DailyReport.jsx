// Employee "Daily Report" (DHR): what I did during my working day, hour by hour.
// One report per day. Save as a draft while you work, submit at the end of the day.
// Administrators see every submitted report (Daily Reports tab).
import React, { useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, ClipboardList, Clock, Eye, FilePenLine, Plus, Save, Send, Trash2, Wand2 } from "lucide-react";
import { useAsync } from "../../lib/hooks";
import { addDaysKey, fmtDay, fmtMinutes, fmtTime, istDateKey } from "../../lib/format";
import { TechWorkCard, TechWorkView, pctText } from "./TechWorkCard";
import { Badge, Button, Card, ErrorNote, Field, Modal, PageHeader, Select, Spinner, Table, TextArea, TextInput, Themed, useApi, useConfirm, useToast } from "./ui";

const CATEGORIES = ["Development", "Testing / QA", "Design", "Meeting", "Support", "Learning", "Documentation", "Admin / Other"];
const ENTRY_STATUS = ["Completed", "In Progress", "Blocked"];
const STATUS_TONE = { Completed: "green", "In Progress": "blue", Blocked: "red" };

const toMin = (t) => (/^\d{2}:\d{2}$/.test(t || "") ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : null);
const hhmm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const blank = (from = "", to = "") => ({ from, to, project: "", category: "Development", task: "", status: "Completed" });
const rowMinutes = (r) => {
  const a = toMin(r.from);
  const b = toMin(r.to);
  return a !== null && b !== null && b > a ? b - a : 0;
};
const isEmptyRow = (r) => !r.task?.trim() && !r.project?.trim();
const EMPTY_SUMMARY = { achievements: "", blockers: "", tomorrowPlan: "", notes: "" };

// Read-only view of a submitted report (nothing here can be edited)
function ReportView({ report, onClose }) {
  if (!report) return null;
  const blocks = [["Achievements", report.summary?.achievements], ["Blockers / issues", report.summary?.blockers], ["Plan for tomorrow", report.summary?.tomorrowPlan], ["Notes", report.summary?.notes]];
  return (
    <Modal open onClose={onClose} size="xl" title="Daily Report" subtitle={fmtDay(report.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}>
      <div className="space-y-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            ["Reported", fmtMinutes(report.reportedMinutes)],
            ["Entries", String(report.entries?.length || 0)],
            ["Attendance", report.attendanceMinutes ? fmtMinutes(report.attendanceMinutes) : "--"],
            ["Submitted at", report.submittedAt ? fmtTime(report.submittedAt) : "--"],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-slate-50 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">{k}</p>
              <p className="text-xs font-bold text-slate-800 mt-0.5">{v}</p>
            </div>
          ))}
        </div>

        <Table head={["Time", "Project", "Category", "Work done", "Status", "Hours"]}>
          {(report.entries || []).map((e, i) => (
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

        <TechWorkView techWork={report.techWork} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {blocks.map(([k, v]) =>
            v ? (
              <div key={k} className="rounded-2xl border border-slate-100 p-4">
                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1">{k}</p>
                <p className="text-xs text-slate-700 whitespace-pre-wrap">{v}</p>
              </div>
            ) : null
          )}
        </div>
      </div>
    </Modal>
  );
}

function Body() {
  const api = useApi();
  const toast = useToast();
  const [confirm, ask] = useConfirm();
  const today = istDateKey();
  const [date, setDate] = useState(today);
  const [rows, setRows] = useState([blank()]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [busy, setBusy] = useState("");
  const [dirty, setDirty] = useState(false);
  const [viewing, setViewing] = useState(null); // a submitted report opened for reading
  const [techDone, setTechDone] = useState(new Set()); // ids of the allocated work ticked today
  const [techConfirmed, setTechConfirmed] = useState(false);

  const res = useAsync(() => api.get("/api/reports/my", { date }), [date]);
  useEffect(() => setTechConfirmed(false), [date]);
  const history = useAsync(() => api.get("/api/reports/my/list", { limit: 31 }), []);
  const report = res.data?.report || null;
  const submitted = report?.status === "SUBMITTED";
  const att = res.data?.attendance;
  const shift = res.data?.shift;

  useEffect(() => {
    if (!res.data) return;
    setRows(report?.entries?.length ? report.entries.map((e) => ({ ...blank(), ...e })) : [blank()]);
    setSummary({ ...EMPTY_SUMMARY, ...(report?.summary || {}) });
    setTechDone(new Set((res.data.tech?.items || []).filter((i) => i.done).map((i) => String(i.taskId))));
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [res.data]);

  const reportedMin = useMemo(() => rows.reduce((t, r) => t + rowMinutes(r), 0), [rows]);
  const workedMin = att?.totalMinutes || 0;
  const gap = workedMin ? reportedMin - workedMin : 0;

  const edit = (i, patch) => { setRows((cur) => cur.map((r, k) => (k === i ? { ...r, ...patch } : r))); setDirty(true); };
  const add = () => {
    const last = rows[rows.length - 1];
    const start = last?.to && toMin(last.to) !== null ? toMin(last.to) : toMin(shift?.start) ?? 570;
    setRows((cur) => [...cur, blank(hhmm(start), hhmm(Math.min(start + 60, 1439)))]);
    setDirty(true);
  };
  const remove = (i) => { setRows((cur) => (cur.length > 1 ? cur.filter((_, k) => k !== i) : [blank()])); setDirty(true); };
  const fillHours = () => {
    const a = toMin(shift?.start) ?? 570;
    const b = toMin(shift?.end) ?? 1110;
    const list = [];
    for (let m = a; m < b; m += 60) list.push(blank(hhmm(m), hhmm(Math.min(m + 60, b))));
    setRows(list.length ? list : [blank()]);
    setDirty(true);
  };
  const tech = res.data?.tech || null; // null = no allocated work, so no Technologies Task card
  const toggleTech = (id) => {
    setTechDone((cur) => {
      const n = new Set(cur);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
    setTechConfirmed(false); // the list changed: confirm it again
    setDirty(true);
  };
  const setSum = (k) => (e) => { setSummary((s) => ({ ...s, [k]: e.target.value })); setDirty(true); };

  const payload = () => ({
    date,
    entries: rows.filter((r) => !isEmptyRow(r) || (r.from && r.to && r.task)).map((r) => ({ ...r, project: r.project.trim(), task: r.task.trim() })),
    summary,
    ...(tech && !tech.locked ? { techWork: { doneIds: [...techDone], confirmed: techConfirmed } } : {}),
  });

  const saveDraft = async () => {
    setBusy("draft");
    try {
      await api.put("/api/reports/my", payload());
      toast("Draft saved");
      setDirty(false);
      res.reload({ silent: true });
      history.reload({ silent: true });
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy("");
    }
  };

  const problems = () => {
    const p = payload();
    if (!p.entries.length) return "Add at least one entry describing your work.";
    for (let i = 0; i < p.entries.length; i += 1) {
      const e = p.entries[i];
      if (toMin(e.from) === null || toMin(e.to) === null) return `Entry ${i + 1}: choose the start and end time.`;
      if (toMin(e.to) <= toMin(e.from)) return `Entry ${i + 1}: the end time must be after the start time.`;
      if (e.task.length < 5) return `Entry ${i + 1}: describe what you did.`;
    }
    if (tech && !tech.locked && !techConfirmed) return "Update the Technologies Task card: tick the allocated work you completed today, then confirm the list.";
    if (summary.achievements.trim().length < 10) return "Write a short summary of what you achieved today.";
    return "";
  };

  const submit = () => {
    const msg = problems();
    if (msg) return toast(msg, "error");
    ask({
      title: "Submit today's report?",
      message: `${payload().entries.length} entries · ${fmtMinutes(reportedMin)} reported${tech ? ` · Technologies Task ${techDone.size}/${tech.items.length} (${pctText(tech.items.length ? Math.round((techDone.size / tech.items.length) * 1000) / 10 : null)})` : ""}. After submitting you cannot edit it unless an administrator reopens it.`,
      confirmLabel: "Submit report",
      onYes: async () => {
        setBusy("submit");
        try {
          await api.post("/api/reports/my/submit", payload());
          toast("Daily report submitted");
          window.scrollTo?.({ top: 0, behavior: "smooth" });
          res.reload({ silent: true });
          history.reload({ silent: true });
        } catch (e) {
          toast(e.message, "error");
        } finally {
          setBusy("");
        }
      },
    });
  };

  if (res.loading && !res.data) return <Spinner />;
  if (res.error && !res.data) return <ErrorNote message={res.error} onRetry={res.reload} />;
  const locked = submitted;

  return (
    <div className="space-y-5">
      {confirm}
      <PageHeader
        icon={<ClipboardList size={20} />}
        title="Daily Report"
        subtitle="Write down what you worked on during the day. Your manager sees it as soon as you submit."
        actions={
          <div className="flex items-center gap-2">
            <TextInput type="date" value={date} min={addDaysKey(today, -14)} max={today} onChange={(e) => setDate(e.target.value || today)} className="!w-auto" aria-label="Report date" />
            <Badge tone={submitted ? "green" : "amber"}>{submitted ? "Submitted" : report ? "Draft" : "Not started"}</Badge>
          </div>
        }
      />

      {report?.reopenedBy && !submitted && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          <b>{report.reopenedBy}</b> reopened this report for correction. Update it and submit again.
        </div>
      )}
      {submitted && (
        <Card className="border-emerald-200 bg-emerald-50/60">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0"><CheckCircle2 size={22} /></div>
            <div>
              <p className="text-sm font-bold text-slate-900">{date === today ? "Today's report is submitted" : `The report for ${fmtDay(date)} is submitted`}. Thank you!</p>
              <p className="text-xs text-slate-600 mt-1">Submitted at {fmtTime(report.submittedAt)}. You can view it below but it cannot be changed. If something needs correcting, ask your administrator to reopen it.</p>
            </div>
          </div>
        </Card>
      )}

      {submitted && tech && <TechWorkCard tech={tech} done={techDone} onToggle={() => {}} confirmed onConfirm={() => {}} />}

      {!submitted && (
        <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          ["Shift", shift ? `${shift.start} – ${shift.end}` : "--"],
          ["Attendance", att ? fmtMinutes(att.totalMinutes) : "No attendance"],
          ["Reported so far", fmtMinutes(reportedMin)],
          ["Difference", workedMin ? `${gap > 0 ? "+" : ""}${fmtMinutes(Math.abs(gap))}${gap < 0 ? " unreported" : ""}` : "--"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl bg-white border border-slate-100 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">{k}</p>
            <p className="text-xs font-bold text-slate-800 mt-0.5">{v}</p>
          </div>
        ))}
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <p className="text-sm font-bold text-slate-800 flex items-center gap-2"><Clock size={15} className="text-sky-500" /> Work log</p>
          {!locked && (
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={fillHours} title="Adds one row for every hour of your shift"><Wand2 size={13} /> Hourly rows</Button>
              <Button size="sm" variant="ghost" onClick={add}><Plus size={13} /> Add entry</Button>
            </div>
          )}
        </div>

        <ol className="space-y-3">
          {rows.map((r, i) => (
            <li key={i} className="rounded-2xl border border-slate-100 bg-slate-50/50 p-3">
              <div className="grid grid-cols-2 md:grid-cols-12 gap-2.5 items-end">
                <Field label="From" className="md:col-span-2"><TextInput type="time" value={r.from} disabled={locked} onChange={(e) => edit(i, { from: e.target.value })} /></Field>
                <Field label="To" className="md:col-span-2"><TextInput type="time" value={r.to} disabled={locked} onChange={(e) => edit(i, { to: e.target.value })} /></Field>
                <Field label="Project / module" className="col-span-2 md:col-span-3"><TextInput value={r.project} disabled={locked} maxLength={80} placeholder="e.g. Staff CRM" onChange={(e) => edit(i, { project: e.target.value })} /></Field>
                <Field label="Category" className="md:col-span-3">
                  <Select value={r.category} disabled={locked} onChange={(e) => edit(i, { category: e.target.value })}>
                    {[...new Set([r.category, ...CATEGORIES])].filter(Boolean).map((c) => <option key={c}>{c}</option>)}
                  </Select>
                </Field>
                <Field label="Status" className="md:col-span-2">
                  <Select value={r.status} disabled={locked} onChange={(e) => edit(i, { status: e.target.value })}>{ENTRY_STATUS.map((s) => <option key={s}>{s}</option>)}</Select>
                </Field>
              </div>
              <Field label="What did you do?" className="mt-2.5">
                <TextArea value={r.task} rows={2} disabled={locked} maxLength={500} placeholder="Describe the work in a sentence or two: what, for whom, and the result." onChange={(e) => edit(i, { task: e.target.value })} />
              </Field>
              <div className="flex items-center justify-between mt-2">
                <span className="text-[11px] font-semibold text-slate-500">{rowMinutes(r) ? fmtMinutes(rowMinutes(r)) : "--"}{locked && <Badge tone={STATUS_TONE[r.status] || "slate"} className="ml-2">{r.status}</Badge>}</span>
                {!locked && <button onClick={() => remove(i)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-500 hover:underline" aria-label={`Remove entry ${i + 1}`}><Trash2 size={12} /> Remove</button>}
              </div>
            </li>
          ))}
        </ol>
      </Card>

      {tech && <TechWorkCard tech={tech} done={techDone} onToggle={toggleTech} confirmed={techConfirmed} onConfirm={(v) => { setTechConfirmed(v); setDirty(true); }} />}

      <Card>
        <p className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2"><FilePenLine size={15} className="text-sky-500" /> End-of-day summary</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="What I achieved today *" className="md:col-span-2"><TextArea value={summary.achievements} rows={3} disabled={locked} maxLength={1500} onChange={setSum("achievements")} placeholder="The main results of your day." /></Field>
          <Field label="Blockers / issues"><TextArea value={summary.blockers} rows={3} disabled={locked} maxLength={1500} onChange={setSum("blockers")} placeholder="Anything that slowed you down or needs help." /></Field>
          <Field label="Plan for tomorrow"><TextArea value={summary.tomorrowPlan} rows={3} disabled={locked} maxLength={1500} onChange={setSum("tomorrowPlan")} placeholder="What you will work on next." /></Field>
          <Field label="Other notes" className="md:col-span-2"><TextArea value={summary.notes} rows={2} disabled={locked} maxLength={1500} onChange={setSum("notes")} /></Field>
        </div>
        {!locked && (
          <div className="flex flex-wrap items-center justify-end gap-2 mt-5">
            {dirty && <span className="text-[11px] text-amber-600 font-semibold mr-auto">Unsaved changes</span>}
            <Button variant="ghost" onClick={saveDraft} loading={busy === "draft"}><Save size={14} /> Save draft</Button>
            <Button onClick={submit} loading={busy === "submit"}><Send size={14} /> Submit report</Button>
          </div>
        )}
      </Card>
        </>
      )}

      {history.data?.reports?.length > 0 && (
        <Card>
          <p className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2"><CalendarDays size={15} className="text-sky-500" /> My reports</p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {history.data.reports.map((h) => (
              <li key={h._id}>
                <button
                  onClick={() => (h.status === "SUBMITTED" ? setViewing(h) : setDate(h.date))}
                  className={`w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-xs hover:bg-slate-50 ${h.date === date ? "border-sky-300 bg-sky-50/50" : "border-slate-100"}`}
                >
                  <span className="font-bold text-slate-800 w-24 shrink-0">{fmtDay(h.date, { weekday: "short", day: "2-digit", month: "short" })}</span>
                  <span className="text-slate-500">{fmtMinutes(h.reportedMinutes)} · {h.entries?.length || 0} entries{h.techWork?.allocated > 0 ? ` · Tech ${pctText(h.techWork.percent)}` : ""}</span>
                  {h.status === "SUBMITTED" ? (
                    <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600"><CheckCircle2 size={14} /> Submitted <Eye size={13} className="text-slate-400" /></span>
                  ) : (
                    <Badge tone="amber" className="ml-auto">Draft · continue</Badge>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <ReportView report={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}

export default function DailyReport() {
  return (
    <Themed role="user">
      <div className="p-4 sm:p-6 lg:p-8"><Body /></div>
    </Themed>
  );
}