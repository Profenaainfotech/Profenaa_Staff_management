// The staff competition: who completes the most projects, and how many within the validity time.
//   role="user"  : staff dashboard (shows "your position")
//   role="admin" : Analytics / Performance (adds top-performer highlights)
// Points: 10 for a project completed on time, 5 for a late one.
import React, { useMemo, useState } from "react";
import { Crown, Flame, Medal, RefreshCw, Target, Timer, Trophy } from "lucide-react";
import { useAsync, useLiveRefresh } from "../../lib/hooks";
import { fmtMinutes, projectRequest } from "./projectApi";

const PERIODS = [
  ["all", "All time"],
  ["month", "This month"],
  ["week", "Last 7 days"],
];
const MEDAL = ["text-amber-500", "text-slate-400", "text-orange-600"];

function Chip({ active, onClick, children }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={`rounded-full border px-3.5 py-1.5 text-xs font-bold transition ${active ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-blue-300"}`}>
      {children}
    </button>
  );
}

export default function ProjectLeaderboard({ role = "user", compact = false }) {
  const [type, setType] = useState("All");
  const [period, setPeriod] = useState("all");

  const res = useAsync(() => projectRequest(role, "GET", `/leaderboard?period=${period}${type === "All" ? "" : `&type=${type}`}`), [role, type, period]);
  useLiveRefresh(role, res.reload, { events: ["notification"], pollMs: 30000 });

  const data = res.data;
  const team = data?.team;
  const rows = useMemo(() => data?.leaderboard || [], [data]);
  const shown = useMemo(() => {
    if (!compact) return rows;
    const top = rows.slice(0, 5);
    const me = data?.me;
    return me && !top.some((r) => String(r.userId) === String(me.userId)) ? [...top, me] : top;
  }, [rows, compact, data]);

  const remaining = team ? team.total - team.completed : 0;
  const nobodyYet = rows.every((r) => r.completed === 0);
  const seg = (n) => (team?.total ? `${(n / team.total) * 100}%` : "0%");

  const top = rows[0]?.completed ? rows[0] : null;
  const bestRate = [...rows].filter((r) => r.completed > 0).sort((a, b) => b.onTimeRate - a.onTimeRate || b.completed - a.completed)[0];
  const fastest = [...rows].filter((r) => r.avgMinutes !== null).sort((a, b) => a.avgMinutes - b.avgMinutes)[0];

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-label="Project leaderboard">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow"><Trophy size={22} /></span>
          <div>
            <h3 className="text-lg font-black text-slate-900">Project Leaderboard</h3>
            <p className="text-[11px] text-slate-500">{role === "admin" ? "Who completes the most projects, within the validity time." : "Complete projects on time to climb the ranking."}</p>
          </div>
        </div>
        <button type="button" onClick={() => res.reload()} className="rounded-xl border border-slate-200 p-2.5 text-slate-500 hover:bg-slate-50" aria-label="Refresh leaderboard">
          <RefreshCw size={15} className={res.loading ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Project type">
          {["All", "Internal", "External"].map((t) => (
            <Chip key={t} active={type === t} onClick={() => setType(t)}>{t}</Chip>
          ))}
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Period">
          {PERIODS.map(([v, label]) => (
            <Chip key={v} active={period === v} onClick={() => setPeriod(v)}>{label}</Chip>
          ))}
        </div>
      </div>

      {res.error && !data && (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" role="alert">{res.error}</p>
      )}
      {res.loading && !data && <p className="mt-6 text-center text-sm text-slate-400">Loading the leaderboard...</p>}

      {team && (
        <>
          {/* team progress */}
          <div className="mt-5 rounded-2xl bg-slate-50 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-black text-slate-800">
                <Target size={15} className="mr-1.5 inline text-blue-600" />
                Team progress: {team.completed} of {team.total} projects completed
              </p>
              <span className="text-2xl font-black text-emerald-600">{team.percentComplete}%</span>
            </div>
            <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={team.percentComplete} aria-valuemin={0} aria-valuemax={100} aria-label="Team progress">
              <div className="bg-emerald-500 transition-all" style={{ width: seg(team.completed) }} />
              <div className="bg-indigo-500 transition-all" style={{ width: seg(team.assigned) }} />
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px] font-semibold text-slate-500">
              <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-emerald-500" />Completed {team.completed}</span>
              <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-indigo-500" />Assigned, as tasks {team.assigned}</span>
              <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-slate-300" />Available {team.available}</span>
              {team.overdue > 0 && <span className="text-red-600">Overdue {team.overdue}</span>}
            </div>
            <p className="mt-3 text-xs font-semibold text-slate-600">
              {team.total === 0 ? "No projects yet." : remaining === 0 ? "All projects are complete. Great teamwork!" : `${remaining} project${remaining === 1 ? "" : "s"} left. Every completed project counts!`}
            </p>
          </div>

          {/* staff: where am I */}
          {role === "user" && data.me && (
            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm">
              <span className="font-black text-blue-900"><Flame size={15} className="mr-1.5 inline text-orange-500" />You are #{data.me.rank}</span>
              <span className="text-blue-800">{data.me.points} points</span>
              <span className="text-blue-800">{data.me.completed} completed ({data.me.onTime} on time)</span>
            </div>
          )}

          {/* admin: highlights */}
          {role === "admin" && !nobodyYet && (
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {[
                [Crown, "Top performer", top && `${top.name} · ${top.completed} completed`, "from-amber-400 to-orange-500"],
                [Medal, "Best on-time rate", bestRate && `${bestRate.name} · ${bestRate.onTimeRate}%`, "from-emerald-500 to-teal-500"],
                [Timer, "Fastest on average", fastest && `${fastest.name} · ${fmtMinutes(fastest.avgMinutes)}`, "from-sky-500 to-blue-600"],
              ].map(([Icon, label, value, grad]) => (
                <div key={label} className={`rounded-2xl bg-gradient-to-br ${grad} p-4 text-white shadow-sm`}>
                  <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-white/80"><Icon size={13} />{label}</p>
                  <p className="mt-1 truncate text-sm font-black">{value || "--"}</p>
                </div>
              ))}
            </div>
          )}

          {/* ranking */}
          {rows.length === 0 ? (
            <p className="mt-5 text-center text-sm text-slate-400">No staff members yet.</p>
          ) : (
            <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-100">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Rank</th>
                    <th className="px-4 py-3">Staff</th>
                    <th className="px-4 py-3 text-center">Completed</th>
                    <th className="px-4 py-3 text-center">On time</th>
                    <th className="px-4 py-3 text-center">Late</th>
                    <th className="px-4 py-3 text-center">On-time %</th>
                    <th className="px-4 py-3 text-center">Avg time</th>
                    <th className="px-4 py-3 text-right">Points</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shown.map((r) => {
                    const me = data.me && String(data.me.userId) === String(r.userId);
                    return (
                      <tr key={String(r.userId)} className={me ? "bg-blue-50/70" : r.rank === 1 && r.completed > 0 ? "bg-amber-50/50" : ""}>
                        <td className="px-4 py-3 font-black text-slate-700">
                          {r.rank <= 3 && r.completed > 0 ? <Trophy size={17} className={MEDAL[r.rank - 1]} aria-label={`Rank ${r.rank}`} /> : `#${r.rank}`}
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-bold text-slate-800">{r.name}</span>
                          {me && <span className="ml-2 rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-black text-white">You</span>}
                          {r.active > 0 && <span className="ml-2 text-[10px] font-semibold text-sky-600">working on {r.active}</span>}
                        </td>
                        <td className="px-4 py-3 text-center text-base font-black text-slate-800">{r.completed}</td>
                        <td className="px-4 py-3 text-center font-bold text-emerald-600">{r.onTime}</td>
                        <td className="px-4 py-3 text-center font-bold text-amber-600">{r.late}</td>
                        <td className="px-4 py-3 text-center text-slate-600">{r.onTimeRate === null ? "--" : `${r.onTimeRate}%`}</td>
                        <td className="px-4 py-3 text-center text-slate-600">{fmtMinutes(r.avgMinutes)}</td>
                        <td className="px-4 py-3 text-right text-base font-black text-blue-700">{r.points}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {nobodyYet && rows.length > 0 && <p className="mt-3 text-center text-xs text-slate-400">Nobody has completed a project in this period yet. Be the first!</p>}
          <p className="mt-3 text-[11px] text-slate-400">{compact && rows.length > shown.length ? `Showing the top 5${data.me ? " and you" : ""}. ` : ""}Points: {data.points.onTime} for every project completed on time, {data.points.late} if it is late.</p>
        </>
      )}
    </section>
  );
}