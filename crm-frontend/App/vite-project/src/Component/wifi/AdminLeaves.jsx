// Admin "Leaves" tab: approve leave requests, manage holidays.
import React, { useEffect, useState } from "react";
import { CalendarOff, Check, PartyPopper, Plus, Trash2, X } from "lucide-react";
import { subscribe } from "../../lib/socket";
import { useAsync } from "../../lib/hooks";
import { fmtDay, istDateKey, timeAgo, weekdayShort } from "../../lib/format";
import { Badge, Button, Card, Empty, ErrorNote, Field, Modal, PageHeader, Select, Spinner, Table, Tabs, TextArea, TextInput, Themed, useApi, useConfirm, useToast } from "./ui";

const TONE = { Pending: "amber", Approved: "green", Rejected: "red", Cancelled: "slate" };

function DecideModal({ item, decision, onClose, onDone }) {
  const api = useApi();
  const toast = useToast();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      await api.patch(`/api/leaves/${item._id}/decide`, { decision, note });
      toast(decision === "Approved" ? "Leave approved" : "Leave rejected");
      onDone();
      onClose();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} size="sm" title={`${decision === "Approved" ? "Approve" : "Reject"} leave`} subtitle={`${item.userName} · ${item.type}`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant={decision === "Approved" ? "success" : "danger"} loading={busy} onClick={go}>{decision === "Approved" ? "Approve" : "Reject"}</Button></>}>
      <p className="text-xs text-slate-600 mb-3">{fmtDay(item.fromDate)}{item.fromDate !== item.toDate && ` – ${fmtDay(item.toDate)}`} · {item.days} working day{item.days === 1 ? "" : "s"}{item.halfDay ? " (half day)" : ""}. “{item.reason}”</p>
      <Field label="Note to the employee (optional)"><TextArea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} /></Field>
    </Modal>
  );
}

