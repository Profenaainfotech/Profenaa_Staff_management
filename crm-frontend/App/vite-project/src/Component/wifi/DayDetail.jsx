// One employee, one day: sessions, full audit trail, and the manual correction form.
import React, { useEffect, useState } from "react";
import { History, MessageSquareWarning, Pencil, Save } from "lucide-react";
import { useAsync } from "../../lib/hooks";
import { fmtDay, fmtMinutes, fmtTime, hhmmIST } from "../../lib/format";
import { END_REASON, eventInfo } from "./events";
import { SignInList } from "./LoginActivity";
import { Badge, Button, ErrorNote, Field, Modal, Spinner, TextArea, TextInput, useApi, useToast } from "./ui";

export default function DayDetail({ target, onClose, onChanged }) {
  // target = { userId, name, date } | null
  const api = useApi();
  const toast = useToast();
  const open = Boolean(target);
  const { data, error, loading, reload } = useAsync(
    () => (target ? api.get("/api/attendance/admin/detail", { userId: target.userId, date: target.date }) : Promise.resolve(null)),
    [target?.userId, target?.date]
  );
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ checkIn: "09:30", checkOut: "18:30", note: "" });
  const [busy, setBusy] = useState(false);
  const [rnote, setRnote] = useState("");

  useEffect(() => { setEdit(false); setRnote(""); }, [target?.userId, target?.date]);
  const att = data?.attendance;

  const startEdit = () => {
    setF({ checkIn: hhmmIST(att?.checkIn) || "09:30", checkOut: hhmmIST(att?.checkOut) || "18:30", note: "" });
    setEdit(true);
  };

  const save = async () => {
    setBusy(true);
    try {
      await api.put("/api/attendance/admin/manual", { userId: target.userId, date: target.date, ...f });
      toast("Attendance updated");
      setEdit(false);
      reload({ silent: true });
      onChanged?.();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const decide = async (decision) => {
    setBusy(true);
    try {
      await api.patch("/api/attendance/admin/review", { userId: target.userId, date: target.date, decision, note: rnote });
      toast(decision === "APPROVE" ? "Marked Present" : "Kept as a half day");
      setRnote("");
      reload({ silent: true });
      onChanged?.();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };
  const rv = att?.review;
  const dayOff = att && att.dayType && att.dayType !== "WORKING";

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={target ? `${target.name}` : ""}
      subtitle={target ? fmtDay(target.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : ""}
    >
      {loading && !data ? <Spinner /> : error ? <ErrorNote message={error} onRetry={reload} /> : (
        <div className="space-y-5">
          {att ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  ["Status", att.status],
                  ["Worked", fmtMinutes(att.totalMinutes)],
                  ["Late by", att.lateMinutes ? fmtMinutes(att.lateMinutes) : "--"],
                  dayOff
                    ? ["Day-off work", `${fmtMinutes(att.offDayMinutes || att.totalMinutes)} (${att.dayType === "HOLIDAY" ? "holiday" : "weekly off"})`]
                    : ["Overtime / early", `${att.overtimeMinutes ? `+${fmtMinutes(att.overtimeMinutes)}` : "--"} / ${att.earlyLogoutMinutes ? `-${fmtMinutes(att.earlyLogoutMinutes)}` : "--"}`],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-xl bg-slate-50 px-3 py-2.5">
                    <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">{k}</p>
                    <p className="text-xs font-bold text-slate-800 mt-0.5">{v}</p>
                  </div>
                ))}
              </div>

              {dayOff && <p className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-800">This was a day off. All time worked is counted as extra work and is never late, overtime or absent.</p>}
              {att.overtime?.state === "CONFIRMED" && <p className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-800">The employee confirmed they were still working after shift end.</p>}

              {rv && ["PENDING_EXPLANATION", "EXPLAINED", "APPROVED", "REJECTED"].includes(rv.state) && (
                <div className={`rounded-2xl border p-4 ${["PENDING_EXPLANATION", "EXPLAINED"].includes(rv.state) ? "border-amber-300 bg-amber-50/60" : "border-slate-100 bg-slate-50/60"}`}>
                  <p className="text-xs font-bold text-slate-800 flex items-center gap-2"><MessageSquareWarning size={14} className="text-amber-600" /> No reply to “Are you still working?” at shift end
                    <Badge tone={{ PENDING_EXPLANATION: "red", EXPLAINED: "amber", APPROVED: "green", REJECTED: "slate" }[rv.state]}>{{ PENDING_EXPLANATION: "Waiting for explanation", EXPLAINED: "Explained", APPROVED: "Approved - Present", REJECTED: "Stays a half day" }[rv.state]}</Badge>
                  </p>
                  {rv.explanation && <p className="text-xs text-slate-700 mt-2">“{rv.explanation}”</p>}
                  {rv.decidedBy && <p className="text-[11px] text-slate-500 mt-2">{rv.decidedBy}{rv.note ? `: ${rv.note}` : ""}</p>}
                  {["PENDING_EXPLANATION", "EXPLAINED"].includes(rv.state) && (
                    <>
                      <Field label="Note to the employee (optional)" className="mt-3"><TextInput value={rnote} onChange={(e) => setRnote(e.target.value)} maxLength={300} /></Field>
                      <div className="flex justify-end gap-2 mt-3">
                        <Button size="sm" variant="softDanger" onClick={() => decide("REJECT")} loading={busy}>Keep half day</Button>
                        <Button size="sm" variant="success" onClick={() => decide("APPROVE")} loading={busy}>Make Present</Button>
                      </div>
                    </>
                  )}
                </div>
              )}

              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Sessions ({att.sessions?.length || 0}) · source {att.attendanceSource}</p>
                <ol className="space-y-1.5">
                  {(att.sessions || []).map((s, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-slate-100 px-3 py-2 text-xs">
                      <span className="font-bold text-slate-800">{fmtTime(s.checkIn)} – {s.checkOut ? fmtTime(s.checkOut) : "open"}</span>
                      <span className="text-slate-500">{s.checkOut ? END_REASON[s.endReason] || s.endReason : "In progress"}</span>
                      {s.ssid && <span className="text-slate-400">{s.ssid}</span>}
                    </li>
                  ))}
                </ol>
                {att.correctionReason && <p className="text-[11px] text-slate-500 mt-2">Reason on record: {att.correctionReason}</p>}
              </div>
            </>
          ) : (
            <p className="text-xs text-slate-500">No attendance was recorded for this day.</p>
          )}

          {edit ? (
            <div className="rounded-2xl border border-violet-200 bg-violet-50/40 p-4">
              <p className="text-xs font-bold text-violet-800 mb-3">Set times manually (replaces the recorded sessions)</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Check-in"><TextInput type="time" value={f.checkIn} onChange={(e) => setF({ ...f, checkIn: e.target.value })} /></Field>
                <Field label="Check-out"><TextInput type="time" value={f.checkOut} onChange={(e) => setF({ ...f, checkOut: e.target.value })} /></Field>
              </div>
              <Field label="Reason (required, kept in the audit trail)" className="mt-3"><TextArea value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={300} /></Field>
              <div className="flex justify-end gap-2 mt-3">
                <Button variant="ghost" size="sm" onClick={() => setEdit(false)}>Cancel</Button>
                <Button size="sm" onClick={save} loading={busy} disabled={!f.note.trim()}><Save size={13} /> Save</Button>
              </div>
            </div>
          ) : (
            <Button variant="ghost" size="sm" onClick={startEdit}><Pencil size={13} /> {att ? "Correct times" : "Add attendance"}</Button>
          )}

          {att?.edits?.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5"><History size={12} /> Edit history</p>
              <ul className="space-y-1.5">
                {att.edits.map((e, i) => (
                  <li key={i} className="text-[11px] text-slate-600 rounded-lg bg-slate-50 px-3 py-2">
                    <b>{e.by}</b> · {new Date(e.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} — {e.note || "no note"}
                    {e.before && <span className="text-slate-400"> (was {fmtTime(e.before.checkIn)}–{fmtTime(e.before.checkOut)})</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data?.logins?.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Signed in from</p>
              <SignInList logins={data.logins} />
            </div>
          )}

          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Activity timeline</p>
            {data?.events?.length ? (
              <ol className="relative border-l-2 border-slate-100 ml-2 space-y-3">
                {data.events.map((e) => {
                  const info = eventInfo(e.type);
                  return (
                    <li key={e._id} className="pl-4 relative">
                      <span className="absolute -left-[5px] top-1.5 w-2 h-2 rounded-full bg-slate-300" />
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-bold text-slate-700 tabular-nums">{fmtTime(e.occurredAt)}</span>
                        <Badge tone={info.tone}>{info.label}</Badge>
                        {e.ssid && <span className="text-[10px] text-slate-400">{e.ssid}{e.bssid ? ` · ${e.bssid}` : ""}</span>}
                      </div>
                      {e.message && <p className="text-[11px] text-slate-500 mt-0.5">{e.message}</p>}
                    </li>
                  );
                })}
              </ol>
            ) : <p className="text-xs text-slate-400">No events.</p>}
          </div>
        </div>
      )}
    </Modal>
  );
}
