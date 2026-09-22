// Small add-on for existing project cards: type, validity time (or result) and the error / change to fix.
import React from "react";
import { AlertCircle, CalendarClock, CheckCircle2 } from "lucide-react";
import { TYPE_STYLE, fmtMinutes, timeLeft } from "./projectApi";

const TONE = {
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  red: "bg-red-50 text-red-700 border-red-200",
  slate: "bg-slate-50 text-slate-500 border-slate-200",
};

export default function ProjectExtras({ project }) {
  const done = project?.status === "Completed";
  const left = done ? null : timeLeft(project?.dueDate);
  const type = project?.projectType || "Internal";
  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${TYPE_STYLE[type]}`}>{type}</span>
        {done ? (
          <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-black ${project.completedOnTime === false ? TONE.amber : TONE.green}`}>
            <CheckCircle2 size={11} />
            {project.completedOnTime === false ? "Completed late" : "Completed on time"} · {fmtMinutes(project.completionMinutes)}
          </span>
        ) : (
          <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-black ${TONE[left.tone]}`}>
            <CalendarClock size={11} />
            {left.label}
          </span>
        )}
      </div>
      {project?.issueDetails && (
        <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] font-semibold text-amber-800">
          <AlertCircle size={12} className="mt-0.5 shrink-0" />
          <span className="line-clamp-3">{project.issueDetails}</span>
        </p>
      )}
    </div>
  );
}
