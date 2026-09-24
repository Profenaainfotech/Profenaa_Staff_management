// One project as a LIST ROW for staff, browsing the pool: what it is, when it is due, and
// a single action - take it. The moment someone takes a project (or an admin assigns one),
// it becomes a Task and drops out of this list entirely; everything from that point on -
// starting it, submitting a link, being marked complete - happens on the Task, in My Tasks.
import React from "react";
import { CalendarClock, Eye, Image as ImageIcon, Loader2, Rocket, TriangleAlert } from "lucide-react";
import { TYPE_STYLE, imageUrl, projectImages, timeLeft } from "./projectApi";

const TONE = {
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  red: "bg-red-50 text-red-700 border-red-200",
  slate: "bg-slate-50 text-slate-500 border-slate-200",
};

export default function StaffProjectCard({ project, hasActive, busy, onTake, onOpen }) {
  const images = projectImages(project);
  const cover = images[0];
  const left = timeLeft(project.dueDate);

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
          <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-black text-slate-500">Available</span>
        </div>

        {project.issueDetails && (
          <p className="mt-1 flex items-start gap-1 text-xs font-semibold text-amber-700">
            <TriangleAlert size={12} className="mt-0.5 shrink-0" />
            <span className="line-clamp-1">{project.issueDetails}</span>
          </p>
        )}

        <div className="mt-1.5">
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black ${TONE[left.tone]}`}>
            <CalendarClock size={11} />
            {left.label}
          </span>
        </div>
      </div>

      {/* actions */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
        <button
          type="button"
          disabled={hasActive || busy}
          onClick={() => onTake(project)}
          title={hasActive ? "Finish your current task first" : "Take this project - it becomes a task in My Tasks"}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
          {hasActive ? "Finish your task first" : "Self assign"}
        </button>

        <button type="button" onClick={() => onOpen(project)} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50" aria-label={`Details of ${project.title}`}>
          <Eye size={14} /> Details
        </button>
      </div>
    </article>
  );
}