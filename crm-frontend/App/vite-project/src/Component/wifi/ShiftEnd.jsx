// Employee side of the shift-end flow.
//   ShiftEndBanner  "Are you still working?" - the same question as the Windows pop-up, answerable here too
//   OvertimeNote    overtime is being recorded / today is a day off
//   ExplainCard     no reply at shift end -> the day is a half day until you explain and an admin approves
import React, { useState } from "react";
import { BadgeCheck, Clock3, Flame, MessageSquareWarning, Send, Sun, ThumbsDown, ThumbsUp } from "lucide-react";
import { useAsync, useTick } from "../../lib/hooks";
import { fmtDay, fmtMinutes, fmtTime } from "../../lib/format";
import { Badge, Button, Card, Field, TextArea, useApi, useToast } from "./ui";

export function ShiftEndBanner({ prompt, fetchedAt, onChanged }) {
  const api = useApi();
  const toast = useToast();
  const [busy, setBusy] = useState("");
  useTick(1000);
  if (!prompt) return null;

  const left = Math.max(0, Math.round((prompt.secondsLeft ?? 0) - (Date.now() - fetchedAt) / 1000));
  const mm = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;

  const answer = async (a) => {
    setBusy(a);
    try {
      await api.post("/api/attendance/my/overtime", { answer: a });
      toast(a === "YES" ? "Thanks - your extra time is recorded as overtime" : "Thanks - your attendance ended at shift end");
      onChanged?.();
    } catch (e) {
      toast(e.message, "error");
      onChanged?.();
    } finally {
      setBusy("");
    }
  };

  return (
    <div role="alert" className="rounded-3xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50 p-5 shadow-md">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0"><Clock3 size={24} /></div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-black text-slate-900">Your shift has ended{prompt.shiftEnd ? ` (${prompt.shiftEnd})` : ""}. Are you still working?</p>
          <p className="text-xs text-slate-600 mt-1">
            <b>Yes</b> = the time from now is recorded as overtime. <b>No</b> = you are finished for the day.
            {left > 0 ? " If you do not answer, your attendance ends at shift end and the day is marked as a half day until you explain." : " The time to answer has passed."}
          </p>
        </div>
        <div className="flex sm:flex-col items-center gap-2 shrink-0">
          {left > 0 && <span className="rounded-full bg-white border border-amber-200 px-3 py-1 text-xs font-black text-amber-700 tabular-nums">{mm} left</span>}
          <div className="flex gap-2">
            <Button variant="success" onClick={() => answer("YES")} loading={busy === "YES"} disabled={left === 0 || Boolean(busy)}><ThumbsUp size={14} /> Yes, still working</Button>
            <Button variant="ghost" onClick={() => answer("NO")} loading={busy === "NO"} disabled={left === 0 || Boolean(busy)}><ThumbsDown size={14} /> No, finished</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function OvertimeNote({ live }) {
  const att = live?.attendance;
  const off = att && att.dayType && att.dayType !== "WORKING";
  const running = live?.live?.overtimeState === "CONFIRMED";
  if (!off && !running && !(att?.overtimeMinutes > 0)) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {off && (
        <div className="flex items-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-xs text-violet-800">
          <Sun size={15} /> Today is a day off. Everything you work today is recorded as <b>extra (Sunday) work</b>: {fmtMinutes(att.offDayMinutes)} so far.
        </div>
      )}
      {!off && (running || att?.overtimeMinutes > 0) && (
        <div className="flex items-center gap-2 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-2.5 text-xs text-orange-800">
          <Flame size={15} /> {running ? "Overtime is being recorded" : "Overtime today"}: <b>{fmtMinutes(att?.overtimeMinutes || 0)}</b>. You will be asked again about every hour.
        </div>
      )}
    </div>
  );
}

const STATE = {
  PENDING_EXPLANATION: { label: "Explanation needed", tone: "red" },
  EXPLAINED: { label: "Waiting for admin", tone: "amber" },
  APPROVED: { label: "Approved - Present", tone: "green" },
  REJECTED: { label: "Stays a half day", tone: "slate" },
};

function ExplainRow({ item, onDone }) {
  const api = useApi();
  const toast = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const r = item.review;
  const st = STATE[r.state] || STATE.EXPLAINED;

  const send = async () => {
    setBusy(true);
    try {
      await api.post("/api/attendance/my/explain", { date: item.date, text });
      toast("Your explanation was sent to the administrator");
      setText("");
      onDone();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={`rounded-2xl border p-4 ${r.state === "PENDING_EXPLANATION" ? "border-red-200 bg-red-50/40" : "border-slate-100"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-black text-slate-800">{fmtDay(item.date, { weekday: "short", day: "2-digit", month: "short" })}</span>
        <Badge tone={st.tone}>{st.label}</Badge>
        <span className="text-[10px] text-slate-400 ml-auto">{fmtMinutes(item.totalMinutes)} worked · ended {fmtTime(item.checkOut)}</span>
      </div>

      {r.state === "PENDING_EXPLANATION" && (
        <>
          <p className="text-xs text-slate-600 mt-2">You did not answer <b>“Are you still working?”</b> at shift end, so this day is a <b>half day</b>. Tell your administrator what happened. If they accept it, the day becomes Present.</p>
          <Field label="What happened?" className="mt-3">
            <TextArea value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} rows={3} placeholder="For example: I was in a client call at my desk and missed the pop-up." />
          </Field>
          <div className="flex items-center justify-between mt-2">
            <span className="text-[10px] text-slate-400">{text.trim().length < 10 ? "Write at least a full sentence." : `${text.length}/1000`}</span>
            <Button size="sm" onClick={send} loading={busy} disabled={text.trim().length < 10}><Send size={13} /> Send explanation</Button>
          </div>
        </>
      )}
      {r.state === "EXPLAINED" && <p className="text-xs text-slate-600 mt-2">You wrote: “{r.explanation}”. An administrator will decide soon.</p>}
      {r.state === "APPROVED" && <p className="text-xs text-emerald-700 mt-2 flex items-center gap-1.5"><BadgeCheck size={14} /> {r.decidedBy} marked this day Present{r.note ? `: ${r.note}` : "."}</p>}
      {r.state === "REJECTED" && <p className="text-xs text-slate-600 mt-2">{r.decidedBy} kept this day as a half day{r.note ? `: ${r.note}` : "."}</p>}
    </li>
  );
}

export function ExplainCard({ refreshKey = 0, onChanged }) {
  const api = useApi();
  const list = useAsync(() => api.get("/api/attendance/my/reviews"), [refreshKey]);
  const items = list.data?.reviews || [];
  if (!items.length) return null;
  const urgent = items.some((i) => i.review.state === "PENDING_EXPLANATION");
  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <MessageSquareWarning size={16} className={urgent ? "text-red-500" : "text-slate-400"} />
        <p className="text-sm font-bold text-slate-800">Shift-end replies</p>
      </div>
      <ul className="space-y-3">
        {items.map((i) => <ExplainRow key={i.date} item={i} onDone={() => { list.reload({ silent: true }); onChanged?.(); }} />)}
      </ul>
    </Card>
  );
}
