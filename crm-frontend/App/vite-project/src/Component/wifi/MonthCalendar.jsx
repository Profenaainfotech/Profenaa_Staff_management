// Month grid used by both the employee's "My attendance" and the admin's per-employee report.
import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { monthLabel, shiftMonth, istDateKey } from "../../lib/format";
import { STATUS } from "./ui";

const CELL = {
  PRESENT: "bg-emerald-50 border-emerald-200 text-emerald-700",
  COMPLETED: "bg-emerald-50 border-emerald-200 text-emerald-700",
  WARNING: "bg-amber-50 border-amber-200 text-amber-700",
  LEFT: "bg-sky-50 border-sky-200 text-sky-700",
  LOGGED_OUT: "bg-slate-100 border-slate-200 text-slate-600",
  HALF_DAY: "bg-amber-50 border-amber-200 text-amber-700",
  INCOMPLETE: "bg-amber-50 border-amber-200 text-amber-700",
  ABSENT: "bg-red-50 border-red-200 text-red-700",
  ON_LEAVE: "bg-violet-50 border-violet-200 text-violet-700",
  HALF_LEAVE: "bg-violet-50 border-violet-200 text-violet-700",
  WFH: "bg-sky-50 border-sky-200 text-sky-700",
  HOLIDAY: "bg-indigo-50 border-indigo-200 text-indigo-700",
  WEEKLY_OFF: "bg-slate-100 border-slate-200 text-slate-500",
  NOT_YET_IN: "bg-white border-slate-200 text-slate-400",
};

const SHORT = {
  PRESENT: "In", COMPLETED: "OK", WARNING: "Warn", LEFT: "Out", LOGGED_OUT: "Out", HALF_DAY: "½", INCOMPLETE: "?", ABSENT: "Abs",
  ON_LEAVE: "Leave", HALF_LEAVE: "½ L", WFH: "WFH", HOLIDAY: "Hol", WEEKLY_OFF: "Off", NOT_YET_IN: "",
};

export default function MonthCalendar({ month, onMonthChange, days = [], selected, onSelect }) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const total = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const offset = (first.getUTCDay() + 6) % 7; // Monday first
  const byDate = new Map(days.map((d) => [d.date, d]));
  const today = istDateKey();
  const canNext = shiftMonth(month, 1) <= today.slice(0, 7);

  const cells = [];
  for (let i = 0; i < offset; i++) cells.push(<div key={`b${i}`} />);
  for (let d = 1; d <= total; d++) {
    const key = `${month}-${String(d).padStart(2, "0")}`;
    const info = byDate.get(key);
    const code = info?.display;
    const future = key > today;
    const sundayWork = Boolean(info && info.offDayMinutes > 0); // worked on a day off
    const overtime = Boolean(info && !sundayWork && info.overtimeMinutes > 0);
    cells.push(
      <button
        key={key}
        disabled={!info}
        onClick={() => info && onSelect?.(info)}
        title={info ? `${STATUS[code]?.label || code}${info.checkIn ? "" : ""}` : ""}
        className={`aspect-square sm:aspect-[4/3] rounded-xl border p-1.5 flex flex-col justify-between text-left transition
          ${info ? `${sundayWork ? "bg-violet-100 border-violet-400 text-violet-800" : CELL[code] || "bg-white border-slate-200"} hover:shadow-md` : future ? "border-dashed border-slate-100 text-slate-200" : "border-slate-100 text-slate-300"}
          ${selected === key ? "ring-2 ring-blue-400" : ""} ${key === today ? "outline outline-2 outline-offset-1 outline-blue-300" : ""}`}
      >
        <span className="text-[11px] font-bold">{d}</span>
        {info && <span className="text-[9px] font-bold leading-none truncate">{sundayWork ? "Sun work" : SHORT[code]}{overtime && <span className="text-orange-600"> +OT</span>}</span>}
      </button>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => onMonthChange(shiftMonth(month, -1))} className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50" aria-label="Previous month">
          <ChevronLeft size={15} />
        </button>
        <p className="text-sm font-bold text-slate-800">{monthLabel(month)}</p>
        <button
          onClick={() => canNext && onMonthChange(shiftMonth(month, 1))}
          disabled={!canNext}
          className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-30"
          aria-label="Next month"
        >
          <ChevronRight size={15} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1.5 mb-1.5">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <p key={d} className="text-[10px] font-bold uppercase text-slate-400 text-center">{d}</p>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">{cells}</div>
    </div>
  );
}
