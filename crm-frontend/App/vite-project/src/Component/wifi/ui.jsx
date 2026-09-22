// Shared UI for the Wi-Fi attendance / leave / staff screens.
// Colours follow the existing app: admin = white + blue-900, employee = slate + sky-500.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, X } from "lucide-react";
import { makeApi } from "../../lib/api";

// ---------------------------------------------------------------- theme
const THEMES = {
  admin: {
    primary: "bg-blue-900 hover:bg-blue-800 text-white",
    soft: "bg-sky-50 text-blue-800",
    border: "border-blue-100",
    ring: "focus:ring-blue-200 focus:border-blue-400",
    accent: "text-blue-700",
    tabOn: "bg-blue-900 text-white shadow-sm",
    tabOff: "text-slate-600 hover:bg-sky-50",
    rowHover: "hover:bg-sky-50/60",
    head: "bg-sky-50/70 text-blue-900",
  },
  user: {
    primary: "bg-sky-500 hover:bg-sky-600 text-white",
    soft: "bg-sky-50 text-sky-700",
    border: "border-slate-200",
    ring: "focus:ring-sky-200 focus:border-sky-400",
    accent: "text-sky-600",
    tabOn: "bg-sky-500 text-white shadow-sm",
    tabOff: "text-slate-500 hover:bg-slate-100",
    rowHover: "hover:bg-slate-50",
    head: "bg-slate-50 text-slate-600",
  },
};

const Ctx = createContext({ role: "admin", api: null, toast: () => {} });
export const useRole = () => useContext(Ctx).role;
export const useApi = () => useContext(Ctx).api;
export const useToast = () => useContext(Ctx).toast;
export const useTheme = () => THEMES[useContext(Ctx).role];

