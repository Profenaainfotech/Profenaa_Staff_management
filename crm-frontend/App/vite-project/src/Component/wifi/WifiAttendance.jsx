// Employee screen for Wi-Fi attendance (shown when the employee's mode is WIFI).
import React, { useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, Laptop, LogOut, MapPin, MonitorSmartphone, PlugZap, Send, Trash2, Wifi, WifiOff } from "lucide-react";
import { useAsync, useLiveRefresh, useTick } from "../../lib/hooks";
import { addDaysKey, fmtDay, fmtMinutes, fmtTime, hhmmIST, istDateKey, timeAgo } from "../../lib/format";
import MonthCalendar from "./MonthCalendar";
import { SignInList } from "./LoginActivity";
import { ExplainCard, OvertimeNote, ShiftEndBanner } from "./ShiftEnd";
import { Badge, Button, Card, Empty, ErrorNote, Field, Modal, Spinner, StatusBadge, Table, TextArea, TextInput, Themed, useApi, useConfirm, useToast } from "./ui";

const HERO = {
  PRESENT: { bg: "from-emerald-500 to-teal-500", Icon: Wifi, title: "You're in the office", sub: "Attendance is running." },
  WARNING: { bg: "from-amber-500 to-orange-500", Icon: WifiOff, title: "Office Wi-Fi not detected", sub: "" },
  LEFT: { bg: "from-sky-500 to-blue-600", Icon: PlugZap, title: "Attendance paused", sub: "It resumes automatically when you are back on the office Wi-Fi." },
  LOGGED_OUT: { bg: "from-slate-500 to-slate-600", Icon: LogOut, title: "You are logged out", sub: "Your attendance timer is stopped. Sign in to the CRM again on the office Wi-Fi to continue." },
  COMPLETED: { bg: "from-emerald-500 to-teal-500", Icon: CheckCircle2, title: "Day completed", sub: "" },
  HALF_DAY: { bg: "from-amber-500 to-orange-500", Icon: Clock, title: "Half day", sub: "" },
  NOT_YET_IN: { bg: "from-slate-500 to-slate-600", Icon: Clock, title: "Not detected yet today", sub: "Connect to the office Wi-Fi with the attendance agent running." },
  ABSENT: { bg: "from-red-500 to-rose-600", Icon: AlertTriangle, title: "No attendance recorded", sub: "" },
  HOLIDAY: { bg: "from-indigo-500 to-violet-600", Icon: CalendarClock, title: "Holiday", sub: "" },
  WEEKLY_OFF: { bg: "from-slate-500 to-slate-600", Icon: CalendarClock, title: "Weekly off", sub: "" },
  ON_LEAVE: { bg: "from-violet-500 to-purple-600", Icon: CalendarClock, title: "On leave today", sub: "" },
  WFH: { bg: "from-sky-500 to-blue-600", Icon: Laptop, title: "Work from home", sub: "" },
};

