// Create a Technologies project (admin).
//
//   1 Project title      2 Projects (domain)   Sales / Training / Marketing / Placement / HR / Social Media
//                         - clicking one shows ONLY that one's work items - "+" adds a new one
//   3 Work items          tick one or more (ticks are kept when switching) - "+" adds a custom one
//   4 Staff                one or more (only staff the admin already created)
// ...then a summary of exactly what will be allocated.
//
// The domains and the 23 work items come from the server (GET /technology-catalog), so the
// list lives in one place: crm-backend/src/Utils/technologyCatalog.js. A "+" typed in here
// adds a custom domain or work item for THIS allocation only (not saved back to that shared
// catalog) - handy for a one-off addition without editing the source file.
// Saving creates one project per selected staff member, straight into their tasks.
// Nothing on this form is mandatory (temporary, per request) - only format limits still apply.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Cpu, ListChecks, Loader2, Pencil, Plus, RefreshCw, Trash2, UserRound, X } from "lucide-react";
import { FlashBanner } from "./Flash";
import { useFlash } from "./useFlash";
import { DOMAIN_SOLID, DOMAIN_STYLE, projectRequest } from "./projectApi";

const fieldCls = (bad) =>
  `w-full rounded-xl border px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 ${
    bad ? "border-red-400 bg-red-50/40 focus:ring-red-200" : "border-slate-200 bg-slate-50 focus:border-teal-400 focus:ring-teal-100"
  }`;
const NEUTRAL_CHIP = "bg-slate-700 text-white";

