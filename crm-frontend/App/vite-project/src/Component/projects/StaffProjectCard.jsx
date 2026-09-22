// One project as a card for staff: what it is, when it is due, and the next thing they can do.
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
    <article className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md" aria-label={project.title}>
      <button type="button" onClick={() => onOpen(project)} className="relative block h-40 w-full overflow-hidden bg-gradient-to-br from-slate-100 to-slate-200 text-left" aria-label={`View details of ${project.title}`}>
        {cover ? (
          <img src={imageUrl(cover)} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <span className="flex h-full w-full flex-col items-center justify-center text-slate-400">
            <ImageIcon size={30} />
            <span className="mt-1 text-[11px] font-semibold">No image</span>
          </span>
        )}
        <span className={`absolute left-3 top-3 rounded-full border px-2.5 py-1 text-[11px] font-black ${TYPE_STYLE[project.projectType] || TYPE_STYLE.Internal}`}>{project.projectType}</span>
        <span className={`absolute right-3 top-3 rounded-full border px-2.5 py-1 text-[11px] font-black ${STATUS_STYLE[project.status]}`}>{mine || done ? project.status : "Available"}</span>
        {images.length > 1 && <span className="absolute bottom-3 right-3 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white">{images.length} photos</span>}
      </button>

      <div className="flex flex-1 flex-col p-4">
        <h4 className="line-clamp-1 text-base font-black text-slate-900">{project.title}</h4>

        {project.issueDetails && (
          <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-xs font-semibold text-amber-800">
            <TriangleAlert size={13} className="mt-0.5 shrink-0" />
            <span className="line-clamp-2">{project.issueDetails}</span>
          </p>
        )}
        <p className="mt-2 line-clamp-2 text-xs text-slate-500">{project.description}</p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {done ? (
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-black ${project.completedOnTime === false ? TONE.amber : TONE.green}`}>
              <CheckCircle2 size={12} />
              {project.completedOnTime === false ? "Completed late" : "Completed on time"} · {fmtMinutes(project.completionMinutes)}
            </span>
          ) : (
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-black ${TONE[left.tone]}`}>
              <CalendarClock size={12} />
              {left.label}
            </span>
          )}
          {mine && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500">
              <UserRound size={12} /> Yours
            </span>
          )}
        </div>

        <div className="mt-auto flex flex-wrap gap-2 pt-4">
          {!mine && !done && (
            <>
              <button type="button" disabled={hasActive || busy} onClick={() => onTake(project, true)} title={hasActive ? "Finish your current project first" : "Take this project and start working now"} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2.5 text-xs font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
                {hasActive ? "Finish your project first" : "Take & start"}
              </button>
              {!hasActive && (
                <button type="button" disabled={busy} onClick={() => onTake(project, false)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                  Take only
                </button>
              )}
            </>
          )}

          {mine && project.status === "Pending" && (
            <button type="button" disabled={busy} onClick={() => onStart(project)} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-sky-600 px-3 py-2.5 text-xs font-bold text-white hover:bg-sky-700 disabled:opacity-60">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Start working
            </button>
          )}

          {mine && project.status === "In Progress" &&
            (confirming ? (
              <div className="flex flex-1 items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2">
                <span className="flex-1 text-xs font-bold text-emerald-800">Mark as completed?</span>
                <button type="button" disabled={busy} onClick={() => { setConfirming(false); onComplete(project); }} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700">Yes</button>
                <button type="button" onClick={() => setConfirming(false)} className="rounded-lg px-2 py-1.5 text-xs font-bold text-slate-500 hover:bg-white">No</button>
              </div>
            ) : (
              <button type="button" disabled={busy} onClick={() => setConfirming(true)} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Mark as completed
              </button>
            ))}

          <button type="button" onClick={() => onOpen(project)} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50" aria-label={`Details of ${project.title}`}>
            <Eye size={14} /> Details
          </button>
        </div>
      </div>
    </article>
  );
}