function Hero({ live, fetchedAt }) {
  useTick(1000);
  const code = live.display;
  const h = HERO[code] || HERO.NOT_YET_IN;
  const att = live.attendance;
  const L = live.live;
  const sinceFetch = (Date.now() - fetchedAt) / 1000;

  const worked = (L?.workedMinutes || 0) + (L?.state === "CONNECTED" ? sinceFetch / 60 : 0);
  const grace = L?.state === "WARNING" && L.graceRemainingSeconds != null ? Math.max(0, Math.round(L.graceRemainingSeconds - sinceFetch)) : null;
  const mm = grace != null ? `${Math.floor(grace / 60)}:${String(grace % 60).padStart(2, "0")}` : "";

  const sub =
    code === "WARNING"
      ? L.warningReason === "WIFI_CHANGED"
        ? "Your computer is on another network."
        : L.warningReason === "WIFI_DISCONNECTED"
        ? "Wi-Fi is disconnected."
        : "We lost contact with your computer."
      : code === "HOLIDAY" || code === "ON_LEAVE" || code === "WFH"
      ? live.dayKind?.label
      : h.sub;

  return (
    <div className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${h.bg} text-white p-5 sm:p-7 shadow-lg`}>
      <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-white/10" />
      <div className="absolute -right-2 bottom-[-3rem] w-36 h-36 rounded-full bg-white/10" />
      <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-5">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
            <h.Icon size={24} />
          </div>
          <div>
            <p className="text-lg sm:text-xl font-bold">{h.title}</p>
            {sub && <p className="text-xs sm:text-sm text-white/85 mt-1 max-w-md">{sub}</p>}
            {code === "WARNING" && grace != null && (
              <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1 text-xs font-bold">
                Reconnect to the office Wi-Fi within <span className="tabular-nums text-sm">{mm}</span>
              </p>
            )}
          </div>
        </div>
        {att && (
          <div className="sm:text-right">
            <p className="text-[10px] uppercase tracking-widest text-white/70 font-bold">Worked today</p>
            <p className="text-3xl sm:text-4xl font-black tabular-nums">{fmtMinutes(worked)}</p>
            <p className="text-[11px] text-white/80 mt-1">
              First in {fmtTime(att.checkIn)}
              {att.lateMinutes > 0 && ` · ${att.lateMinutes} min late`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function SetupCard({ notice }) {
  const steps = [
    "Get the attendance agent folder from your administrator and copy it to this computer.",
    "Install Node.js (LTS) if it is not installed.",
    "Double-click install-startup.bat and sign in with your CRM username and password when asked.",
    "On Windows 11, turn on Settings > Privacy & security > Location.",
    "Come back here: this page turns green as soon as the office Wi-Fi is detected.",
  ];
  return (
    <Card className="border-2 border-dashed">
      <div className="flex items-start gap-4">
        <div className="w-11 h-11 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0"><MonitorSmartphone size={22} /></div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900">
            {notice === "DEVICE_PENDING" ? "Waiting for administrator approval" : notice === "NO_BRANCH" ? "No branch assigned yet" : "Set up this computer for automatic attendance"}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {notice === "DEVICE_PENDING"
              ? "Your computer is registered. An administrator has to approve it before attendance starts."
              : notice === "NO_BRANCH"
              ? "Ask your administrator to assign you to a branch so we know which office Wi-Fi to look for."
              : "Your attendance is recorded automatically while your computer is on the office Wi-Fi."}
          </p>
          {notice === "NO_DEVICE" && (
            <ol className="mt-3 space-y-1.5">
              {steps.map((s, i) => (
                <li key={i} className="flex gap-2.5 text-xs text-slate-600">
                  <span className="w-5 h-5 rounded-full bg-sky-100 text-sky-700 text-[10px] font-black flex items-center justify-center shrink-0">{i + 1}</span>
                  {s}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </Card>
  );
}

function CorrectionModal({ open, onClose, date, onDone }) {
  const api = useApi();
  const toast = useToast();
  const [f, setF] = useState({ date: date || "", checkIn: "09:30", checkOut: "18:30", reason: "" });
  const [busy, setBusy] = useState(false);
  const today = istDateKey();
  const nowHHMM = () => hhmmIST(new Date().toISOString());
  // a check-out in the future is rejected by the server, so today's default is "now"
  const clampOut = (d, out) => (d === today && out > nowHHMM() ? nowHHMM() : out);
  React.useEffect(() => {
    if (open) {
      const d = date || today;
      setF((x) => ({ ...x, date: d, checkOut: clampOut(d, x.checkOut) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, date]);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const setDate = (e) => {
    const d = e.target.value;
    setF((x) => ({ ...x, date: d, checkOut: clampOut(d, x.checkOut) }));
  };

  const submit = async () => {
    setBusy(true);
    try {
      await api.post("/api/regularizations", f);
      toast("Correction request sent to your administrator");
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
      title="Request an attendance correction"
      subtitle="Use this if the Wi-Fi or the agent failed but you were working at the office."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={busy} disabled={!f.reason.trim() || !f.date}><Send size={13} /> Send request</Button></>}
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Date"><TextInput type="date" value={f.date} min={addDaysKey(today, -31)} max={today} onChange={setDate} /></Field>
        <Field label="Came in at"><TextInput type="time" value={f.checkIn} onChange={set("checkIn")} /></Field>
        <Field label="Left at"><TextInput type="time" value={f.checkOut} max={f.date === today ? nowHHMM() : undefined} onChange={set("checkOut")} /></Field>
      </div>
      <Field label="What happened?" className="mt-4" hint="Your administrator sees this. If approved, these times replace the recorded ones for that day.">
        <TextArea value={f.reason} onChange={set("reason")} maxLength={500} placeholder="Router was down from 10 to 12, I was at my desk." />
      </Field>
    </Modal>
  );
}

function DayDetail({ day, onCorrect }) {
  if (!day) return null;
  const canCorrect = day.date <= istDateKey() && day.date >= addDaysKey(istDateKey(), -31);
  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold text-slate-800">{fmtDay(day.date, { weekday: "long", day: "numeric", month: "long" })}</p>
          <StatusBadge code={day.display} label={day.label} />
        </div>
        {canCorrect && <Button size="sm" variant="ghost" onClick={() => onCorrect(day.date)}>Request correction</Button>}
      </div>
      {day.checkIn ? (
        <p className="text-xs text-slate-600 mt-2">
          {fmtTime(day.checkIn)} – {day.checkOut ? fmtTime(day.checkOut) : "still in"} · {fmtMinutes(day.totalMinutes)} worked
          {day.sessions > 1 && ` · ${day.sessions} sessions`}
          {day.lateMinutes > 0 && ` · ${day.lateMinutes} min late`}
          {day.source === "MANUAL" && " · corrected by admin"}
        </p>
      ) : (
        <p className="text-xs text-slate-400 mt-2">No time recorded.</p>
      )}
      {day.correctionReason && <p className="text-[11px] text-slate-500 mt-1">Note: {day.correctionReason}</p>}
    </div>
  );
}

function Body() {
  const api = useApi();
  const toast = useToast();
  const [confirm, ask] = useConfirm();
  const [month, setMonth] = useState(istDateKey().slice(0, 7));
  const [selected, setSelected] = useState(null);
  const [correction, setCorrection] = useState({ open: false, date: "" });

  const live = useAsync(() => api.get("/api/attendance/my/live"), []);
  const cal = useAsync(() => api.get("/api/attendance/my/month", { month }), [month]);
  const devices = useAsync(() => api.get("/api/devices/mine"), []);
  const regs = useAsync(() => api.get("/api/regularizations/mine"), []);
  const logins = useAsync(() => api.get("/api/attendance/my/logins", { limit: 6 }), []);
  const [reviewKey, setReviewKey] = useState(0);
  const [fetchedAt, setFetchedAt] = useState(Date.now());

  const reloadAll = (o) => { live.reload(o); cal.reload(o); setFetchedAt(Date.now()); };
  useLiveRefresh("user", (o) => { live.reload(o); cal.reload(o); devices.reload(o); logins.reload(o); setReviewKey((k) => k + 1); setFetchedAt(Date.now()); });

  const data = live.data;
  const days = useMemo(() => cal.data?.days || [], [cal.data]);
  const selectedDay = useMemo(() => days.find((d) => d.date === selected), [days, selected]);
  const summary = cal.data?.summary;
  const showSetup = data && ["NO_DEVICE", "DEVICE_PENDING", "NO_BRANCH"].includes(data.notice);

  if (live.loading && !data) return <Spinner />;
  if (live.error && !data) return <ErrorNote message={live.error} onRetry={live.reload} />;

  const removeDevice = (d) =>
    ask({
      title: "Remove this computer?",
      message: `${d.hostname || "This device"} will stop recording attendance until it is registered again.`,
      confirmLabel: "Remove",
      onYes: async () => {
        try { await api.del(`/api/devices/mine/${d._id}`); toast("Device removed"); devices.reload(); live.reload({ silent: true }); }
        catch (e) { toast(e.message, "error"); }
      },
    });

  const cancelReg = async (r) => {
    try { await api.patch(`/api/regularizations/${r._id}/cancel`); toast("Request cancelled"); regs.reload({ silent: true }); }
    catch (e) { toast(e.message, "error"); }
  };

  return (
    <div className="space-y-5">
      {confirm}
      <Hero live={data} fetchedAt={fetchedAt} />
      <ShiftEndBanner prompt={data.live?.prompt} fetchedAt={fetchedAt} onChanged={() => { reloadAll({ silent: true }); setReviewKey((k) => k + 1); }} />
      <OvertimeNote live={data} />
      <ExplainCard refreshKey={reviewKey} onChanged={() => reloadAll({ silent: true })} />
      {showSetup && <SetupCard notice={data.notice} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2">
          <p className="text-sm font-bold text-slate-800 mb-3">Today</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {[
              ["Shift", data.shift ? `${data.shift.start} – ${data.shift.end}` : "--"],
              ["Branch", data.branch?.name || "--"],
              ["Network", data.attendance?.ssid || data.device?.lastSsid || "--"],
              ["Late by", data.attendance?.dayType && data.attendance.dayType !== "WORKING" ? "Day off" : data.attendance?.lateMinutes ? fmtMinutes(data.attendance.lateMinutes) : "On time"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-slate-50 px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">{k}</p>
                <p className="text-xs font-bold text-slate-800 mt-0.5 truncate">{v}</p>
              </div>
            ))}
          </div>

          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Sessions</p>
          {data.attendance?.sessions?.length ? (
            <ol className="space-y-2">
              {data.attendance.sessions.map((s, i) => (
                <li key={i} className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2.5">
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${s.checkOut ? "bg-slate-300" : "bg-emerald-500 animate-pulse"}`} />
                  <span className="text-xs font-bold text-slate-800">{fmtTime(s.checkIn)} – {s.checkOut ? fmtTime(s.checkOut) : "now"}</span>
                  <span className="text-[11px] text-slate-500 truncate">{s.checkOut ? s.endLabel || "Ended" : "In progress"}</span>
                  <span className="ml-auto text-[11px] font-semibold text-slate-600 shrink-0">
                    {fmtMinutes(((s.checkOut ? new Date(s.checkOut) : new Date(s.lastPresentAt)) - new Date(s.checkIn)) / 60000)}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-xs text-slate-400">No sessions yet today.</p>
          )}
          <p className="text-[10px] text-slate-400 mt-3">Time only counts while your computer is on the office Wi-Fi. Short drops inside the grace period are forgiven.</p>
        </Card>

        <Card>
          <p className="text-sm font-bold text-slate-800 mb-3">My computers</p>
          {devices.data?.devices?.length ? (
            <ul className="space-y-2.5">
              {devices.data.devices.map((d) => (
                <li key={d._id} className="rounded-xl border border-slate-100 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate flex items-center gap-1.5"><Laptop size={13} /> {d.hostname || "Unnamed PC"}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{d.lastSeenAt ? `Seen ${timeAgo(d.lastSeenAt)}` : "Not seen yet"}{d.agentVersion ? ` · v${d.agentVersion}` : ""}</p>
                    </div>
                    <Badge tone={d.status === "ACTIVE" ? "green" : d.status === "PENDING" ? "amber" : "red"}>{d.status === "ACTIVE" ? "Active" : d.status === "PENDING" ? "Pending" : "Revoked"}</Badge>
                  </div>
                  <button onClick={() => removeDevice(d)} className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-red-500 hover:underline"><Trash2 size={11} /> Remove</button>
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon={<Laptop size={20} />} title="No computer registered" hint="Follow the setup steps above." />
          )}
          <p className="text-[10px] text-slate-400 mt-3 flex items-start gap-1.5"><MapPin size={11} className="shrink-0 mt-0.5" />Only the Wi-Fi network name is checked. No files, screens or browsing.</p>
        </Card>
      </div>

      {logins.data?.logins?.length > 0 && (
        <Card>
          <p className="text-sm font-bold text-slate-800 mb-3">My recent sign-ins</p>
          <SignInList logins={logins.data.logins} showDate />
          <p className="text-[10px] text-slate-400 mt-3">Every time you sign in or out, the device and network are recorded. Staff on Wi-Fi attendance can only sign in from the office Wi-Fi.</p>
        </Card>
      )}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <p className="text-sm font-bold text-slate-800">My attendance</p>
          <Button size="sm" variant="ghost" onClick={() => setCorrection({ open: true, date: selected || "" })}>Request a correction</Button>
        </div>
        {summary && (
          <div className="flex flex-wrap gap-2 mb-4">
            <Badge tone="green">Present {summary.present}</Badge>
            {summary.halfDays > 0 && <Badge tone="amber">Half days {summary.halfDays}</Badge>}
            {summary.absent > 0 && <Badge tone="red">Absent {summary.absent}</Badge>}
            {summary.leave > 0 && <Badge tone="violet">Leave {summary.leave}</Badge>}
            {summary.lateDays > 0 && <Badge tone="amber">Late {summary.lateDays}×</Badge>}
            <Badge tone="slate">{fmtMinutes(summary.totalMinutes)} worked</Badge>
            <Badge tone="blue">{summary.attendancePercent}% attendance</Badge>
          </div>
        )}
        {cal.loading && !cal.data ? <Spinner /> : <MonthCalendar month={month} onMonthChange={(m) => { setMonth(m); setSelected(null); }} days={days} selected={selected} onSelect={(d) => setSelected(d.date)} />}
        <DayDetail day={selectedDay} onCorrect={(date) => setCorrection({ open: true, date })} />
      </Card>

      {regs.data?.regularizations?.length > 0 && (
        <Card padded={false}>
          <p className="text-sm font-bold text-slate-800 px-5 pt-4 pb-3">My correction requests</p>
          <Table head={["Date", "Requested", "Reason", "Status", ""]}>
            {regs.data.regularizations.slice(0, 8).map((r) => (
              <tr key={r._id}>
                <td className="px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">{fmtDay(r.date)}</td>
                <td className="px-4 py-3 whitespace-nowrap">{fmtTime(r.requestedCheckIn)} – {fmtTime(r.requestedCheckOut)}</td>
                <td className="px-4 py-3 text-slate-500 max-w-[16rem] truncate" title={r.reason}>{r.reason}{r.adminNote && <span className="block text-[10px] text-slate-400">Admin: {r.adminNote}</span>}</td>
                <td className="px-4 py-3"><Badge tone={{ Pending: "amber", Approved: "green", Rejected: "red", Cancelled: "slate" }[r.status]}>{r.status}</Badge></td>
                <td className="px-4 py-3 text-right">{r.status === "Pending" && <button onClick={() => cancelReg(r)} className="text-[11px] font-semibold text-red-500 hover:underline">Cancel</button>}</td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <CorrectionModal open={correction.open} date={correction.date} onClose={() => setCorrection({ open: false, date: "" })} onDone={() => { regs.reload({ silent: true }); reloadAll({ silent: true }); }} />
    </div>
  );
}

export default function WifiAttendance() {
  return (
    <Themed role="user">
      <Body />
    </Themed>
  );
}
