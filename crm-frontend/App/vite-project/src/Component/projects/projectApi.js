// Shared helpers for everything project-related (admin screen, staff dashboard, leaderboard).
import { API_ORIGIN, getToken } from "../../lib/api";

export const PROJECT_URL = `${API_ORIGIN}/api/Project`;
export const MAX_IMAGES = 10;
export const MAX_IMAGE_MB = 5;
export const IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

/** Full address of a stored project image */
export const imageUrl = (p) => {
  if (!p) return "";
  if (/^(https?:|blob:|data:)/.test(p)) return p;
  return `${API_ORIGIN}${p.startsWith("/") ? p : `/uploads/projects/${p}`}`;
};

/** The cover first, then the rest - without repeating the cover */
export const projectImages = (project) => [...new Set([project?.cardImage, ...(project?.images || [])].filter(Boolean))];

/**
 * One call to the project API. Sends the logged-in person's token, and turns every failure
 * into an Error with a message that is fine to show as it is.
 *   role: "admin" | "user"   ·   json: object   ·   form: FormData (images)
 */
export async function projectRequest(role, method, path, { json, form } = {}) {
  const headers = {};
  const token = getToken(role);
  if (token) headers.Authorization = `Bearer ${token}`;
  let body;
  if (form) body = form;
  else if (json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  }

  let res;
  try {
    res = await fetch(`${PROJECT_URL}${path}`, { method, headers, body });
  } catch {
    throw new Error("Cannot reach the server. Check your connection and try again.");
  }
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* empty or non-JSON answer */
  }
  if (!res.ok) {
    const err = new Error(data?.message || (res.status === 401 ? "Please log in again." : "Something went wrong. Please try again."));
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

const pad = (n) => String(n).padStart(2, "0");

/** value for <input type="datetime-local"> in local time */
export const toLocalInput = (date) => {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const daysFromNow = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

export const fmtDateTime = (date) => {
  if (!date) return "No validity set";
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? "No validity set" : d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

/** "5d 3h left" / "45m left" / "Overdue by 2h" for a validity time */
export function timeLeft(due, now = Date.now()) {
  if (!due) return { label: "No validity set", tone: "slate" };
  const diff = new Date(due).getTime() - now;
  const abs = Math.abs(diff);
  const m = Math.floor(abs / 60000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const text = d >= 2 ? `${d}d` : d === 1 ? `1d ${h}h` : h >= 1 ? `${h}h ${m % 60}m` : `${Math.max(m, 1)}m`;
  if (diff < 0) return { label: `Overdue by ${text}`, tone: "red" };
  return { label: `${text} left`, tone: diff < 24 * 3600 * 1000 ? "amber" : "green" };
}

/** minutes -> "2h 10m" */
export const fmtMinutes = (min) => {
  if (min === null || min === undefined) return "--";
  const m = Math.max(0, Math.round(min));
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
};

/** A quick client-side check that a submission link looks like a real http(s) address */
export function isValidLink(value) {
  const link = String(value || "").trim();
  if (!link) return false;
  try {
    const url = new URL(link);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export const TYPE_STYLE = {
  Internal: "bg-blue-50 text-blue-700 border-blue-200",
  External: "bg-violet-50 text-violet-700 border-violet-200",
};
export const STATUS_STYLE = {
  Pending: "bg-amber-50 text-amber-700 border-amber-200",
  Assigned: "bg-indigo-50 text-indigo-700 border-indigo-200",
  Completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
};