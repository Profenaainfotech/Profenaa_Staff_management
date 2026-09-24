// Admin "Technologies Tasks" (inside Daily Reports):
//   - allocate a technologies task, or a piece of PAST WORK the company has done, to particular staff
//   - see each allocated person's daily percentage (ticked / allocated in their Daily Report)
//   - click a person to see every day: what they ticked, what they left, and the days with no report (0%)
// Only the staff you allocate work to see the Technologies Task card in their Daily Report.
import React, { useMemo, useState } from "react";
import { Archive, ChevronDown, Cpu, Crown, Pencil, Pause, Play, Plus, RefreshCw, Search, Trash2, TriangleAlert } from "lucide-react";
import { useAsync, useLiveRefresh } from "../../lib/hooks";
import { addDaysKey, fmtDay, istDateKey } from "../../lib/format";
import { Badge, Button, Card, Empty, ErrorNote, Field, Modal, PageHeader, Select, Spinner, Stat, Table, TextArea, TextInput, useApi, useConfirm, useToast } from "./ui";
import { PercentBar, TechWorkView, pctText, pctTone } from "./TechWorkCard";

const KIND_LABEL = { Task: "Technologies task", PastWork: "Past work" };
const KIND_TONE = { Task: "blue", PastWork: "violet" };
const TXT = { green: "text-emerald-600", amber: "text-amber-600", red: "text-red-600", slate: "text-slate-400" };
const DAY_TONE = { Submitted: "green", Pending: "blue", Missing: "red" };

