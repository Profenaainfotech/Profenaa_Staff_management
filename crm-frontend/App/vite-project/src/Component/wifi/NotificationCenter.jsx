// Server-driven notification bell (attendance, leave, devices, announcements...).
// It sits NEXT TO the existing task-alert bell; that one is untouched.
//
//   <NotificationCenter role="admin" onNavigate={setActiveTab} />
//   <NotificationCenter role="user"  onNavigate={changeTab} />
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, BellOff, CheckCheck, CheckCircle2, Info, Inbox, Megaphone, ShieldAlert, Trash2, Volume2, VolumeX, X } from "lucide-react";
import { subscribe } from "../../lib/socket";
import { timeAgo } from "../../lib/format";
import { isMuted, playAlert, setMuted, topSeverity } from "../../lib/sound";
import { Button, Field, Modal, Select, TextArea, TextInput, Themed, useApi, useRole, useToast } from "./ui";

const SEVERITY = {
  critical: { icon: ShieldAlert, dot: "bg-red-100 text-red-600" },
  warning: { icon: AlertTriangle, dot: "bg-amber-100 text-amber-600" },
  success: { icon: CheckCircle2, dot: "bg-emerald-100 text-emerald-600" },
  info: { icon: Info, dot: "bg-sky-100 text-sky-600" },
};

// Delete by date. "today" is counted from midnight India time, "week" is the last 7 days.
const RANGES = [
  ["today", "Today"],
  ["week", "Last 7 days"],
  ["all", "All time"],
];

