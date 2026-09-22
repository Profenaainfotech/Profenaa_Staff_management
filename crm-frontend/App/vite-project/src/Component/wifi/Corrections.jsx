// Admin: approve / reject employees' attendance-correction requests, or enter times manually.
import React, { useState } from "react";
import { Check, ClipboardEdit, PenLine, X } from "lucide-react";
import { useAsync } from "../../lib/hooks";
import { fmtDay, fmtTime, istDateKey, timeAgo } from "../../lib/format";
import { Badge, Button, Card, Empty, ErrorNote, Field, Modal, PageHeader, Select, Spinner, Table, Tabs, TextArea, TextInput, useApi, useToast } from "./ui";
import { fmtMinutes } from "../../lib/format";

const TONE = { Pending: "amber", Approved: "green", Rejected: "red", Cancelled: "slate" };

function DecideModal({ item, decision, onClose, onDone }) {
  const api = useApi();
  const toast = useToast();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  if (!item) return null;
  const go = async () => {
    setBusy(true);
    try {
      await api.patch(`/api/regularizations/${item._id}/decide`, { decision, note });
      toast(decision === "Approved" ? "Approved - attendance updated" : "Request rejected");
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
      open
      onClose={onClose}
      size="sm"
      title={`${decision === "Approved" ? "Approve" : "Reject"} correction`}
      subtitle={`${item.userName} · ${fmtDay(item.date)}`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant={decision === "Approved" ? "success" : "danger"} loading={busy} onClick={go}>{decision === "Approved" ? "Approve" : "Reject"}</Button></>}
    >
      <p className="text-xs text-slate-600 mb-3">
        Requested <b>{fmtTime(item.requestedCheckIn)} – {fmtTime(item.requestedCheckOut)}</b>. “{item.reason}”
      </p>
      {decision === "Approved" && <p className="text-[11px] text-violet-700 bg-violet-50 rounded-lg px-3 py-2 mb-3">Approving replaces that day's recorded sessions with these times.</p>}
      <Field label="Note to the employee (optional)"><TextArea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} /></Field>
    </Modal>
  );
}

// ---- shift-end replies: no answer to "Are you still working?" -> half day until explained and approved
function ReviewModal({ item, decision, onClose, onDone }) {
  const api = useApi();
  const toast = useToast();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  if (!item) return null;
  const approve = decision === "APPROVE";
  const go = async () => {
    setBusy(true);
    try {
      await api.patch("/api/attendance/admin/review", { userId: item.userId, date: item.date, decision, note });
      toast(approve ? "Marked Present" : "Kept as a half day");
      onDone();
      onClose();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} size="sm" title={approve ? "Make this day Present" : "Keep as a half day"} subtitle={`${item.userName} · ${fmtDay(item.date)}`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant={approve ? "success" : "danger"} loading={busy} onClick={go}>{approve ? "Make Present" : "Keep half day"}</Button></>}>
      <p className="text-xs text-slate-600 mb-3">
        {item.review.explanation ? <>Explanation: “{item.review.explanation}”</> : "The employee has not explained yet. You can still decide."}
      </p>
      <Field label="Note to the employee (optional)"><TextArea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} /></Field>
    </Modal>
  );
}

function ShiftEndReplies({ onChanged }) {
  const api = useApi();
  const [action, setAction] = useState(null);
  const list = useAsync(() => api.get("/api/attendance/admin/reviews"), []);
  const items = list.data?.reviews || [];
  if (!items.length) return null;
  const done = () => { list.reload({ silent: true }); onChanged?.(); };
  return (
    <Card padded={false} className="border-2 border-amber-200">
      <div className="px-5 pt-4 pb-3">
        <p className="text-sm font-bold text-slate-800">Shift-end replies waiting for you ({items.length})</p>
        <p className="text-[11px] text-slate-500 mt-0.5">These people did not answer “Are you still working?”, so the day is a half day. Approve to make it Present.</p>
      </div>
      <Table head={["Employee", "Date", "Worked", "Explanation", ""]}>
        {items.map((r) => (
          <tr key={r.attendanceId}>
            <td className="px-4 py-3 font-bold text-slate-800 whitespace-nowrap">{r.userName}</td>
            <td className="px-4 py-3 whitespace-nowrap">{fmtDay(r.date)}</td>
            <td className="px-4 py-3 whitespace-nowrap">{fmtMinutes(r.totalMinutes)}</td>
            <td className="px-4 py-3 text-slate-600 max-w-[22rem]">
              {r.review.state === "EXPLAINED" ? <span className="line-clamp-2" title={r.review.explanation}>{r.review.explanation}</span> : <Badge tone="red">Not explained yet</Badge>}
            </td>
            <td className="px-4 py-3 text-right whitespace-nowrap">
              <span className="inline-flex gap-2">
                <Button size="sm" variant="softSuccess" onClick={() => setAction({ item: r, decision: "APPROVE" })}><Check size={12} /> Make Present</Button>
                <Button size="sm" variant="softDanger" onClick={() => setAction({ item: r, decision: "REJECT" })}><X size={12} /> Keep half day</Button>
              </span>
            </td>
          </tr>
        ))}
      </Table>
      <ReviewModal item={action?.item} decision={action?.decision} onClose={() => setAction(null)} onDone={done} />
    </Card>
  );
}

