// Create a Technologies project (admin).
//
//   1 Project title *     2 Staff *  (only staff the admin already created)
//   3 Domain              Sales / Training / Marketing / Placement / HR / Social Media
//                         - clicking a domain shows ONLY that domain's work items
//   4 Work items *        tick one or more (ticks are kept when switching domain)
// ...then a summary of exactly what will be allocated.
//
// The domains and the 23 work items come from the server (GET /technology-catalog), so the
// list lives in one place: crm-backend/src/Utils/technologyCatalog.js.
// Saving creates the project and puts it straight into the chosen staff member's tasks.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Cpu, ListChecks, Loader2, Plus, RefreshCw, UserRound, X } from "lucide-react";
import { FlashBanner } from "./Flash";
import { FLASH_MS, useFlash } from "./useFlash";
import { DOMAIN_SOLID, DOMAIN_STYLE, projectRequest } from "./projectApi";

const fieldCls = (bad) =>
  `w-full rounded-xl border px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 ${
    bad ? "border-red-400 bg-red-50/40 focus:ring-red-200" : "border-slate-200 bg-slate-50 focus:border-teal-400 focus:ring-teal-100"
  }`;

function Step({ n, label, required, hint, error, children, htmlFor }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-2 flex items-center gap-2 text-sm font-black text-slate-800">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-100 text-[10px] text-teal-700">{n}</span>
        {label}
        {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 text-xs font-semibold text-red-600" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-slate-400">{hint}</p>
      ) : null}
    </div>
  );
}