/** Wrap each top-level screen:  <Themed role="admin">...</Themed> */
export function Themed({ role, children }) {
  const [toasts, setToasts] = useState([]);
  const id = useRef(0);
  const api = useMemo(() => makeApi(role), [role]);
  const toast = useCallback((message, tone = "success") => {
    const key = ++id.current;
    setToasts((t) => [...t, { key, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.key !== key)), 4200);
  }, []);
  const value = useMemo(() => ({ role, api, toast }), [role, api, toast]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="fixed top-4 right-4 z-[100] space-y-2 w-[calc(100vw-2rem)] max-w-sm pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.key}
            className={`pointer-events-auto flex items-start gap-2.5 rounded-xl border px-4 py-3 text-xs font-semibold shadow-lg bg-white ${
              t.tone === "error" ? "border-red-200 text-red-700" : "border-emerald-200 text-emerald-700"
            }`}
          >
            {t.tone === "error" ? <AlertCircle size={16} className="shrink-0 mt-0.5" /> : <CheckCircle2 size={16} className="shrink-0 mt-0.5" />}
            <span className="break-words">{t.message}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

// ---------------------------------------------------------------- basics
export function Card({ className = "", children, padded = true }) {
  const t = useTheme();
  return <div className={`bg-white border ${t.border} rounded-2xl shadow-sm ${padded ? "p-4 sm:p-5" : ""} ${className}`}>{children}</div>;
}

export function PageHeader({ icon, title, subtitle, actions }) {
  const t = useTheme();
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
      <div className="flex items-center gap-3 min-w-0">
        {icon && <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${t.soft}`}>{icon}</div>}
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-slate-900 truncate">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const BTN = {
  ghost: "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50",
  danger: "bg-red-600 hover:bg-red-700 text-white",
  softDanger: "bg-red-50 hover:bg-red-100 text-red-700 border border-red-100",
  success: "bg-emerald-600 hover:bg-emerald-700 text-white",
  softSuccess: "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-100",
};

export function Button({ variant = "primary", size = "md", loading = false, disabled, className = "", children, ...rest }) {
  const t = useTheme();
  const look = variant === "primary" ? t.primary : BTN[variant];
  const pad = size === "sm" ? "px-3 py-1.5 text-[11px]" : "px-4 py-2.5 text-xs";
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed ${pad} ${look} ${className}`}
      {...rest}
    >
      {loading && <Loader2 size={13} className="animate-spin" />}
      {children}
    </button>
  );
}

const TONES = {
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  red: "bg-red-50 text-red-700 border-red-200",
  blue: "bg-sky-50 text-sky-700 border-sky-200",
  violet: "bg-violet-50 text-violet-700 border-violet-200",
  indigo: "bg-indigo-50 text-indigo-700 border-indigo-200",
  orange: "bg-orange-50 text-orange-700 border-orange-200",
  slate: "bg-slate-100 text-slate-600 border-slate-200",
};

export function Badge({ tone = "slate", children, className = "" }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${TONES[tone]} ${className}`}>
      {children}
    </span>
  );
}

// One label + colour per attendance display code (server: report.service displayFor)
export const STATUS = {
  PRESENT: { label: "In office", tone: "green" },
  WARNING: { label: "Wi-Fi warning", tone: "amber" },
  LEFT: { label: "Stepped out", tone: "blue" },
  LOGGED_OUT: { label: "Logged out", tone: "slate" },
  COMPLETED: { label: "Completed", tone: "green" },
  HALF_DAY: { label: "Half day", tone: "amber" },
  ABSENT: { label: "Absent", tone: "red" },
  INCOMPLETE: { label: "No check-out", tone: "amber" },
  ON_LEAVE: { label: "On leave", tone: "violet" },
  HALF_LEAVE: { label: "Half-day leave", tone: "violet" },
  WFH: { label: "Work from home", tone: "blue" },
  HOLIDAY: { label: "Holiday", tone: "indigo" },
  WEEKLY_OFF: { label: "Weekly off", tone: "slate" },
  NOT_YET_IN: { label: "Not in yet", tone: "slate" },
};

export function StatusBadge({ code, overdue = false, label }) {
  if (!code) return <span className="text-slate-300">--</span>;
  const s = STATUS[code] || { label: code, tone: "slate" };
  if (code === "NOT_YET_IN" && overdue) return <Badge tone="red">Not in (late)</Badge>;
  return <Badge tone={s.tone}>{label && code === "HOLIDAY" ? label : s.label}</Badge>;
}

export function Spinner({ label = "Loading..." }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-xs text-slate-400">
      <Loader2 size={16} className="animate-spin" /> {label}
    </div>
  );
}

export function ErrorNote({ message, onRetry }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
      <AlertCircle size={16} className="shrink-0 mt-0.5" />
      <span className="flex-1">{message}</span>
      {onRetry && (
        <button onClick={() => onRetry()} className="font-bold underline">
          Retry
        </button>
      )}
    </div>
  );
}

export function Empty({ icon, title, hint, action }) {
  return (
    <div className="flex flex-col items-center text-center py-12 px-4">
      {icon && <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mb-3">{icon}</div>}
      <p className="text-sm font-bold text-slate-700">{title}</p>
      {hint && <p className="text-xs text-slate-400 mt-1 max-w-sm">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, tone = "slate", hint, onClick, active }) {
  const t = useTheme();
  const colour = { green: "text-emerald-600", amber: "text-amber-600", red: "text-red-600", blue: "text-sky-600", violet: "text-violet-600", slate: "text-slate-900" }[tone];
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={`text-left bg-white border rounded-2xl px-4 py-3 shadow-sm transition ${active ? "border-blue-400 ring-2 ring-blue-100" : t.border} ${onClick ? "hover:shadow-md cursor-pointer" : ""}`}
    >
      <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">{label}</p>
      <p className={`text-2xl font-black mt-1 ${colour}`}>{value}</p>
      {hint && <p className="text-[10px] text-slate-400 mt-0.5">{hint}</p>}
    </Tag>
  );
}

export function Tabs({ tabs, value, onChange, className = "" }) {
  const t = useTheme();
  return (
    <div className={`flex gap-1 overflow-x-auto pb-1 ${className}`}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition ${value === tab.id ? t.tabOn : t.tabOff}`}
        >
          {tab.icon}
          {tab.label}
          {tab.count > 0 && (
            <span className={`min-w-[18px] h-[18px] px-1 rounded-full text-[9px] font-black flex items-center justify-center ${value === tab.id ? "bg-white/25 text-white" : "bg-red-500 text-white"}`}>
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- forms
export const inputCls = (t) =>
  `w-full rounded-xl border ${t.border} bg-white px-3 py-2.5 text-xs text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 ${t.ring} disabled:bg-slate-50`;

export function Field({ label, hint, children, className = "" }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-[11px] font-bold text-slate-600 mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-[10px] text-slate-400 mt-1">{hint}</span>}
    </label>
  );
}

export function TextInput(props) {
  const t = useTheme();
  return <input {...props} className={`${inputCls(t)} ${props.className || ""}`} />;
}
export function Select({ children, ...props }) {
  const t = useTheme();
  return (
    <select {...props} className={`${inputCls(t)} ${props.className || ""}`}>
      {children}
    </select>
  );
}
export function TextArea(props) {
  const t = useTheme();
  return <textarea rows={3} {...props} className={`${inputCls(t)} ${props.className || ""}`} />;
}

export function Toggle({ checked, onChange, label, hint }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 w-9 h-5 rounded-full transition shrink-0 ${checked ? "bg-emerald-500" : "bg-slate-300"}`}
      >
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${checked ? "left-[18px]" : "left-0.5"}`} />
      </button>
      <span>
        <span className="block text-xs font-semibold text-slate-700">{label}</span>
        {hint && <span className="block text-[10px] text-slate-400 mt-0.5">{hint}</span>}
      </span>
    </label>
  );
}

// ---------------------------------------------------------------- modal
export function Modal({ open, onClose, title, subtitle, children, footer, size = "md" }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  const width = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" }[size];
  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[1px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined} className={`relative w-full ${width} max-h-[92vh] flex flex-col bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl`}>
        <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3 border-b border-slate-100">
          <div className="min-w-0">
            <h4 className="text-base font-bold text-slate-900 truncate">{title}</h4>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-2 -m-2 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-slate-100 flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

/** Confirmation dialog:  const [confirm, ask] = useConfirm();  ask({title, message, onYes}) ... {confirm} */
export function useConfirm() {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const close = () => !busy && setState(null);
  const node = (
    <Modal
      open={Boolean(state)}
      onClose={close}
      size="sm"
      title={state?.title || "Are you sure?"}
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={state?.danger === false ? "primary" : "danger"}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await state.onYes();
                setState(null);
              } finally {
                setBusy(false);
              }
            }}
          >
            {state?.confirmLabel || "Confirm"}
          </Button>
        </>
      }
    >
      <p className="text-xs text-slate-600 leading-relaxed">{state?.message}</p>
    </Modal>
  );
  return [node, setState];
}

// A simple responsive table shell
export function Table({ head, children, className = "" }) {
  const t = useTheme();
  return (
    <div className={`overflow-x-auto rounded-2xl border ${t.border} bg-white ${className}`}>
      <table className="w-full text-xs">
        <thead className={`${t.head} text-[10px] uppercase tracking-wider`}>
          <tr>
            {head.map((h, i) => (
              <th key={i} className="text-left font-bold px-4 py-3 whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}
