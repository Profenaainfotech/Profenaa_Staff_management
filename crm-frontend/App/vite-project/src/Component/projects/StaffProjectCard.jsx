// One project as a LIST ROW for staff: what it is, when it is due, and the next thing they can do.
// (Matches the admin screen's list-only view - one project per row, not a grid of cards.)
import React, { useState } from "react";
import { CalendarClock, CheckCircle2, Eye, Image as ImageIcon, Loader2, Play, Rocket, TriangleAlert, UserRound } from "lucide-react";
import { STATUS_STYLE, TYPE_STYLE, fmtMinutes, imageUrl, projectImages, timeLeft } from "./projectApi";

const TONE = {
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  red: "bg-red-50 text-red-700 border-red-200",
  slate: "bg-slate-50 text-slate-500 border-slate-200",
};

export default function StaffProjectCard({ project, mine, hasActive, busy, onTake, onStart, onComplete, onOpen }) {
  const [confirming, setConfirming] = useState(false);
  const images = projectImages(project);
  const cover = images[0];
  const done = project.status === "Completed";
  const left = done ? null : timeLeft(project.dueDate);

  return (
    <article
      className="flex flex-col gap-3 border-b border-slate-100 bg-white px-4 py-3 transition last:border-b-0 hover:bg-slate-50/80 sm:flex-row sm:items-center sm:gap-4"
      aria-label={project.title}
    >
      {/* thumbnail */}
      <button
        type="button"
        onClick={() => onOpen(project)}
        className="relative h-16 w-24 shrink-0 self-start overflow-hidden rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 text-left sm:self-center"
        aria-label={`View details of ${project.title}`}
      >
        {cover ? (
          <img src={imageUrl(cover)} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-slate-400">
            <ImageIcon size={18} />
          </span>
        )}
        {images.length > 1 && <span className="absolute bottom-1 right-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[9px] font-bold text-white">{images.length}</span>}
      </button>

      {/* info */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <h4 className="truncate text-sm font-black text-slate-900">{project.title}</h4>
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-black ${TYPE_STYLE[project.projectType] || TYPE_STYLE.Internal}`}>{project.projectType}</span>
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-black ${STATUS_STYLE[project.status]}`}>{mine || done ? project.status : "Available"}</span>
          {mine && (
            <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-bold text-slate-500">
              <UserRound size={11} /> Yours
            </span>
          )}
        </div>

        {project.issueDetails && (
          <p className="mt-1 flex items-start gap-1 text-xs font-semibold text-amber-700">
            <TriangleAlert size={12} className="mt-0.5 shrink-0" />
            <span className="line-clamp-1">{project.issueDetails}</span>
          </p>
        )}

        <div className="mt-1.5">
          {done ? (
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black ${project.completedOnTime === false ? TONE.amber : TONE.green}`}>
              <CheckCircle2 size={11} />
              {project.completedOnTime === false ? "Completed late" : "Completed on time"} · {fmtMinutes(project.completionMinutes)}
            </span>
          ) : (
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black ${TONE[left.tone]}`}>
              <CalendarClock size={11} />
              {left.label}
            </span>
          )}
        </div>
      </div>

      {/* actions */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
        {!mine && !done && (
          <>
            <button
              type="button"
              disabled={hasActive || busy}
              onClick={() => onTake(project, true)}
              title={hasActive ? "Finish your current project first" : "Take this project and start working now"}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
              {hasActive ? "Finish your project first" : "Take & start"}
            </button>
            {!hasActive && (
              <button type="button" disabled={busy} onClick={() => onTake(project, false)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                Take only
              </button>
            )}
          </>
        )}

        {mine && project.status === "Pending" && (
          <button type="button" disabled={busy} onClick={() => onStart(project)} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-sky-600 px-3 py-2 text-xs font-bold text-white hover:bg-sky-700 disabled:opacity-60">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Start working
          </button>
        )}

        {mine && project.status === "In Progress" &&
          (confirming ? (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2">
              <span className="text-xs font-bold text-emerald-800">Mark as completed?</span>
              <button type="button" disabled={busy} onClick={() => { setConfirming(false); onComplete(project); }} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700">Yes</button>
              <button type="button" onClick={() => setConfirming(false)} className="rounded-lg px-2 py-1.5 text-xs font-bold text-slate-500 hover:bg-white">No</button>
            </div>
          ) : (
            <button type="button" disabled={busy} onClick={() => setConfirming(true)} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Mark as completed
            </button>
          ))}

        <button type="button" onClick={() => onOpen(project)} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50" aria-label={`Details of ${project.title}`}>
          <Eye size={14} /> Details
        </button>
      </div>
    </article>
  );
}