// ------------------------------------------------------------------ allocate / edit
function AllocateModal({ task, staff, onClose, onDone }) {
  const api = useApi();
  const toast = useToast();
  const editing = Boolean(task);
  const today = istDateKey();
  const [f, setF] = useState({
    kind: task?.kind || "Task",
    title: task?.title || "",
    technology: task?.technology || "",
    description: task?.description || "",
    referenceUrl: task?.referenceUrl || "",
    startDate: task?.startDate || today,
    endDate: task?.endDate || "",
  });
  const [picked, setPicked] = useState(new Set());
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? staff.filter((s) => [s.name, s.role, s.department].some((v) => String(v || "").toLowerCase().includes(n))) : staff;
  }, [staff, q]);
  const toggle = (id) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const ready = f.title.trim() && (editing || picked.size > 0) && (!f.endDate || f.endDate >= f.startDate);

  const go = async () => {
    setBusy(true);
    try {
      if (editing) await api.put(`/api/tech-tasks/${task._id}`, f);
      else await api.post("/api/tech-tasks", { ...f, userIds: [...picked] });
      toast(editing ? "Allocation updated" : `Allocated to ${picked.size} staff`);
      onDone();
      onClose();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} size="lg" title={editing ? "Edit allocated work" : "Allocate work"} subtitle={editing ? task.assignedToName : "Only the staff you choose will see it in their Daily Report."}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={go} loading={busy} disabled={!ready}>{editing ? "Save changes" : `Allocate${picked.size ? ` to ${picked.size}` : ""}`}</Button></>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Type *" className="sm:col-span-2">
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(KIND_LABEL).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setF((x) => ({ ...x, kind: k }))} aria-pressed={f.kind === k}
                className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold transition ${f.kind === k ? "border-blue-600 bg-blue-50 text-blue-800" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                {k === "Task" ? <Cpu size={14} /> : <Archive size={14} />} {label}
              </button>
            ))}
          </div>
        </Field>
        <Field label={f.kind === "PastWork" ? "Past work title *" : "Task title *"} className="sm:col-span-2"><TextInput value={f.title} maxLength={150} onChange={set("title")} placeholder={f.kind === "PastWork" ? "e.g. E-commerce site built for ABC Traders" : "e.g. Build a REST API with JWT login"} /></Field>
        <Field label="Technology"><TextInput value={f.technology} maxLength={60} onChange={set("technology")} placeholder="React, Node.js, MongoDB..." /></Field>
        <Field label="Reference link" hint="Optional (past work / material)"><TextInput value={f.referenceUrl} maxLength={300} onChange={set("referenceUrl")} placeholder="https://" /></Field>
        <Field label="Details" className="sm:col-span-2"><TextArea rows={3} maxLength={1500} value={f.description} onChange={set("description")} placeholder="What the staff member has to do." /></Field>
        <Field label="Shows in the Daily Report from"><TextInput type="date" value={f.startDate} onChange={set("startDate")} /></Field>
        <Field label="Until (optional)" hint="Leave blank to keep it until you stop it"><TextInput type="date" value={f.endDate} min={f.startDate} onChange={set("endDate")} /></Field>

        {!editing && (
          <div className="sm:col-span-2">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-slate-700">Allocate to *</p>
              <button type="button" className="text-[11px] font-semibold text-blue-700 hover:underline" onClick={() => setPicked(picked.size === shown.length ? new Set() : new Set(shown.map((s) => s.userId)))}>
                {picked.size === shown.length && shown.length ? "Clear" : "Select all shown"}
              </button>
            </div>
            <div className="relative mb-2">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
              <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search staff" className="!pl-9" />
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
              {shown.map((s) => (
                <li key={s.userId}>
                  <label className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 text-xs cursor-pointer ${picked.has(s.userId) ? "border-blue-500 bg-blue-50" : "border-slate-100 hover:bg-slate-50"}`}>
                    <input type="checkbox" checked={picked.has(s.userId)} onChange={() => toggle(s.userId)} />
                    <span className="min-w-0"><b className="block truncate text-slate-800">{s.name}</b><span className="block truncate text-[10px] text-slate-400">{[s.role, s.department].filter(Boolean).join(" · ")}</span></span>
                  </label>
                </li>
              ))}
              {!shown.length && <li className="text-xs text-slate-400 py-2">No staff found.</li>}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ one person, day by day
function PersonModal({ person, from, to, onClose }) {
  const api = useApi();
  const res = useAsync(() => api.get("/api/tech-tasks/performance", { from, to, userId: person.userId }), [person.userId, from, to]);
  const mine = useAsync(() => api.get("/api/tech-tasks", { userId: person.userId, status: "all" }), [person.userId]);
  const p = res.data?.staff?.[0] || person;
  const [open, setOpen] = useState(null);
  const tone = pctTone(p.avgPercent);

  return (
    <Modal open onClose={onClose} size="xl" title={`${person.name} · Technologies Task`} subtitle={`${fmtDay(from)} to ${fmtDay(to)}${person.role ? ` · ${person.role}` : ""}`}>
      {res.loading && !res.data ? <Spinner /> : res.error ? <ErrorNote message={res.error} onRetry={res.reload} /> : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              ["Average daily %", pctText(p.avgPercent), TXT[tone]],
              ["Days counted", String(p.daysCounted ?? 0), "text-slate-800"],
              ["Days with no report (0%)", String(p.missingDays ?? 0), p.missingDays ? "text-red-600" : "text-slate-800"],
              ["Allocated now", String(p.currentAllocated ?? 0), "text-slate-800"],
            ].map(([k, v, c]) => (
              <div key={k} className="rounded-xl bg-slate-50 px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">{k}</p>
                <p className={`text-lg font-black mt-0.5 ${c}`}>{v}</p>
              </div>
            ))}
          </div>

          {(p.days || []).length === 0 ? (
            <Empty icon={<Cpu size={20} />} title="No days to show" hint="No allocated work fell on a working day in this range." />
          ) : (
            <ul className="space-y-2">
              {[...p.days].reverse().map((d) => (
                <li key={d.date} className="rounded-2xl border border-slate-100">
                  <button type="button" onClick={() => setOpen(open === d.date ? null : d.date)} className="w-full flex flex-wrap items-center gap-3 px-4 py-3 text-left" aria-expanded={open === d.date}>
                    <span className="w-28 text-xs font-bold text-slate-800">{fmtDay(d.date, { weekday: "short", day: "2-digit", month: "short" })}</span>
                    <Badge tone={DAY_TONE[d.status] || "slate"}>{d.status === "Missing" ? "No report · 0%" : d.status}</Badge>
                    <span className="text-[11px] text-slate-500">{d.status === "Submitted" ? `${d.ticked}/${d.allocated} ticked` : `${d.allocated} allocated`}</span>
                    <span className="flex-1 min-w-[6rem]"><PercentBar value={d.percent} /></span>
                    <span className={`w-14 text-right text-sm font-black ${TXT[pctTone(d.percent)]}`}>{pctText(d.percent)}</span>
                    {d.items && <ChevronDown size={14} className={`text-slate-400 transition ${open === d.date ? "rotate-180" : ""}`} />}
                  </button>
                  {open === d.date && d.items && (
                    <div className="px-4 pb-4"><TechWorkView techWork={{ ...d, items: d.items, percent: d.percent, allocated: d.allocated, ticked: d.ticked }} /></div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {(mine.data?.tasks || []).length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-2">Everything allocated to {person.name}</p>
              <div className="flex flex-wrap gap-2">
                {mine.data.tasks.map((t) => <Badge key={t._id} tone={t.isActive ? KIND_TONE[t.kind] : "slate"}>{t.title}{t.isActive ? "" : " · stopped"}</Badge>)}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

// ------------------------------------------------------------------ main screen
export default function TechTasksAdmin() {
  const api = useApi();
  const toast = useToast();
  const [confirm, ask] = useConfirm();
  const today = istDateKey();
  const [from, setFrom] = useState(addDaysKey(today, -6));
  const [to, setTo] = useState(today);
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("active");
  const [q, setQ] = useState("");
  const [modal, setModal] = useState(null); // {type:'new'} | {type:'edit', task} | {type:'person', person}

  const perf = useAsync(() => api.get("/api/tech-tasks/performance", { from, to }), [from, to]);
  const list = useAsync(() => api.get("/api/tech-tasks", { kind, status }), [kind, status]);
  const staff = useAsync(() => api.get("/api/staff", { status: "active" }), []);
  useLiveRefresh("admin", (o) => { perf.reload(o); list.reload(o); }, { events: ["notification"], pollMs: 60000 });

  const people = perf.data?.staff || [];
  const attention = perf.data?.attention || [];
  const top = perf.data?.top;
  const attentionIds = new Set(attention.map((a) => String(a.userId)));
  const tasks = useMemo(() => {
    const n = q.trim().toLowerCase();
    const all = list.data?.tasks || [];
    return n ? all.filter((t) => [t.title, t.technology, t.assignedToName].some((v) => String(v || "").toLowerCase().includes(n))) : all;
  }, [list.data, q]);

  const reloadAll = () => { perf.reload({ silent: true }); list.reload({ silent: true }); };
  const toggleActive = async (t) => {
    try { await api.put(`/api/tech-tasks/${t._id}`, { isActive: !t.isActive }); toast(t.isActive ? "Stopped - it no longer shows in new reports" : "Resumed"); reloadAll(); }
    catch (e) { toast(e.message, "error"); }
  };
  const remove = (t) =>
    ask({
      title: `Delete "${t.title}"?`,
      message: `Removes it from ${t.assignedToName}. Reports already submitted keep their ticks. To just stop it, use Stop instead.`,
      confirmLabel: "Delete",
      danger: true,
      onYes: async () => { try { await api.del(`/api/tech-tasks/${t._id}`); toast("Allocation deleted"); reloadAll(); } catch (e) { toast(e.message, "error"); } },
    });

  const preset = (days) => { setTo(today); setFrom(addDaysKey(today, -(days - 1))); };

  return (
    <div className="space-y-5">
      {confirm}
      <PageHeader
        icon={<Cpu size={20} />}
        title="Technologies Tasks"
        subtitle="Allocate technologies tasks and past work to particular staff. They tick what they finish in their Daily Report; the daily percentage is worked out from those ticks."
        actions={<>
          <Button variant="ghost" onClick={() => { perf.reload(); list.reload(); }}><RefreshCw size={13} className={perf.loading ? "animate-spin" : ""} /> Refresh</Button>
          <Button onClick={() => setModal({ type: "new" })}><Plus size={14} /> Allocate work</Button>
        </>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Staff with allocated work" value={people.length} tone="blue" />
        <Stat label="Top performer" value={top ? `${top.avgPercent}%` : "--"} tone="green" hint={top?.name || "no submitted reports yet"} />
        <Stat label="Needs attention" value={attention.length} tone={attention.length ? "red" : "slate"} hint="under 50% or reports missed" />
        <Stat label="Active allocations" value={(list.data?.tasks || []).filter((t) => t.isActive).length} tone="violet" />
      </div>

      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-3 p-4 border-b border-slate-100">
          <p className="text-sm font-bold text-slate-800 mr-auto">Daily percentage by person</p>
          <div className="flex gap-1.5">
            {[[7, "7 days"], [30, "30 days"]].map(([d, l]) => <Button key={d} size="sm" variant="ghost" onClick={() => preset(d)}>{l}</Button>)}
          </div>
          <TextInput type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value || from)} className="!w-auto" aria-label="From date" />
          <TextInput type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value || to)} className="!w-auto" aria-label="To date" />
        </div>
        <ErrorNote message={perf.error} onRetry={perf.reload} />
        {perf.loading && !perf.data ? <Spinner /> : people.length === 0 ? (
          <Empty icon={<Cpu size={20} />} title="No allocated staff in this range" hint="Allocate work to particular staff and their daily percentage shows up here." />
        ) : (
          <Table head={["#", "Staff", "Allocated now", "Days", "Average daily %", "Today", "Missed", ""]} className="!border-0 !rounded-none">
            {people.map((p) => {
              const flagged = attentionIds.has(String(p.userId));
              const isTop = top && String(top.userId) === String(p.userId);
              return (
                <tr key={String(p.userId)} onClick={() => setModal({ type: "person", person: p })} className={`cursor-pointer ${isTop ? "bg-amber-50/60 hover:bg-amber-50" : flagged ? "bg-red-50/40 hover:bg-red-50/70" : "hover:bg-sky-50/60"}`}>
                  <td className="px-4 py-3 font-black text-slate-500">{p.rank ? (isTop ? <Crown size={16} className="text-amber-500" aria-label="Top performer" /> : `#${p.rank}`) : "--"}</td>
                  <td className="px-4 py-3">
                    <p className="font-bold text-slate-800 flex items-center gap-1.5">{p.name}{flagged && <TriangleAlert size={13} className="text-red-500" aria-label="Needs attention" />}</p>
                    <p className="text-[10px] text-slate-400">{[p.role, p.department].filter(Boolean).join(" · ")}</p>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{p.currentAllocated}</td>
                  <td className="px-4 py-3 tabular-nums">{p.daysCounted}</td>
                  <td className="px-4 py-3 min-w-[11rem]">
                    <div className="flex items-center gap-2"><PercentBar value={p.avgPercent} className="flex-1" /><b className={`w-12 text-right ${TXT[pctTone(p.avgPercent)]}`}>{pctText(p.avgPercent)}</b></div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{p.todayStatus === "Pending" ? <Badge tone="blue">Not submitted yet</Badge> : p.todayPercent === null ? <span className="text-slate-300">--</span> : <b className={TXT[pctTone(p.todayPercent)]}>{pctText(p.todayPercent)}</b>}</td>
                  <td className="px-4 py-3">{p.missingDays ? <Badge tone="red">{p.missingDays} day{p.missingDays === 1 ? "" : "s"} · 0%</Badge> : <span className="text-slate-300">0</span>}</td>
                  <td className="px-4 py-3 text-right text-[11px] font-semibold text-blue-700">Details</td>
                </tr>
              );
            })}
          </Table>
        )}
        <p className="px-4 py-3 text-[11px] text-slate-400 border-t border-slate-100">A day counts only when the person had allocated work and worked (or wrote a report). A worked day without a submitted report counts as 0%. Today is left out until the report is submitted.</p>
      </Card>

      <Card padded={false}>
        <div className="grid grid-cols-2 md:flex md:flex-wrap gap-3 p-4 border-b border-slate-100">
          <p className="col-span-2 md:mr-auto text-sm font-bold text-slate-800 self-center">Allocated work</p>
          <div className="relative col-span-2 md:w-56">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
            <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search work or staff" className="!pl-9" />
          </div>
          <Select value={kind} onChange={(e) => setKind(e.target.value)} className="md:!w-44"><option value="">All types</option><option value="Task">Technologies tasks</option><option value="PastWork">Past work</option></Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="md:!w-36"><option value="active">Active</option><option value="inactive">Stopped</option><option value="all">All</option></Select>
        </div>
        <ErrorNote message={list.error} onRetry={list.reload} />
        {list.loading && !list.data ? <Spinner /> : tasks.length === 0 ? (
          <Empty icon={<Archive size={20} />} title="Nothing allocated yet" hint="Use Allocate work to give a technologies task or past work to particular staff." action={<Button onClick={() => setModal({ type: "new" })}><Plus size={14} /> Allocate work</Button>} />
        ) : (
          <Table head={["Work", "Type", "Staff", "Period", "Status", ""]} className="!border-0 !rounded-none">
            {tasks.map((t) => (
              <tr key={t._id} className={t.isActive ? "" : "opacity-60"}>
                <td className="px-4 py-3 min-w-[14rem]"><p className="font-bold text-slate-800">{t.title}</p><p className="text-[10px] text-slate-400">{[t.technology, t.description].filter(Boolean).join(" · ").slice(0, 90)}</p></td>
                <td className="px-4 py-3"><Badge tone={KIND_TONE[t.kind]}>{KIND_LABEL[t.kind]}</Badge></td>
                <td className="px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">{t.assignedToName}</td>
                <td className="px-4 py-3 whitespace-nowrap text-slate-600">{fmtDay(t.startDate, { day: "2-digit", month: "short" })} – {t.endDate ? fmtDay(t.endDate, { day: "2-digit", month: "short" }) : "ongoing"}</td>
                <td className="px-4 py-3"><Badge tone={t.isActive ? "green" : "slate"}>{t.isActive ? "Active" : "Stopped"}</Badge></td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button onClick={() => setModal({ type: "edit", task: t })} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100" title="Edit" aria-label="Edit"><Pencil size={14} /></button>
                  <button onClick={() => toggleActive(t)} className={`p-1.5 rounded-lg hover:bg-slate-100 ${t.isActive ? "text-amber-500" : "text-emerald-600"}`} title={t.isActive ? "Stop" : "Resume"} aria-label={t.isActive ? "Stop" : "Resume"}>{t.isActive ? <Pause size={14} /> : <Play size={14} />}</button>
                  <button onClick={() => remove(t)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50" title="Delete" aria-label="Delete"><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {modal?.type === "new" && <AllocateModal staff={staff.data?.staff || []} onClose={() => setModal(null)} onDone={reloadAll} />}
      {modal?.type === "edit" && <AllocateModal task={modal.task} staff={[]} onClose={() => setModal(null)} onDone={reloadAll} />}
      {modal?.type === "person" && <PersonModal person={modal.person} from={from} to={to} onClose={() => setModal(null)} />}
    </div>
  );
}