export default function TechnologyFormModal({ users = [], onClose, onSaved }) {
  const [catalog, setCatalog] = useState(null); // { domains: [...], items: [{ id, title, domain }] }
  const [catalogError, setCatalogError] = useState("");
  const [title, setTitle] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [domain, setDomain] = useState(""); // the domain whose items are on screen ("" = none picked yet)
  const [picked, setPicked] = useState([]); // ticked item ids, across every domain
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const { flash, error: flashError, clear } = useFlash();
  const errTimer = useRef(null);
  const titleRef = useRef(null);
  const staffRef = useRef(null);
  const itemsRef = useRef(null);

  const loadCatalog = useCallback(async () => {
    setCatalogError("");
    try {
      const data = await projectRequest("admin", "GET", "/technology-catalog");
      setCatalog({ domains: data.domains || [], items: data.items || [] });
    } catch (err) {
      setCatalogError(err.message || "The work items could not be loaded.");
    }
  }, []);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);
  useEffect(() => () => clearTimeout(errTimer.current), []);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saving, onClose]);

  const clearError = (k) =>
    setErrors((c) => {
      if (!c[k]) return c;
      const { [k]: _gone, ...rest } = c;
      return rest;
    });

  const items = catalog?.items || [];
  const shown = useMemo(() => items.filter((i) => i.domain === domain), [items, domain]);
  const pickedItems = useMemo(() => items.filter((i) => picked.includes(i.id)), [items, picked]);
  const countIn = (d) => items.filter((i) => i.domain === d).length;
  const pickedIn = (d) => pickedItems.filter((i) => i.domain === d).length;
  const staff = users.filter((u) => u.isActive !== false);
  const assignee = staff.find((u) => String(u._id) === String(assignedTo));
  const summaryDomains = (catalog?.domains || []).filter((d) => pickedIn(d) > 0);

  const toggle = (id) => {
    setPicked((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
    clearError("items");
  };
  const allShownPicked = shown.length > 0 && shown.every((i) => picked.includes(i.id));
  const toggleAllShown = () => {
    const ids = shown.map((i) => i.id);
    setPicked((c) => (allShownPicked ? c.filter((x) => !ids.includes(x)) : [...new Set([...c, ...ids])]));
    clearError("items");
  };

  const submit = async (ev) => {
    ev.preventDefault();
    if (saving) return;
    const e = {};
    if (title.trim().length < 3) e.title = "Enter a project title (at least 3 characters).";
    if (!assignedTo) e.assignedTo = "Select the staff member this project is for.";
    if (!picked.length) e.items = domain ? "Tick at least one work item." : "Pick a domain, then tick at least one work item.";
    const first = ["title", "assignedTo", "items"].find((k) => e[k]);
    if (first) {
      setErrors(e);
      flashError(e[first]);
      ({ title: titleRef, assignedTo: staffRef, items: itemsRef })[first].current?.focus?.();
      clearTimeout(errTimer.current);
      errTimer.current = setTimeout(() => setErrors({}), FLASH_MS);
      return;
    }
    try {
      setSaving(true);
      const data = await projectRequest("admin", "POST", "/create-technology", {
        json: { title: title.trim(), assignedTo, workItemIds: picked },
      });
      onSaved(data.project, data.message);
    } catch (err) {
      flashError(err?.message || "The project could not be created. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-label="Create Technologies project">
      <form onSubmit={submit} noValidate className="flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        {/* header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-100 text-teal-700">
              <Cpu size={20} />
            </span>
            <div>
              <h2 className="text-xl font-black text-slate-900">Create Technologies Project</h2>
              <p className="mt-1 text-xs text-slate-500">Choose the staff member, pick a domain, and tick the work to allocate. It appears on their dashboard straight away.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="rounded-xl bg-slate-100 p-2.5 text-slate-500 hover:bg-slate-200 disabled:opacity-50" aria-label="Close form">
            <X size={18} />
          </button>
        </div>

        {flash && <FlashBanner flash={flash} onClose={clear} className="mx-6 mt-4" />}

        {/* body */}
        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
          <Step n={1} label="Project Title" required htmlFor="tf-title" error={errors.title}>
            <input
              id="tf-title"
              ref={titleRef}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                clearError("title");
              }}
              maxLength={120}
              placeholder="Enter project title"
              aria-invalid={Boolean(errors.title)}
              className={fieldCls(errors.title)}
            />
          </Step>

          <Step n={2} label="Staff" required htmlFor="tf-staff" error={errors.assignedTo} hint="Only staff already created by the admin are listed.">
            <select
              id="tf-staff"
              ref={staffRef}
              value={assignedTo}
              onChange={(e) => {
                setAssignedTo(e.target.value);
                clearError("assignedTo");
              }}
              aria-invalid={Boolean(errors.assignedTo)}
              className={fieldCls(errors.assignedTo)}
            >
              <option value="">Select staff...</option>
              {staff.map((u) => (
                <option key={u._id} value={u._id}>
                  {u.name}
                  {u.role ? ` - ${u.role}` : ""}
                </option>
              ))}
            </select>
          </Step>

          <Step n={3} label="Domain" hint="Click a domain to see only its work items. Ticks are kept when you switch domain.">
            {!catalog && !catalogError && (
              <p className="flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-400">
                <Loader2 size={16} className="animate-spin" /> Loading domains...
              </p>
            )}
            {catalogError && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" role="alert">
                <span>{catalogError}</span>
                <button type="button" onClick={loadCatalog} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-bold hover:bg-red-100">
                  <RefreshCw size={13} /> Retry
                </button>
              </div>
            )}
            {catalog && (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Domain">
                {catalog.domains.map((d) => {
                  const active = domain === d;
                  const n = pickedIn(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDomain(d)}
                      aria-pressed={active}
                      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold transition ${active ? `${DOMAIN_SOLID[d]} shadow` : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"}`}
                    >
                      {d}
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${active ? "bg-white/25 text-white" : "bg-slate-100 text-slate-500"}`}>{countIn(d)}</span>
                      {n > 0 && <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${active ? "bg-white text-slate-800" : "bg-teal-600 text-white"}`}>{n} ✓</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </Step>

          {catalog && (
            <Step n={4} label="Work items" required error={errors.items} hint={domain ? undefined : "Pick a domain above to see its work items."}>
              {domain && (
                <div ref={itemsRef} tabIndex={-1} className="rounded-2xl border border-slate-200 bg-white outline-none">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-2.5">
                    <p className="text-xs font-black text-slate-500">
                      {domain} · {shown.length} work item{shown.length === 1 ? "" : "s"}
                    </p>
                    <button type="button" onClick={toggleAllShown} className="text-xs font-bold text-teal-700 hover:underline">
                      {allShownPicked ? "Clear all" : "Select all"}
                    </button>
                  </div>
                  <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto" aria-label={`${domain} work items`}>
                    {shown.map((i) => {
                      const on = picked.includes(i.id);
                      return (
                        <li key={i.id}>
                          <label className={`flex cursor-pointer items-start gap-3 px-4 py-3 text-sm transition ${on ? "bg-teal-50/70" : "hover:bg-slate-50"}`}>
                            <input type="checkbox" checked={on} onChange={() => toggle(i.id)} className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-teal-600" />
                            <span className="flex-1 font-semibold text-slate-800">{i.title}</span>
                            <span className="shrink-0 text-[10px] font-black text-slate-300">#{i.id}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </Step>
          )}

          {/* summary */}
          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4" aria-label="Project summary">
            <div className="mb-1 flex items-center gap-2">
              <ListChecks size={17} className="text-teal-600" />
              <h3 className="text-sm font-black text-slate-700">Project Summary</h3>
            </div>
            <p className="mb-3 text-xs text-slate-400">A preview of what will be created. Nothing is saved until you press the button below.</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-[10px] font-black uppercase text-slate-400">Assigned to</p>
                <p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-slate-700">
                  <UserRound size={14} className="text-teal-600" />
                  {assignee?.name || <span className="font-semibold text-slate-400">Not selected yet</span>}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-[10px] font-black uppercase text-slate-400">Work items</p>
                <p className="mt-1 text-sm font-bold text-slate-700">{picked.length ? `${picked.length} selected` : <span className="font-semibold text-slate-400">None yet</span>}</p>
              </div>
            </div>
            {summaryDomains.length > 0 && (
              <div className="mt-3 space-y-2.5">
                {summaryDomains.map((d) => (
                  <div key={d}>
                    <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-black ${DOMAIN_STYLE[d]}`}>{d}</span>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {pickedItems
                        .filter((i) => i.domain === d)
                        .map((i) => (
                          <span key={i.id} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white py-1 pl-2.5 pr-1 text-xs font-semibold text-slate-700">
                            {i.title}
                            <button type="button" onClick={() => toggle(i.id)} className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-red-600" aria-label={`Remove ${i.title}`}>
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* footer */}
        <div className="flex flex-col-reverse gap-3 border-t border-slate-100 bg-white px-6 py-4 sm:flex-row">
          <button type="button" onClick={onClose} disabled={saving} className="flex-1 rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            Cancel
          </button>
          <button type="submit" disabled={saving || (!catalog && !catalogError)} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-teal-600 px-5 py-3 text-sm font-bold text-white shadow-lg hover:bg-teal-700 disabled:opacity-60">
            {saving ? (
              <>
                <Loader2 size={17} className="animate-spin" /> Creating...
              </>
            ) : (
              <>
                <Plus size={18} /> Create Project
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}