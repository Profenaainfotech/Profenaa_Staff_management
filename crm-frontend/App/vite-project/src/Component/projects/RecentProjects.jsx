// Staff dashboard: "Recent Projects" - the newest Internal and External projects in the
// pool, one per row, plus (via the Technologies chip) this person's own allocated
// Technologies work - never anyone else's, never a browsable pool, since Technologies work
// is always allocated directly by the admin. Taking an Internal/External project immediately
// turns it into a task - see it and work it from My Tasks from that point on.
import React, { useMemo, useState } from "react";
import { CheckCircle, FolderKanban, PackageOpen } from "lucide-react";
import { FlashBanner } from "./Flash";
import { useFlash } from "./useFlash";
import ProjectDetailsModal from "./ProjectDetailsModal";
import StaffProjectCard from "./StaffProjectCard";
import { projectRequest } from "./projectApi";
import { DomainChips, WorkItemList } from "./TechnologyWork";

const SHOW = 6;

export default function RecentProjects({ pool = [], tasks = [], todayDoneTitles, loading = false, onChanged, onViewAll }) {
  const [type, setType] = useState("All");
  const [busyId, setBusyId] = useState("");
  const [open, setOpen] = useState(null);
  const { flash, success, error, clear } = useFlash();

  const techTasks = useMemo(() => tasks.filter((t) => t.projectType === "Technologies"), [tasks]);
  const match = (p) => type === "All" || p.projectType === type;
  const list = useMemo(() => [...pool].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).filter(match).slice(0, SHOW), [pool, type]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(
    () => ({
      All: pool.length,
      Internal: pool.filter((p) => p.projectType === "Internal").length,
      External: pool.filter((p) => p.projectType === "External").length,
      Technologies: techTasks.length,
    }),
    [pool, techTasks]
  );

  const take = async (project) => {
    setBusyId(project._id);
    try {
      const data = await projectRequest("user", "PUT", `/self-assign/${project._id}`, { json: {} });
      success(data?.message || "Successfully added to your tasks.");
      await onChanged?.();
    } catch (err) {
      error(err.message);
      await onChanged?.(); // somebody else may have just taken it: show the fresh list
    } finally {
      setBusyId("");
    }
  };

  return (
    <section aria-label="Recent projects">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-bold text-slate-900">
            <FolderKanban size={18} className="text-sky-600" /> Recent Projects
          </h3>
          <p className="mt-1 text-[11px] text-slate-500">
            {type === "Technologies" ? "Work allocated to you, by domain - nobody else's." : "Newest internal and external projects up for grabs. Take one and it lands in My Tasks."}
          </p>
        </div>
        <button type="button" onClick={onViewAll} className="text-xs font-semibold text-sky-600 hover:text-sky-700">
          View All
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter projects by type">
        {["All", "Internal", "External", "Technologies"].map((t) => (
          <button key={t} type="button" onClick={() => setType(t)} aria-pressed={type === t} className={`rounded-full border px-3.5 py-1.5 text-xs font-bold transition ${type === t ? "border-sky-500 bg-sky-500 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-sky-300"}`}>
            {t} <span className={type === t ? "text-white/80" : "text-slate-400"}>({counts[t]})</span>
          </button>
        ))}
      </div>

      {flash && <FlashBanner flash={flash} onClose={clear} className="mb-4" />}

      {type === "Technologies" ? (
        techTasks.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
            <PackageOpen size={32} className="mb-2 text-slate-300" />
            <p className="text-sm font-bold text-slate-700">No Technologies work allocated to you</p>
            <p className="mt-1 text-xs text-slate-400">Work the administrator allocates to you will appear here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {techTasks.map((t) => {
              const remaining = (t.workItems || []).filter((i) => !todayDoneTitles?.has(i.title));
              return (
                <article key={t._id} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h4 className="text-sm font-black text-slate-900">{t.title}</h4>
                    {remaining.length === 0 ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-700">
                        <CheckCircle size={12} /> Done today
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-[10px] font-black text-teal-700">{remaining.length} left today</span>
                    )}
                  </div>
                  <DomainChips domains={t.domains} className="mt-2" />
                  {remaining.length > 0 && <WorkItemList items={remaining} domains={t.domains} className="mt-3 rounded-xl bg-slate-50 p-3" />}
                </article>
              );
            })}
          </div>
        )
      ) : loading && list.length === 0 ? (
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
            <StaffProjectCard key={p._id} project={p} busy={busyId === p._id} onTake={take} onOpen={setOpen} />
          ))}
        </div>
      )}

      {open && <ProjectDetailsModal project={open} onClose={() => setOpen(null)} />}
    </section>
  );
}
