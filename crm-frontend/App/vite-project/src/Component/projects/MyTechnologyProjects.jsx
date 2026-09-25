// Staff dashboard: the Technologies projects the admin has allocated to THIS staff member.
// Each one is a task (see Task.controller), so it is fed from the task list the dashboard already
// loads and refreshes - nothing extra to fetch. Shows nothing at all when there are none.
//
// This is daily, recurring work: only items NOT ticked yet today are shown as "still to do" -
// what was ticked today is recorded in that day's Daily Report, not repeated here. Tomorrow
// every item is back.
import React from "react";
import { ArrowRight, CalendarClock, CheckCircle, Cpu } from "lucide-react";
import { DomainChips, WorkItemList } from "./TechnologyWork";

const STATUS = {
  Pending: "bg-amber-50 text-amber-700 border-amber-200",
  "In Progress": "bg-sky-50 text-sky-700 border-sky-200",
  Completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const when = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "");

export default function MyTechnologyProjects({ tasks = [], todayDoneTitles, onOpenTasks }) {
  const mine = tasks.filter((t) => t.projectType === "Technologies");
  if (!mine.length) return null;

  return (
    <section aria-label="My Technologies projects">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-100 text-teal-700">
            <Cpu size={19} />
          </span>
          <div>
            <h3 className="text-lg font-black text-slate-900">My Technologies Projects</h3>
            <p className="text-[11px] text-slate-500">Work the administrator has allocated to you, by domain. Tick what you complete each day in your Daily Report.</p>
          </div>
        </div>
        <button type="button" onClick={onOpenTasks} className="hidden items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 sm:inline-flex">
          Open in My Tasks <ArrowRight size={13} />
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {mine.map((t) => {
          const remaining = (t.workItems || []).filter((i) => !todayDoneTitles?.has(i.title));
          return (
            <article key={t._id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="break-words text-sm font-black text-slate-900">{t.title}</h4>
                  <p className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-400">
                    <CalendarClock size={12} />
                    Assigned {when(t.assignedAt || t.createdAt)}
                    {t.assignedBy ? ` by ${t.assignedBy}` : ""}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black ${STATUS[t.status] || STATUS.Pending}`}>{t.status || "Pending"}</span>
              </div>
              <DomainChips domains={t.domains} className="mt-3" />
              {remaining.length === 0 ? (
                <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-bold text-emerald-700">
                  <CheckCircle size={15} /> All done for today! New items reappear tomorrow.
                </div>
              ) : (
                <WorkItemList items={remaining} domains={t.domains} className="mt-4 rounded-xl bg-slate-50 p-3" />
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
