// All attendance dates/times are Indian Standard Time, regardless of the browser's timezone.
const IST = "Asia/Kolkata";

export const istDateKey = (d = new Date()) => new Date(d).toLocaleDateString("en-CA", { timeZone: IST });

export const fmtTime = (iso) =>
  iso ? new Date(iso).toLocaleTimeString("en-IN", { timeZone: IST, hour: "2-digit", minute: "2-digit", hour12: true }) : "--";

export const fmtDateTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString("en-IN", { timeZone: IST, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true })
    : "--";

// "2026-09-21" -> "21 Sep 2026" (parsed as a plain date, no timezone shifting)
export const fmtDay = (key, opts = { day: "2-digit", month: "short", year: "numeric" }) => {
  if (!key) return "--";
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", { ...opts, timeZone: "UTC" });
};

export const weekdayShort = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" });
};

export const fmtMinutes = (m) => {
  const n = Math.max(0, Math.round(Number(m) || 0));
  return n >= 60 ? `${Math.floor(n / 60)}h ${String(n % 60).padStart(2, "0")}m` : `${n}m`;
};

export const addDaysKey = (key, n) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

export const monthLabel = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
};

export const shiftMonth = (ym, delta) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
};

export const timeAgo = (iso) => {
  if (!iso) return "";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
};

export const csvEscape = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function downloadCsv(filename, rows) {
  const blob = new Blob([rows.map((r) => r.map(csvEscape).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// "2026-09-21T04:00:00Z" -> "09:30" (IST, 24h) for <input type="time">
export const hhmmIST = (iso) =>
  iso ? new Date(iso).toLocaleTimeString("en-GB", { timeZone: IST, hour: "2-digit", minute: "2-digit", hour12: false }) : "";