function Requests({ onPending }) {
  const api = useApi();
  const [status, setStatus] = useState("Pending");
  const [action, setAction] = useState(null);
  const list = useAsync(() => api.get("/api/leaves", { status: status === "All" ? "" : status }), [status]);
  const items = list.data?.leaves || [];
  const pendingProbe = useAsync(() => api.get("/api/leaves", { status: "Pending" }), []);
  const pendingCount = pendingProbe.data?.leaves.length || 0;
  useEffect(() => { onPending?.(pendingCount); }, [pendingCount]); // eslint-disable-line react-hooks/exhaustive-deps
  const done = () => { list.reload({ silent: true }); pendingProbe.reload({ silent: true }); };

  useEffect(() => subscribe("admin", "notification", (n) => n.category === "leave" && done()), []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-5">
      <Tabs value={status} onChange={setStatus} tabs={[{ id: "Pending", label: "Pending", count: pendingCount }, { id: "Approved", label: "Approved" }, { id: "Rejected", label: "Rejected" }, { id: "All", label: "All" }]} />
      <ErrorNote message={list.error} onRetry={list.reload} />
      {list.loading && !list.data ? <Spinner /> : items.length === 0 ? (
        <Card><Empty icon={<CalendarOff size={20} />} title={`No ${status === "All" ? "" : status.toLowerCase() + " "}leave requests`} /></Card>
      ) : (
        <Table head={["Employee", "Type", "Dates", "Days", "Reason", "Status", ""]}>
          {items.map((l) => (
            <tr key={l._id}>
              <td className="px-4 py-3 font-bold text-slate-800 whitespace-nowrap">{l.userName}<span className="block text-[10px] text-slate-400 font-normal">{timeAgo(l.createdAt)}</span></td>
              <td className="px-4 py-3 whitespace-nowrap">{l.type}{l.halfDay && <span className="text-slate-400"> (half)</span>}</td>
              <td className="px-4 py-3 whitespace-nowrap">{fmtDay(l.fromDate)}{l.fromDate !== l.toDate && ` – ${fmtDay(l.toDate)}`}</td>
              <td className="px-4 py-3">{l.days}</td>
              <td className="px-4 py-3 text-slate-600 max-w-[18rem]"><span className="line-clamp-2" title={l.reason}>{l.reason}</span></td>
              <td className="px-4 py-3"><Badge tone={TONE[l.status]}>{l.status}</Badge>{l.decidedBy && <span className="block text-[10px] text-slate-400 mt-0.5">by {l.decidedBy}</span>}</td>
              <td className="px-4 py-3 text-right whitespace-nowrap">
                {l.status === "Pending" && (
                  <span className="inline-flex gap-2">
                    <Button size="sm" variant="softSuccess" onClick={() => setAction({ item: l, decision: "Approved" })}><Check size={12} /> Approve</Button>
                    <Button size="sm" variant="softDanger" onClick={() => setAction({ item: l, decision: "Rejected" })}><X size={12} /> Reject</Button>
                  </span>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
      {action && <DecideModal item={action.item} decision={action.decision} onClose={() => setAction(null)} onDone={done} />}
    </div>
  );
}

function Holidays() {
  const api = useApi();
  const toast = useToast();
  const [confirm, ask] = useConfirm();
  const [year, setYear] = useState(istDateKey().slice(0, 4));
  const [f, setF] = useState({ date: "", name: "", branchId: "" });
  const [busy, setBusy] = useState(false);
  const list = useAsync(() => api.get("/api/holidays", { year }), [year]);
  const branches = useAsync(() => api.get("/api/branches"), []);
  const items = list.data?.holidays || [];
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const today = istDateKey();

  const add = async () => {
    setBusy(true);
    try {
      await api.post("/api/holidays", { ...f, branchId: f.branchId || undefined });
      toast("Holiday added - staff have been notified");
      setF({ date: "", name: "", branchId: "" });
      list.reload({ silent: true });
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };
  const remove = (h) => ask({
    title: `Remove “${h.name}”?`, message: `${fmtDay(h.date)} will count as a normal working day again.`, confirmLabel: "Remove",
    onYes: async () => { try { await api.del(`/api/holidays/${h._id}`); toast("Holiday removed"); list.reload({ silent: true }); } catch (e) { toast(e.message, "error"); } },
  });

  const y = Number(istDateKey().slice(0, 4));
  return (
    <div className="space-y-5">
      {confirm}
      <Card>
        <p className="text-sm font-bold text-slate-800 mb-3">Add a holiday</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <Field label="Date"><TextInput type="date" value={f.date} onChange={set("date")} /></Field>
          <Field label="Name"><TextInput value={f.name} onChange={set("name")} placeholder="Diwali" /></Field>
          <Field label="Applies to"><Select value={f.branchId} onChange={set("branchId")}><option value="">All branches</option>{(branches.data?.branches || []).map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}</Select></Field>
          <Button onClick={add} loading={busy} disabled={!f.date || !f.name.trim()}><Plus size={13} /> Add holiday</Button>
        </div>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-slate-800 flex items-center gap-2"><PartyPopper size={15} /> Holidays</p>
        <Select value={year} onChange={(e) => setYear(e.target.value)} className="!w-auto">{[y - 1, y, y + 1].map((v) => <option key={v}>{v}</option>)}</Select>
      </div>
      <ErrorNote message={list.error} onRetry={list.reload} />
      {list.loading && !list.data ? <Spinner /> : items.length === 0 ? (
        <Card><Empty icon={<PartyPopper size={20} />} title={`No holidays in ${year}`} hint="Holidays are never counted as absences, and leave days on them are not deducted." /></Card>
      ) : (
        <Table head={["Date", "Day", "Holiday", "Applies to", ""]}>
          {items.map((h) => (
            <tr key={h._id} className={h.date < today ? "opacity-50" : ""}>
              <td className="px-4 py-3 font-bold text-slate-800 whitespace-nowrap">{fmtDay(h.date)}</td>
              <td className="px-4 py-3 text-slate-500">{weekdayShort(h.date)}</td>
              <td className="px-4 py-3">{h.name}</td>
              <td className="px-4 py-3 text-slate-500">{h.branchId?.name || "All branches"}</td>
              <td className="px-4 py-3 text-right"><button onClick={() => remove(h)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50" aria-label="Remove"><Trash2 size={13} /></button></td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

function Body() {
  const [tab, setTab] = useState("requests");
  const [pending, setPending] = useState(0);
  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5">
      <PageHeader icon={<CalendarOff size={20} />} title="Leaves & holidays" subtitle="Approve leave requests and set the holiday calendar." />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "requests", label: "Leave requests", count: pending }, { id: "holidays", label: "Holidays" }]} />
      {tab === "requests" ? <Requests onPending={setPending} /> : <Holidays />}
    </div>
  );
}

export default function AdminLeaves() {
  return <Themed role="admin"><Body /></Themed>;
}

