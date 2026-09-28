// Employee "Leaves" tab: balances, apply, history, upcoming holidays.
import React, { useEffect, useState } from "react";
import { CalendarOff, PartyPopper, Plus } from "lucide-react";
import { useAsync } from "../../lib/hooks";
import { addDaysKey, fmtDay, istDateKey } from "../../lib/format";
import { Badge, Button, Card, Empty, ErrorNote, Field, Modal, PageHeader, Select, Spinner, Table, TextArea, TextInput, Themed, Toggle, useApi, useConfirm, useToast } from "./ui";

const TYPES = ["Casual Leave", "Sick Leave", "Earned Leave", "Work From Home", "Loss of Pay"];
const TONE = { Pending: "amber", Approved: "green", Rejected: "red", Cancelled: "slate" };

function ApplyModal({ open, onClose, onDone }) {
  const api = useApi();
  const toast = useToast();
  const today = istDateKey();
  const blank = { type: "Casual Leave", fromDate: today, toDate: today, halfDay: false, reason: "", coverUserId: "" };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [people, setPeople] = useState(null); // colleagues who can cover the pending work (null = loading)
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  // Work From Home is not time away from work, so it needs no one to cover
  const needsCover = f.type !== "Work From Home";

  // The colleague list is asked for again when the dates change, so anyone who is on approved
  // leave in that period is shown as unavailable.
  useEffect(() => {
    if (!open || !f.fromDate || !f.toDate) return undefined;
    let live = true;
    api
      .get("/api/leaves/colleagues", { from: f.fromDate, to: f.toDate })
      .then((r) => live && setPeople(r.staff || []))
      .catch(() => live && setPeople([]));
    return () => {
      live = false;
    };
  }, [open, f.fromDate, f.toDate, api]);

  const chosen = (people || []).find((p) => p._id === f.coverUserId);
  const chosenAway = Boolean(chosen?.onLeave);

  const submit = async () => {
    setBusy(true);
    try {
      const r = await api.post("/api/leaves", { ...f, coverUserId: f.coverUserId || undefined });
      toast(`Request sent (${r.leave.days} working day${r.leave.days === 1 ? "" : "s"})`);
      setF(blank);
      onDone();
      onClose();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Apply for leave"
      subtitle="Weekly offs and holidays inside the range are not counted."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={busy} disabled={!f.reason.trim() || !f.fromDate || !f.toDate || (needsCover && !f.coverUserId) || chosenAway}>Send request</Button></>}
    >
      <div className="space-y-4">
        <Field label="Type"><Select value={f.type} onChange={set("type")}>{TYPES.map((t) => <option key={t}>{t}</option>)}</Select></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From"><TextInput type="date" value={f.fromDate} min={addDaysKey(today, -60)} onChange={(e) => setF((x) => ({ ...x, fromDate: e.target.value, toDate: x.toDate < e.target.value ? e.target.value : x.toDate, halfDay: false }))} /></Field>
          <Field label="To"><TextInput type="date" value={f.toDate} min={f.fromDate} onChange={(e) => setF((x) => ({ ...x, toDate: e.target.value, halfDay: x.fromDate === e.target.value ? x.halfDay : false }))} /></Field>
        </div>
        {f.fromDate === f.toDate && <Toggle checked={f.halfDay} onChange={(v) => setF((x) => ({ ...x, halfDay: v }))} label="Half day" />}
        <Field label="Reason"><TextArea value={f.reason} onChange={set("reason")} maxLength={500} placeholder="Family function" /></Field>
        <Field
          label={needsCover ? "Alternative staff *" : "Alternative staff (optional)"}
          hint={
            chosenAway
              ? `${chosen.name} is on approved leave on these dates. Choose someone else.`
              : "The colleague who will complete your pending work while you are away. The administrator can see who you chose."
          }
        >
          <Select value={f.coverUserId} onChange={set("coverUserId")} disabled={people === null}>
            <option value="">{people === null ? "Loading staff..." : "Choose a staff member"}</option>
            {(people || []).map((p) => (
              <option key={p._id} value={p._id} disabled={p.onLeave}>
                {p.name}
                {p.role ? ` - ${p.role}` : ""}
                {p.onLeave ? " (on leave)" : ""}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}

function Body() {
  const api = useApi();
  const toast = useToast();
  const [confirm, ask] = useConfirm();
  const [apply, setApply] = useState(false);
  const balance = useAsync(() => api.get("/api/leaves/balance"), []);
  const mine = useAsync(() => api.get("/api/leaves/mine"), []);
  const holidays = useAsync(() => api.get("/api/holidays"), []);
  const today = istDateKey();

  const refresh = () => { balance.reload({ silent: true }); mine.reload({ silent: true }); };
  const cancel = (l) =>
    ask({
      title: "Cancel this request?",
      message: `${l.type}, ${fmtDay(l.fromDate)}${l.fromDate !== l.toDate ? ` to ${fmtDay(l.toDate)}` : ""}.`,
      confirmLabel: "Cancel request",
      onYes: async () => {
        try { await api.patch(`/api/leaves/${l._id}/cancel`); toast("Request cancelled"); refresh(); } catch (e) { toast(e.message, "error"); }
      },
    });

  const upcoming = (holidays.data?.holidays || []).filter((h) => h.date >= today).slice(0, 6);

  return (
    <div className="space-y-5">
      {confirm}
      <PageHeader icon={<CalendarOff size={20} />} title="Leaves" subtitle="Apply for leave and track your requests." actions={<Button onClick={() => setApply(true)}><Plus size={14} /> Apply for leave</Button>} />
      <ErrorNote message={balance.error || mine.error} onRetry={refresh} />

      {balance.data && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {balance.data.balance.map((b) => (
            <Card key={b.type} className="!p-4">
              <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">{b.type}</p>
              <p className="text-2xl font-black text-slate-900 mt-1">{b.remaining ?? "∞"}<span className="text-[11px] font-semibold text-slate-400"> {b.quota != null ? `/ ${b.quota} left` : "no limit"}</span></p>
              <p className="text-[10px] text-slate-400 mt-0.5">Used {b.used}{b.pending ? ` · ${b.pending} pending` : ""}</p>
            </Card>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          {mine.loading && !mine.data ? <Spinner /> : mine.data?.leaves.length ? (
            <Table head={["Type", "Dates", "Days", "Status", ""]}>
              {mine.data.leaves.map((l) => (
                <tr key={l._id}>
                  <td className="px-4 py-3 font-semibold text-slate-800 whitespace-nowrap">{l.type}{l.halfDay && <span className="text-slate-400 font-normal"> (half)</span>}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{fmtDay(l.fromDate)}{l.fromDate !== l.toDate && ` – ${fmtDay(l.toDate)}`}
                    {l.reason && <span className="block text-[10px] text-slate-400 max-w-[14rem] truncate" title={l.reason}>{l.reason}</span>}
                    {l.coverUserName && <span className="block text-[10px] text-sky-600 font-semibold">Work covered by {l.coverUserName}</span>}</td>
                  <td className="px-4 py-3">{l.days}</td>
                  <td className="px-4 py-3"><Badge tone={TONE[l.status]}>{l.status}</Badge>{l.adminNote && <span className="block text-[10px] text-slate-400 mt-0.5">{l.adminNote}</span>}</td>
                  <td className="px-4 py-3 text-right">{(l.status === "Pending" || (l.status === "Approved" && l.fromDate > today)) && <button onClick={() => cancel(l)} className="text-[11px] font-semibold text-red-500 hover:underline">Cancel</button>}</td>
                </tr>
              ))}
            </Table>
          ) : (
            <Card><Empty icon={<CalendarOff size={20} />} title="No leave requests yet" hint="Your requests and their approval status appear here." action={<Button onClick={() => setApply(true)}>Apply for leave</Button>} /></Card>
          )}
        </div>

        <Card>
          <p className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2"><PartyPopper size={15} /> Upcoming holidays</p>
          {upcoming.length ? (
            <ul className="space-y-2">
              {upcoming.map((h) => (
                <li key={h._id} className="flex items-center justify-between gap-2 rounded-xl bg-indigo-50/60 px-3 py-2">
                  <span className="text-xs font-semibold text-slate-700 truncate">{h.name}{h.branchId?.name && <span className="text-slate-400 font-normal"> · {h.branchId.name}</span>}</span>
                  <span className="text-[11px] font-bold text-indigo-600 shrink-0">{fmtDay(h.date, { day: "2-digit", month: "short" })}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-xs text-slate-400">No upcoming holidays.</p>}
        </Card>
      </div>

      <ApplyModal open={apply} onClose={() => setApply(false)} onDone={refresh} />
    </div>
  );
}

export default function MyLeaves() {
  return <Themed role="user"><Body /></Themed>;
}