function Step({ n, label, hint, error, children, htmlFor }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-2 flex items-center gap-2 text-sm font-black text-slate-800">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-100 text-[10px] text-teal-700">{n}</span>
        {label}
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">optional</span>
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

/** A small "type a name, press Add" control, used for both the custom domain and the custom work item. */
function AddInline({ placeholder, onAdd }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const ref = useRef(null);
  useEffect(() => {
    if (open) ref.current?.focus();
  }, [open]);
  const commit = () => {
    const v = value.trim();
    if (v) onAdd(v);
    setValue("");
    setOpen(false);
  };
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-slate-300 px-4 py-2 text-sm font-bold text-slate-500 hover:border-teal-400 hover:text-teal-700"
      >
        <Plus size={15} /> Add new
      </button>
    );
  }
  return (
    <div className="inline-flex items-center gap-1.5">
      <input
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
          if (e.key === "Escape") {
            setValue("");
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        maxLength={120}
        className="rounded-full border border-teal-300 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-100"
      />
      <button type="button" onClick={commit} className="rounded-full bg-teal-600 p-2 text-white hover:bg-teal-700" aria-label="Add">
        <Check size={14} />
      </button>
      <button
        type="button"
        onClick={() => {
          setValue("");
          setOpen(false);
        }}
        className="rounded-full bg-slate-100 p-2 text-slate-500 hover:bg-slate-200"
        aria-label="Cancel"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export default function TechnologyFormModal({ users = [], onClose, onSaved }) {
  const [catalog, setCatalog] = useState(null); // { domains: [...], items: [{ id, title, domain }] }
  const [catalogError, setCatalogError] = useState("");
  const [customDomains, setCustomDomains] = useState([]); // domain names typed in here, not from the catalog
  const [customItemsByDomain, setCustomItemsByDomain] = useState({}); // { [domain]: [{ id, title, domain }] }
  const [editingItemId, setEditingItemId] = useState(null); // id of the work item currently being renamed
  const [editingItemText, setEditingItemText] = useState(""); // current text in the rename input
  const [localTitles, setLocalTitles] = useState({}); // { [id]: string } - overrides for catalog item titles (session only)
  const [title, setTitle] = useState("");
  const [assignedTo, setAssignedTo] = useState([]); // one or more staff ids
  const [domain, setDomain] = useState(""); // the domain whose items are on screen ("" = none picked yet)
  const [picked, setPicked] = useState([]); // ticked item ids, across every domain
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const { flash, error: flashError, clear } = useFlash();
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

  const catalogDomains = catalog?.domains || [];
  const allDomains = useMemo(() => [...catalogDomains, ...customDomains], [catalogDomains, customDomains]);
  const catalogItemList = catalog?.items || [];
  const customItemList = useMemo(() => Object.values(customItemsByDomain).flat(), [customItemsByDomain]);
  const items = useMemo(() => [...catalogItemList, ...customItemList], [catalogItemList, customItemList]);
  const shownRaw = useMemo(() => items.filter((i) => i.domain === domain), [items, domain]);
  const shown = useMemo(() => shownRaw.filter((i) => !hiddenItemIds.has(i.id)), [shownRaw, hiddenItemIds]);
  const pickedItems = useMemo(() => items.filter((i) => picked.includes(i.id)), [items, picked]);
  const countIn = (d) => items.filter((i) => i.domain === d).length;
  const pickedIn = (d) => pickedItems.filter((i) => i.domain === d).length;
  const staff = users.filter((u) => u.isActive !== false);
  const assignees = staff.filter((u) => assignedTo.includes(String(u._id)));
  const summaryDomains = allDomains.filter((d) => pickedIn(d) > 0);

  const addDomain = (name) => {
    if (allDomains.some((d) => d.toLowerCase() === name.toLowerCase())) {
      setDomain(allDomains.find((d) => d.toLowerCase() === name.toLowerCase()));
      return;
    }
    setCustomDomains((c) => [...c, name]);
    setDomain(name);
  };
  const addWorkItem = (text) => {
    const d = domain || allDomains[0];
    if (!d) return;
    const id = `custom-${Date.now()}`;
    setCustomItemsByDomain((c) => ({ ...c, [d]: [...(c[d] || []), { id, title: text, domain: d }] }));
    setPicked((c) => [...c, id]);
    if (!domain) setDomain(d);
    clearError("items");
  };

  // Undo a "+ Add new" - only ever for something typed in on this form (a catalog
  // project/work item is shared and never removable from here).
  const removeCustomDomain = (name) => {
    const idsUnderDomain = (customItemsByDomain[name] || []).map((i) => i.id);
    setCustomDomains((c) => c.filter((d) => d !== name));
    setCustomItemsByDomain((c) => {
      const { [name]: _gone, ...rest } = c;
      return rest;
    });
    setPicked((c) => c.filter((id) => !idsUnderDomain.includes(id)));
    if (domain === name) setDomain("");
  };
  const removeCustomWorkItem = (id, d) => {
    setCustomItemsByDomain((c) => ({ ...c, [d]: (c[d] || []).filter((i) => i.id !== id) }));
    setPicked((c) => c.filter((x) => x !== id));
  };

  // --- edit any work item title (session-only for catalog items) ---
  const startEditItem = (i) => {
    setEditingItemId(i.id);
    setEditingItemText(localTitles[i.id] ?? i.title);
  };
  const commitEditItem = () => {
    const text = editingItemText.trim();
    if (text && editingItemId !== null) {
      const isCustom = String(editingItemId).startsWith("custom-");
      if (isCustom) {
        // update in customItemsByDomain
        setCustomItemsByDomain((c) => {
          const next = { ...c };
          for (const d of Object.keys(next)) {
            next[d] = next[d].map((it) => it.id === editingItemId ? { ...it, title: text } : it);
          }
          return next;
        });
      } else {
        // catalog item: store override locally (not saved to backend)
        setLocalTitles((lt) => ({ ...lt, [editingItemId]: text }));
      }
    }
    setEditingItemId(null);
    setEditingItemText("");
  };

  // --- delete any work item (catalog items: just uncheck + hide for this session) ---
  const [hiddenItemIds, setHiddenItemIds] = useState(new Set()); // catalog items hidden for this session
  const deleteItem = (i) => {
    const isCustom = String(i.id).startsWith("custom-");
    if (isCustom) {
      removeCustomWorkItem(i.id, i.domain);
    } else {
      // hide catalog item for this session and uncheck it
      setHiddenItemIds((prev) => new Set([...prev, i.id]));
      setPicked((c) => c.filter((x) => x !== i.id));
    }
  };

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
  const toggleStaff = (id) => {
    const key = String(id);
    setAssignedTo((c) => (c.includes(key) ? c.filter((x) => x !== key) : [...c, key]));
    clearError("assignedTo");
  };

  const submit = async (ev) => {
    ev.preventDefault();
    if (saving) return;
    // Nothing here is mandatory (temporary, per request) - the only real check is that the
    // server needs at least one staff member and at least one work item to actually create
    // anything; everything else can be left blank.
    const e = {};
    if (!assignedTo.length) e.assignedTo = "Select at least one staff member, or nothing will be created.";
    if (!picked.length) e.items = "Tick at least one work item (or add a custom one), or nothing will be created.";
    if (Object.keys(e).length) {
      setErrors(e);
      flashError(Object.values(e)[0]);
      return;
    }
    try {
      setSaving(true);
      const customPicked = pickedItems.filter((i) => String(i.id).startsWith("custom-"));
      const data = await projectRequest("admin", "POST", "/create-technology", {
        json: {
          title: title.trim(),
          assignedTo,
          // catalog items that were renamed go as customItems (new title), NOT as workItemIds
          workItemIds: pickedItems.filter((i) => !String(i.id).startsWith("custom-") && !localTitles[i.id]).map((i) => i.id),
          customItems: [
            ...customPicked.map((i) => ({ title: localTitles[i.id] ?? i.title, domain: i.domain })),
            ...pickedItems.filter((i) => !String(i.id).startsWith("custom-") && localTitles[i.id]).map((i) => ({ title: localTitles[i.id], domain: i.domain })),
          ].filter((c) => c.title && c.domain),
        },
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
              <h2 className="text-xl font-black text-slate-900">Create Technologies / Education Project</h2>
              <p className="mt-1 text-xs text-slate-500">Pick a project, tick the work to allocate, and choose the staff member(s). It appears on their dashboard straight away.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="rounded-xl bg-slate-100 p-2.5 text-slate-500 hover:bg-slate-200 disabled:opacity-50" aria-label="Close form">
            <X size={18} />
          </button>
        </div>

        {flash && <FlashBanner flash={flash} onClose={clear} className="mx-6 mt-4" />}

        {/* body */}
        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
          <Step n={1} label="Project Title" htmlFor="tf-title">
            <input
              id="tf-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              placeholder="Enter project title"
              className={fieldCls(false)}
            />
          </Step>

          <Step n={2} label="Projects" hint="Click one to see only its work items. Ticks are kept when you switch. Add a new one with the button at the end.">
            {!catalog && !catalogError && (
              <p className="flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-400">
                <Loader2 size={16} className="animate-spin" /> Loading...
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
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Projects">
                {allDomains.map((d) => {
                  const active = domain === d;
                  const n = pickedIn(d);
                  const style = DOMAIN_SOLID[d] || NEUTRAL_CHIP;
                  const custom = customDomains.includes(d);
                  return (
                    <span
                      key={d}
                      className={`inline-flex items-center gap-1 rounded-full border py-1 pl-1 pr-1.5 transition ${active ? `${style} shadow` : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"}`}
                    >
                      <button
                        type="button"
                        onClick={() => setDomain(d)}
                        aria-pressed={active}
                        className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-bold ${active ? "text-white" : "text-slate-600"}`}
                      >
                        {d}
                        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${active ? "bg-white/25 text-white" : "bg-slate-100 text-slate-500"}`}>{countIn(d)}</span>
                        {n > 0 && <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${active ? "bg-white text-slate-800" : "bg-teal-600 text-white"}`}>{n} ✓</span>}
                      </button>
                      {custom && (
                        <button
                          type="button"
                          onClick={() => removeCustomDomain(d)}
                          className={`rounded-full p-1 ${active ? "text-white/80 hover:bg-white/20 hover:text-white" : "text-slate-400 hover:bg-red-50 hover:text-red-600"}`}
                          aria-label={`Remove the "${d}" project you added`}
                          title="Remove this - it was added on this form, not from the catalog"
                        >
                          <X size={13} />
                        </button>
                      )}
                    </span>
                  );
                })}
                <AddInline placeholder="New project name" onAdd={addDomain} />
              </div>
            )}
          </Step>

          {catalog && (
            <Step n={3} label="Work items" error={errors.items} hint={domain ? undefined : "Pick a project above, or add a custom work item directly."}>
              <div ref={itemsRef} tabIndex={-1} className="rounded-2xl border border-slate-200 bg-white outline-none">
                {domain && (
                  <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-2.5">
                    <p className="text-xs font-black text-slate-500">
                      {domain} · {shown.length} work item{shown.length === 1 ? "" : "s"}
                    </p>
                    {shown.length > 0 && (
                      <button type="button" onClick={toggleAllShown} className="text-xs font-bold text-teal-700 hover:underline">
                        {allShownPicked ? "Clear all" : "Select all"}
                      </button>
                    )}
                  </div>
                )}
                {shown.length > 0 && (
                  <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto" aria-label={`${domain} work items`}>
                    {shown.map((i) => {
                      const on = picked.includes(i.id);
                      const custom = String(i.id).startsWith("custom-");
                      const displayTitle = localTitles[i.id] ?? i.title;
                      const isEditing = editingItemId === i.id;
                      return (
                        <li key={i.id} className={`flex items-center gap-1 px-4 py-1 text-sm transition ${on ? "bg-teal-50/70" : "hover:bg-slate-50"}`}>
                          <label className="flex flex-1 cursor-pointer items-start gap-3 py-2">
                            <input type="checkbox" checked={on} onChange={() => toggle(i.id)} className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-teal-600" />
                            {isEditing ? (
                              <input
                                autoFocus
                                type="text"
                                value={editingItemText}
                                onChange={(e) => setEditingItemText(e.target.value)}
                                onBlur={commitEditItem}
                                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitEditItem(); } if (e.key === "Escape") { setEditingItemId(null); setEditingItemText(""); } }}
                                className="flex-1 rounded-lg border border-teal-300 px-2 py-0.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-100"
                                maxLength={120}
                              />
                            ) : (
                              <span className="flex-1 font-semibold text-slate-800">{displayTitle}</span>
                            )}
                            <span className="shrink-0 text-[10px] font-black text-slate-300">{custom ? "new" : `#${i.id}`}</span>
                          </label>
                          {!isEditing && (
                            <button
                              type="button"
                              onClick={() => startEditItem(i)}
                              className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-sky-50 hover:text-sky-600"
                              aria-label={`Rename "${displayTitle}"`}
                              title="Edit work item name"
                            >
                              <Pencil size={12} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => deleteItem(i)}
                            className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            aria-label={`Delete "${displayTitle}"`}
                            title={custom ? "Remove this custom item" : "Hide this item from the list"}
                          >
                            <Trash2 size={13} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className="px-4 py-3">
                  <AddInline placeholder="New work item name" onAdd={addWorkItem} />
                </div>
              </div>
            </Step>
          )}

          <Step n={4} label="Staff" error={errors.assignedTo} hint="Only staff already created by the admin are listed. Pick as many as need this allocation.">
            <div className="max-h-56 overflow-y-auto rounded-2xl border border-slate-200 bg-white">
              <ul className="divide-y divide-slate-100">
                {staff.map((u) => {
                  const on = assignedTo.includes(String(u._id));
                  return (
                    <li key={u._id}>
                      <label className={`flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm transition ${on ? "bg-teal-50/70" : "hover:bg-slate-50"}`}>
                        <input type="checkbox" checked={on} onChange={() => toggleStaff(u._id)} className="h-4 w-4 shrink-0 cursor-pointer accent-teal-600" />
                        <span className="flex-1 font-semibold text-slate-800">
                          {u.name}
                          {u.role ? <span className="font-normal text-slate-400"> - {u.role}</span> : ""}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          </Step>

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
                <p className="mt-1 text-sm font-bold text-slate-700">
                  {assignees.length ? (
                    <span className="flex flex-wrap items-center gap-1.5">
                      {assignees.map((u) => (
                        <span key={u._id} className="inline-flex items-center gap-1 rounded-lg bg-teal-50 px-2 py-0.5 text-xs text-teal-700">
                          <UserRound size={11} /> {u.name}
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className="font-semibold text-slate-400">None selected yet</span>
                  )}
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
                    <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-black ${DOMAIN_STYLE[d] || "border-slate-300 bg-slate-100 text-slate-700"}`}>{d}</span>
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