/** The "Delete notifications" chooser: pick a range, see how many, confirm. */
function DeleteOptions({ range, setRange, readOnly, setReadOnly, counts, confirm, setConfirm, deleting, onDelete, onClose }) {
  const count = counts ? counts[range] : null;
  const label = RANGES.find(([v]) => v === range)[1].toLowerCase();
  return (
    <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/80" role="region" aria-label="Delete notifications">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-slate-800">Delete notifications</p>
        <button onClick={onClose} className="p-1 rounded-md text-slate-400 hover:bg-slate-200/60" aria-label="Close delete options">
          <X size={14} />
        </button>
      </div>

      {!confirm ? (
        <>
          <div className="mt-2 space-y-1.5" role="radiogroup" aria-label="Which notifications to delete">
            {RANGES.map(([value, text]) => (
              <label
                key={value}
                className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs cursor-pointer transition ${
                  range === value ? "border-red-300 bg-red-50 text-red-700 font-bold" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
              >
                <span className="flex items-center gap-2">
                  <input type="radio" name="delete-range" value={value} checked={range === value} onChange={() => setRange(value)} className="accent-red-600" />
                  {text}
                </span>
                <span className="text-[10px] font-black" aria-label={`${counts ? counts[value] : "?"} notifications`}>{counts ? counts[value] : "..."}</span>
              </label>
            ))}
          </div>
          <label className="mt-2.5 flex items-center gap-2 text-[11px] text-slate-500 cursor-pointer">
            <input type="checkbox" checked={readOnly} onChange={(e) => setReadOnly(e.target.checked)} className="accent-sky-600" />
            Only delete the ones I have already read
          </label>
          <button
            onClick={() => setConfirm(true)}
            disabled={!count}
            className="mt-3 w-full rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
          >
            {count === null ? "Delete..." : count === 0 ? "Nothing to delete" : `Delete ${count} notification${count === 1 ? "" : "s"}`}
          </button>
        </>
      ) : (
        <div className="mt-2">
          <p className="text-xs text-slate-700">
            Delete <b>{count} notification{count === 1 ? "" : "s"}</b> from <b>{label}</b>
            {readOnly ? " (read ones only)" : ""}? This cannot be undone.
          </p>
          <div className="mt-3 flex gap-2">
            <button onClick={() => setConfirm(false)} disabled={deleting} className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
              Back
            </button>
            <button onClick={onDelete} disabled={deleting} className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-60">
              {deleting ? "Deleting..." : "Yes, delete"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Bell({ onNavigate }) {
  const role = useRole();
  const api = useApi();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [announce, setAnnounce] = useState(false);
  const box = useRef(null);
  const seen = useRef(null); // ids already heard, so a reload never repeats a sound
  const [muted, setMutedState] = useState(isMuted());

  // deleting
  const [menu, setMenu] = useState(false); // the "Delete notifications" chooser is open
  const [range, setRange] = useState("today");
  const [readOnly, setReadOnly] = useState(false);
  // How many each choice would delete. They belong to ONE opening of the chooser and one "read only" setting,
  // so numbers from an earlier opening are never shown next to the delete button.
  const [session, setSession] = useState(0);
  const [countsFor, setCountsFor] = useState(null); // { session, readOnly, values: { today, week, all } }
  const counts = countsFor && countsFor.session === session && countsFor.readOnly === readOnly ? countsFor.values : null;
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [flash, setFlash] = useState(null); // { kind: "success" | "error", message } - goes away by itself after 3 seconds
  const flashTimer = useRef(null);

  const load = useCallback(async (quiet = false) => {
    try {
      const r = await api.get("/api/notifications", { limit: 30 });
      setItems(r.notifications);
      setUnread(r.unreadCount);
      // a notification that arrived while the live connection was down still makes its sound
      const list = r.notifications || [];
      if (seen.current === null) {
        seen.current = new Set(list.map((n) => n._id));
      } else {
        const fresh = list.filter((n) => !n.readAt && !seen.current.has(n._id));
        list.forEach((n) => seen.current.add(n._id));
        if (fresh.length && !quiet) playAlert(topSeverity(fresh));
      }
    } catch {
      /* the bell must never break the dashboard */
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
    const off = subscribe(role, "notification", (n) => {
      setItems((cur) => [n, ...cur.filter((x) => x._id !== n._id)].slice(0, 50));
      setUnread((u) => u + 1);
      seen.current?.add(n._id);
      playAlert(n.severity);
      toast(`${n.title}${n.message ? ` - ${n.message.split("\n")[0]}` : ""}`, n.severity === "critical" || n.severity === "warning" ? "error" : "success");
    });
    const poll = setInterval(load, 60000);
    return () => {
      off();
      clearInterval(poll);
    };
  }, [role, load, toast]);

  const say = useCallback((kind, message) => {
    clearTimeout(flashTimer.current);
    setFlash({ kind, message });
    flashTimer.current = setTimeout(() => setFlash(null), 3000);
  }, []);
  useEffect(() => () => clearTimeout(flashTimer.current), []);

  // how many notifications each choice would delete, shown before the person confirms
  useEffect(() => {
    if (!menu) return undefined;
    let live = true;
    api
      .get("/api/notifications/counts", { readOnly: readOnly ? 1 : undefined })
      .then((r) => live && setCountsFor({ session, readOnly, values: r.counts }))
      .catch(() => live && setCountsFor(null));
    return () => {
      live = false;
    };
  }, [menu, readOnly, session, api]);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => box.current && !box.current.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    window.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  const openItem = async (n) => {
    if (!n.readAt) {
      setItems((cur) => cur.map((x) => (x._id === n._id ? { ...x, readAt: new Date().toISOString() } : x)));
      setUnread((u) => Math.max(0, u - 1));
      api.patch(`/api/notifications/${n._id}/read`).catch(() => {});
    }
    if (n.link && onNavigate) {
      onNavigate(n.link);
      setOpen(false);
    }
  };

  const readAll = async () => {
    setItems((cur) => cur.map((x) => ({ ...x, readAt: x.readAt || new Date().toISOString() })));
    setUnread(0);
    api.post("/api/notifications/read-all").catch(() => {});
  };

  // delete a single notification (read or unread)
  const removeOne = async (n) => {
    setItems((cur) => cur.filter((x) => x._id !== n._id));
    if (!n.readAt) setUnread((u) => Math.max(0, u - 1));
    try {
      await api.del(`/api/notifications/${n._id}`);
      load(true); // quietly refill the list: older notifications may now fit
    } catch (e) {
      setItems((cur) => [n, ...cur].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
      if (!n.readAt) setUnread((u) => u + 1);
      say("error", e.message || "Could not delete that notification.");
    }
  };

  // delete by Today / Last 7 days / All time
  const deleteRange = async () => {
    setDeleting(true);
    try {
      const r = await api.del(`/api/notifications?range=${range}${readOnly ? "&readOnly=1" : ""}`);
      say("success", r.deleted ? `Deleted ${r.deleted} notification${r.deleted === 1 ? "" : "s"}.` : "There was nothing to delete.");
      setMenu(false);
      setConfirm(false);
      await load(true);
    } catch (e) {
      setConfirm(false);
      say("error", e.message || "Could not delete the notifications.");
    } finally {
      setDeleting(false);
    }
  };

  const accent = role === "admin" ? "bg-blue-700" : "bg-sky-500";

  return (
    <div className="relative" ref={box}>
      <button
        onClick={() => {
          setOpen((v) => !v);
          setMenu(false);
          setConfirm(false);
        }}
        title="Activity and alerts"
        aria-label="Activity and alerts"
        className={`relative w-9 h-9 sm:w-10 sm:h-10 rounded-xl border bg-white hover:bg-sky-50 flex items-center justify-center transition ${
          unread ? (role === "admin" ? "border-blue-300 text-blue-700" : "border-sky-300 text-sky-600") : "border-slate-200 text-slate-600"
        }`}
      >
        <Inbox size={17} />
        {unread > 0 && (
          <span className={`absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full ${accent} text-white text-[9px] font-black flex items-center justify-center`}>
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[min(22rem,calc(100vw-2rem))] max-h-[75vh] flex flex-col bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div>
              <p className="text-sm font-bold text-slate-900">Activity</p>
              <p className="text-[10px] text-slate-400">{unread ? `${unread} unread` : "You're all caught up"}</p>
            </div>
            <div className="flex items-center gap-1">
              {role === "admin" && (
                <button onClick={() => { setAnnounce(true); setOpen(false); }} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100" title="Send an announcement">
                  <Megaphone size={15} />
                </button>
              )}
              <button
                onClick={() => { const m = !muted; setMuted(m); setMutedState(m); if (!m) playAlert("info"); }}
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"
                title={muted ? "Sound is off - click to turn on" : "Sound is on - click to mute"}
                aria-label={muted ? "Turn notification sound on" : "Mute notification sound"}
              >
                {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
              </button>
              <button onClick={readAll} disabled={!unread} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30" title="Mark all as read">
                <CheckCheck size={15} />
              </button>
              <button
                onClick={() => { setMenu((v) => !v); setSession((n) => n + 1); setConfirm(false); }}
                className={`p-2 rounded-lg hover:bg-slate-100 ${menu ? "bg-red-50 text-red-600" : "text-slate-500"}`}
                title="Delete notifications"
                aria-label="Delete notifications"
                aria-expanded={menu}
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>

          {menu && (
            <DeleteOptions
              range={range}
              setRange={setRange}
              readOnly={readOnly}
              setReadOnly={setReadOnly}
              counts={counts}
              confirm={confirm}
              setConfirm={setConfirm}
              deleting={deleting}
              onDelete={deleteRange}
              onClose={() => { setMenu(false); setConfirm(false); }}
            />
          )}

          {flash && (
            <div
              role={flash.kind === "error" ? "alert" : "status"}
              className={`mx-3 mt-3 flex items-start gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${
                flash.kind === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-800"
              }`}
            >
              <span className="flex-1">{flash.message}</span>
              <button onClick={() => { clearTimeout(flashTimer.current); setFlash(null); }} className="shrink-0 rounded p-0.5 hover:bg-black/5" aria-label="Close message">
                <X size={13} />
              </button>
            </div>
          )}

          <div className="overflow-y-auto divide-y divide-slate-50">
            {loading && <p className="text-center text-xs text-slate-400 py-10">Loading...</p>}
            {!loading && items.length === 0 && (
              <div className="flex flex-col items-center py-12 text-slate-400">
                <BellOff size={22} />
                <p className="text-xs mt-2">No notifications yet</p>
              </div>
            )}
            {items.map((n) => {
              const S = SEVERITY[n.severity] || SEVERITY.info;
              const Icon = S.icon;
              return (
                <div key={n._id} className={`group relative ${n.readAt ? "" : "bg-sky-50/50"}`}>
                  <button onClick={() => openItem(n)} className="w-full flex gap-3 text-left pl-4 pr-11 py-3 hover:bg-slate-50 transition">
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${S.dot}`}>
                      <Icon size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-2">
                        <span className={`text-xs ${n.readAt ? "font-semibold text-slate-700" : "font-bold text-slate-900"}`}>{n.title}</span>
                        {!n.readAt && <span className={`w-2 h-2 rounded-full mt-1 shrink-0 ${accent}`} />}
                      </span>
                      {n.message && <span className="block text-[11px] text-slate-500 mt-0.5 whitespace-pre-line break-words">{n.message}</span>}
                      <span className="block text-[10px] text-slate-400 mt-1">{timeAgo(n.createdAt)}</span>
                    </span>
                  </button>
                  <button
                    onClick={() => removeOne(n)}
                    className="absolute right-2 bottom-2 p-1.5 rounded-lg text-slate-400 opacity-70 hover:opacity-100 hover:text-red-600 hover:bg-red-50 focus-visible:opacity-100 transition"
                    title="Delete this notification"
                    aria-label={`Delete notification: ${n.title}`}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {role === "admin" && <AnnounceModal open={announce} onClose={() => setAnnounce(false)} />}
    </div>
  );
}

function AnnounceModal({ open, onClose }) {
  const api = useApi();
  const toast = useToast();
  const [form, setForm] = useState({ title: "", message: "", severity: "info", audience: "ALL", branchId: "" });
  const [branches, setBranches] = useState([]);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    if (open) api.get("/api/branches").then((r) => setBranches(r.branches)).catch(() => {});
  }, [open, api]);

  const send = async () => {
    setBusy(true);
    try {
      const r = await api.post("/api/notifications/broadcast", form);
      toast(`Sent to ${r.sent} staff member${r.sent === 1 ? "" : "s"}`);
      setForm({ title: "", message: "", severity: "info", audience: "ALL", branchId: "" });
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
      title="Send an announcement"
      subtitle="Appears instantly in every selected employee's activity bell."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={send} loading={busy} disabled={!form.title.trim() || (form.audience === "BRANCH" && !form.branchId)}>
            <Megaphone size={13} /> Send
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Title"><TextInput value={form.title} onChange={set("title")} placeholder="Office closed on Friday" maxLength={140} /></Field>
        <Field label="Message (optional)"><TextArea value={form.message} onChange={set("message")} maxLength={600} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Importance">
            <Select value={form.severity} onChange={set("severity")}>
              <option value="info">Normal</option>
              <option value="warning">Important</option>
              <option value="critical">Urgent</option>
            </Select>
          </Field>
          <Field label="Send to">
            <Select value={form.audience} onChange={set("audience")}>
              <option value="ALL">All staff</option>
              <option value="BRANCH">One branch</option>
            </Select>
          </Field>
        </div>
        {form.audience === "BRANCH" && (
          <Field label="Branch">
            <Select value={form.branchId} onChange={set("branchId")}>
              <option value="">Choose a branch</option>
              {branches.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
            </Select>
          </Field>
        )}
      </div>
    </Modal>
  );
}

export default function NotificationCenter({ role, onNavigate }) {
  return (
    <Themed role={role}>
      <Bell onNavigate={onNavigate} />
    </Themed>
  );
}
