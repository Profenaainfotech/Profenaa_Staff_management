// Read-only details of one project (staff): what to fix, description, all images, validity time.
import React, { useEffect, useState } from "react";
import { CalendarClock, CheckCircle2, Clock3, Image as ImageIcon, TriangleAlert, UserRound, X } from "lucide-react";
import { STATUS_STYLE, TYPE_STYLE, fmtDateTime, fmtMinutes, imageUrl, projectImages, timeLeft } from "./projectApi";

export default function ProjectDetailsModal({ project, onClose }) {
  const images = projectImages(project);
  const [active, setActive] = useState(0);
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!project) return null;

  const left = project.status === "Completed" ? null : timeLeft(project.dueDate);
  const tone = { green: "text-emerald-600", amber: "text-amber-600", red: "text-red-600", slate: "text-slate-500" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-label="Project details" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap gap-2">
              <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-black ${TYPE_STYLE[project.projectType] || TYPE_STYLE.Internal}`}>{project.projectType}</span>
              <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-black ${STATUS_STYLE[project.status]}`}>{project.status}</span>
            </div>
            <h2 className="text-xl font-black text-slate-900">{project.title}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl bg-slate-100 p-2.5 text-slate-500 hover:bg-slate-200" aria-label="Close details">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {images.length > 0 ? (
            <div>
              <div className="aspect-video overflow-hidden rounded-2xl bg-slate-100">
                <img src={imageUrl(images[active] || images[0])} alt={`${project.title} - image ${active + 1}`} className="h-full w-full object-contain" />
              </div>
              {images.length > 1 && (
                <ul className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Project images">
                  {images.map((p, i) => (
                    <li key={p}>
                      <button type="button" onClick={() => setActive(i)} aria-label={`Show image ${i + 1}`} aria-pressed={i === active} className={`h-16 w-20 overflow-hidden rounded-lg border-2 ${i === active ? "border-blue-500" : "border-transparent opacity-70 hover:opacity-100"}`}>
                        <img src={imageUrl(p)} alt="" className="h-full w-full object-cover" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 rounded-2xl bg-slate-50 py-6 text-sm font-semibold text-slate-400">
              <ImageIcon size={18} /> No images for this project
            </div>
          )}

          {project.issueDetails && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="mb-1 flex items-center gap-2 text-xs font-black uppercase tracking-wide text-amber-700">
                <TriangleAlert size={14} /> Error / change required
              </p>
              <p className="whitespace-pre-wrap text-sm font-semibold text-amber-900">{project.issueDetails}</p>
            </div>
          )}

          <div>
            <p className="mb-1 text-xs font-black uppercase tracking-wide text-slate-400">Description</p>
            <p className="whitespace-pre-wrap text-sm text-slate-700">{project.description}</p>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-[10px] font-black uppercase text-slate-400">Valid until</p>
              <p className="mt-1 flex items-center gap-1.5 text-xs font-bold text-slate-700"><CalendarClock size={13} />{fmtDateTime(project.dueDate)}</p>
              {left && <p className={`mt-0.5 text-[11px] font-bold ${tone[left.tone]}`}>{left.label}</p>}
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-[10px] font-black uppercase text-slate-400">Assigned to</p>
              <p className="mt-1 flex items-center gap-1.5 text-xs font-bold text-slate-700"><UserRound size={13} />{project.assignedToName || "Not taken yet"}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-[10px] font-black uppercase text-slate-400">Started</p>
              <p className="mt-1 flex items-center gap-1.5 text-xs font-bold text-slate-700"><Clock3 size={13} />{project.startedAt ? fmtDateTime(project.startedAt) : "Not started"}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-[10px] font-black uppercase text-slate-400">Result</p>
              {project.status === "Completed" ? (
                <p className={`mt-1 flex items-center gap-1.5 text-xs font-bold ${project.completedOnTime === false ? "text-amber-600" : "text-emerald-600"}`}>
                  <CheckCircle2 size={13} />
                  {project.completedOnTime === false ? "Late" : "On time"} · {fmtMinutes(project.completionMinutes)}
                </p>
              ) : (
                <p className="mt-1 text-xs font-bold text-slate-400">Not finished</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
