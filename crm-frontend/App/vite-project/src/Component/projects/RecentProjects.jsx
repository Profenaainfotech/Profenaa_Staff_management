// Staff dashboard: "Recent Projects" - the newest Internal and External projects, one per row.
// Take one (optionally starting it straight away), start it, submit a link for admin review.
import React, { useMemo, useState } from "react";
import { FolderKanban, PackageOpen } from "lucide-react";
import { FlashBanner } from "./Flash";
import { useFlash } from "./useFlash";
import ProjectDetailsModal from "./ProjectDetailsModal";
import StaffProjectCard from "./StaffProjectCard";
import { projectRequest } from "./projectApi";

const SHOW = 6;

export default function RecentProjects({ projects = [], pool: poolIn = [], loading = false, onChanged, onViewAll }) {
  const [type, setType] = useState("All");
  const [busyId, setBusyId] = useState("");
  const [open, setOpen] = useState(null);
  const { flash, success, error, clear } = useFlash();

  // the two lists refresh one after the other: never show a project I already hold as "available" as well
  const pool = useMemo(() => {
    const mine = new Set(projects.map((p) => p._id));
    return poolIn.filter((p) => !mine.has(p._id));
  }, [poolIn, projects]);
  const active = useMemo(() => projects.find((p) => p.status !== "Completed") || null, [projects]);
  const match = (p) => type === "All" || p.projectType === type;

  const list = useMemo(() => {
    const byNewest = (a, b) => new Date(b.createdAt) - new Date(a.createdAt);
    const done = projects.filter((p) => p.status === "Completed").sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
    return [...(active && match(active) ? [active] : []), ...[...pool].sort(byNewest).filter(match), ...done.filter(match).slice(0, 2)].slice(0, SHOW);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, pool, type, active]);

  const counts = useMemo(() => {
    const all = [...pool, ...(active ? [active] : [])];
    return { All: all.length, Internal: all.filter((p) => p.projectType === "Internal").length, External: all.filter((p) => p.projectType === "External").length };
  }, [pool, active]);

  const run = async (project, call, message) => {
    setBusyId(project._id);
    try {
      const data = await call();
      success(data?.message || message);
      await onChanged?.();
    } catch (err) {
      error(err.message);
      await onChanged?.(); // somebody else may have just taken it: show the fresh list
    } finally {
      setBusyId("");
    }
  };

  const take = (p, start) => run(p, () => projectRequest("user", "PUT", `/self-assign/${p._id}`, { json: { start } }));
  const startIt = (p) => run(p, () => projectRequest("user", "PUT", `/start/${p._id}`, { json: {} }));
  const submitWork = (p, link) => run(p, () => projectRequest("user", "PUT", `/submit/${p._id}`, { json: { link } }), "Submitted for admin review.");

  return (
    <section aria-label="Recent projects">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-bold text-slate-900">
            <FolderKanban size={18} className="text-sky-600" /> Recent Projects
          </h3>
          <p className="mt-1 text-[11px] text-slate-500">Latest internal and external projects. Take one and start working - one project at a time.</p>
        </div>
        <button type="button" onClick={onViewAll} className="text-xs font-semibold text-sky-600 hover:text-sky-700">
          View All
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter projects by type">
        {["All", "Internal", "External"].map((t) => (
          <button key={t} type="button" onClick={() => setType(t)} aria-pressed={type === t} className={`rounded-full border px-3.5 py-1.5 text-xs font-bold transition ${type === t ? "border-sky-500 bg-sky-500 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-sky-300"}`}>
            {t} <span className={type === t ? "text-white/80" : "text-slate-400"}>({counts[t]})</span>
          </button>
        ))}
      </div>

      {flash && <FlashBanner flash={flash} onClose={clear} className="mb-4" />}

      {loading && list.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400">Loading projects...</div>
      ) : list.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
          <PackageOpen size={32} className="mb-2 text-slate-300" />
          <p className="text-sm font-bold text-slate-700">{type === "All" ? "No projects yet" : `No ${type.toLowerCase()} projects right now`}</p>
          <p className="mt-1 text-xs text-slate-400">New projects created by the administrator appear here.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {list.map((p) => (
            <StaffProjectCard key={p._id} project={p} mine={projects.some((m) => m._id === p._id)} hasActive={Boolean(active)} busy={busyId === p._id} onTake={take} onStart={startIt} onSubmit={submitWork} onOpen={setOpen} />
          ))}
        </div>
      )}

      {open && <ProjectDetailsModal project={open} onClose={() => setOpen(null)} />}
    </section>
  );
}