function ManualModal({ open, onClose, onDone }) {
  const api = useApi();
  const toast = useToast();
  const staff = useAsync(() => (open ? api.get("/api/staff", { status: "active" }) : Promise.resolve(null)), [open]);
  const [f, setF] = useState({ userId: "", date: istDateKey(), checkIn: "09:30", checkOut: "18:30", note: "" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const go = async () => {
    setBusy(true);
    try {
      await api.put("/api/attendance/admin/manual", f);
      toast("Attendance recorded");
      onDone();
      onClose();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Enter attendance manually" subtitle="Use when an employee worked but nothing was recorded (e.g. office network outage)."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={go} loading={busy} disabled={!f.userId || !f.note.trim()}>Save</Button></>}>
      <div className="space-y-4">
        <Field label="Employee">
          <Select value={f.userId} onChange={set("userId")}>
            <option value="">Choose...</option>
            {(staff.data?.staff || []).map((s) => <option key={s.userId} value={s.userId}>{s.name}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Date"><TextInput type="date" value={f.date} max={istDateKey()} onChange={set("date")} /></Field>
          <Field label="Check-in"><TextInput type="time" value={f.checkIn} onChange={set("checkIn")} /></Field>
          <Field label="Check-out"><TextInput type="time" value={f.checkOut} onChange={set("checkOut")} /></Field>
        </div>
        <Field label="Reason (kept in the audit trail)"><TextArea value={f.note} onChange={set("note")} maxLength={300} /></Field>
      </div>
    </Modal>
  );
}

export default function Corrections({ onPendingChanged }) {
  const api = useApi();
  const [status, setStatus] = useState("Pending");
  const [action, setAction] = useState(null); // { item, decision }
  const [manual, setManual] = useState(false);
  const list = useAsync(() => api.get("/api/regularizations", { status }), [status]);
  const items = list.data?.regularizations || [];
  const done = () => { list.reload({ silent: true }); onPendingChanged?.(); };

  return (
    <div className="space-y-5">
      <PageHeader icon={<ClipboardEdit size={20} />} title="Attendance corrections" subtitle="Requests from staff whose time was not recorded correctly."
        actions={<Button onClick={() => setManual(true)}><PenLine size={13} /> Enter manually</Button>} />
      <ShiftEndReplies onChanged={onPendingChanged} />
      <Tabs value={status} onChange={setStatus} tabs={[{ id: "Pending", label: "Pending" }, { id: "Approved", label: "Approved" }, { id: "Rejected", label: "Rejected" }]} />
      <ErrorNote message={list.error} onRetry={list.reload} />
      {list.loading && !list.data ? <Spinner /> : items.length === 0 ? (
        <Card><Empty icon={<ClipboardEdit size={20} />} title={`No ${status.toLowerCase()} requests`} /></Card>
      ) : (
        <Table head={["Employee", "Date", "Requested", "Reason", "Sent", status === "Pending" ? "" : "Decision"]}>
          {items.map((r) => (
            <tr key={r._id}>
              <td className="px-4 py-3 font-bold text-slate-800 whitespace-nowrap">{r.userName}</td>
              <td className="px-4 py-3 whitespace-nowrap">{fmtDay(r.date)}</td>
              <td className="px-4 py-3 whitespace-nowrap tabular-nums">{fmtTime(r.requestedCheckIn)} – {fmtTime(r.requestedCheckOut)}</td>
              <td className="px-4 py-3 text-slate-600 max-w-[20rem]"><span className="line-clamp-2" title={r.reason}>{r.reason}</span></td>
              <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{timeAgo(r.createdAt)}</td>
              <td className="px-4 py-3 text-right whitespace-nowrap">
                {r.status === "Pending" ? (
                  <span className="inline-flex gap-2">
                    <Button size="sm" variant="softSuccess" onClick={() => setAction({ item: r, decision: "Approved" })}><Check size={12} /> Approve</Button>
                    <Button size="sm" variant="softDanger" onClick={() => setAction({ item: r, decision: "Rejected" })}><X size={12} /> Reject</Button>
                  </span>
                ) : (
                  <span><Badge tone={TONE[r.status]}>{r.status}</Badge>{r.decidedBy && <span className="block text-[10px] text-slate-400 mt-0.5">by {r.decidedBy}</span>}</span>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
      <DecideModal item={action?.item} decision={action?.decision} onClose={() => setAction(null)} onDone={done} />
      <ManualModal open={manual} onClose={() => setManual(false)} onDone={done} />
    </div>
  );
}
