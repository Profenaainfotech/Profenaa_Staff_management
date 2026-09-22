// Create / edit a project (admin).
//
// Fields, in this order:
//   1 Project title *          2 Error / change required *      3 Description *
//   4 Images (optional, up to 10)     5 Assign to (optional)      6 Validity time *
// ...then a Project Summary that shows exactly what will be created.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, Image as ImageIcon, Layers, Loader2, Plus, Save, Target, Trash2, Upload, UserRound, X } from "lucide-react";
import { FlashBanner } from "./Flash";
import { FLASH_MS, useFlash } from "./useFlash";
import { IMAGE_TYPES, MAX_IMAGES, MAX_IMAGE_MB, TYPE_STYLE, daysFromNow, fmtDateTime, imageUrl, projectImages, projectRequest, timeLeft, toLocalInput } from "./projectApi";

const PRESETS = [
  ["1", "1 day"],
  ["2", "2 days"],
  ["3", "3 days"],
  ["5", "5 days"],
  ["7", "7 days (1 week)"],
  ["10", "10 days"],
  ["15", "15 days"],
  ["30", "30 days"],
];

/** The moment the project stops being valid, from what is chosen in the form */
function dueFrom(validity, customDue, project) {
  if (validity === "keep") return project?.dueDate ? new Date(project.dueDate) : null;
  if (validity === "custom") {
    const d = new Date(customDue);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return daysFromNow(Number(validity));
}

const fieldCls = (bad) =>
  `w-full rounded-xl border px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 ${
    bad ? "border-red-400 bg-red-50/40 focus:ring-red-200" : "border-slate-200 bg-slate-50 focus:border-blue-400 focus:ring-blue-100"
  }`;

function Step({ n, label, required, hint, error, children, htmlFor }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="flex items-center gap-2 text-sm font-black text-slate-800 mb-2">
        <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[10px] flex items-center justify-center">{n}</span>
        {label}
        {required ? <span className="text-red-500">*</span> : <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">optional</span>}
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

export default function ProjectFormModal({ mode = "create", project = null, defaultType = "Internal", users = [], onClose, onSaved }) {
  const editing = mode === "edit";
  // once somebody has started the project, who holds it can no longer be changed here
  const assignmentLocked = editing && project?.status !== "Pending";

  const [type, setType] = useState(project?.projectType || defaultType);
  const [f, setF] = useState(() => ({
    title: project?.title || "",
    issueDetails: project?.issueDetails || "",
    description: project?.description || "",
    assignedTo: project?.assignedTo?._id || (typeof project?.assignedTo === "string" ? project.assignedTo : "") || "",
    validity: editing ? "keep" : "7",
    customDue: toLocalInput(daysFromNow(7)),
  }));
  const [kept, setKept] = useState(() => (editing ? projectImages(project) : [])); // stored images still on the project
  const [removed, setRemoved] = useState([]);
  const [added, setAdded] = useState([]); // { file, url } waiting to be uploaded
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const { flash, error: flashError, clear } = useFlash();
  const errTimer = useRef(null);
  const addedRef = useRef([]);
  const nextId = useRef(0);
  const titleRef = useRef(null);
  const issueRef = useRef(null);
  const descRef = useRef(null);
  const validityRef = useRef(null);

  useEffect(() => {
    addedRef.current = added; // remembered so the previews can be released when the form closes
  }, [added]);
  useEffect(
    () => () => {
      clearTimeout(errTimer.current);
      addedRef.current.forEach((a) => URL.revokeObjectURL(a.url));
    },
    []
  );
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saving, onClose]);

  const set = (k) => (e) => {
    const value = e.target.value;
    setF((c) => ({ ...c, [k]: value }));
    setErrors((c) => {
      if (!c[k]) return c;
      const { [k]: _gone, ...rest } = c;
      return rest;
    });
  };

  const due = useMemo(() => dueFrom(f.validity, f.customDue, project), [f.validity, f.customDue, project]);
  const imageCount = kept.length + added.length;
  const assignee = users.find((u) => String(u._id) === String(f.assignedTo));

  const addFiles = (list) => {
    const room = MAX_IMAGES - imageCount;
    const ok = [];
    let problem = "";
    for (const file of [...list]) {
      if (!IMAGE_TYPES.includes(file.type)) {
        problem = `"${file.name}" is not a JPG, PNG or WEBP image.`;
        continue;
      }
      if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
        problem = `"${file.name}" is larger than ${MAX_IMAGE_MB} MB.`;
        continue;
      }
      if (ok.length >= room) {
        problem = `You can add at most ${MAX_IMAGES} images.`;
        break;
      }
      ok.push({ id: `${Date.now()}-${nextId.current++}`, file, url: URL.createObjectURL(file) });
    }
    if (problem) flashError(problem);
    if (ok.length) setAdded((c) => [...c, ...ok]);
  };

  const validate = () => {
    const e = {};
    const t = f.title.trim();
    if (t.length < 3) e.title = "Project title is required (at least 3 characters).";
    else if (t.length > 120) e.title = "Project title is too long (maximum 120 characters).";
    if (f.issueDetails.trim().length < 5) e.issueDetails = "Describe the error or change that has to be made (at least 5 characters).";
    if (f.description.trim().length < 10) e.description = "Project description is required (at least 10 characters).";
    const d = dueFrom(f.validity, f.customDue, project);
    if (!d) e.validity = "Choose the validity time.";
    else if (f.validity !== "keep" && d.getTime() < Date.now() + 60 * 1000) e.validity = "The validity time must be in the future.";
    return e;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    if (saving) return;
    const e = validate();
    const first = ["title", "issueDetails", "description", "validity"].find((k) => e[k]);
    if (first) {
      setErrors(e);
      flashError(e[first]);
      ({ title: titleRef, issueDetails: issueRef, description: descRef, validity: validityRef })[first].current?.focus();
      clearTimeout(errTimer.current);
      errTimer.current = setTimeout(() => setErrors({}), FLASH_MS); // the red marks fade with the message
      return;
    }

    try {
      setSaving(true);
      const fd = new FormData();
      fd.append("title", f.title.trim());
      fd.append("issueDetails", f.issueDetails.trim());
      fd.append("description", f.description.trim());
      fd.append("projectType", type);
      fd.append("dueDate", dueFrom(f.validity, f.customDue, project).toISOString());
      if (editing) {
        if (!assignmentLocked) fd.append("assignedTo", f.assignedTo || "");
        fd.append("removeImages", JSON.stringify(removed));
      } else if (f.assignedTo) {
        fd.append("assignedTo", f.assignedTo);
      }
      added.forEach(({ file }) => fd.append("images", file, file.name));

      const data = await projectRequest("admin", editing ? "PUT" : "POST", editing ? `/${project._id}` : "/create-project", { form: fd });
      onSaved(data.project, data.message);
    } catch (err) {
      // any failure - network, server or while preparing the images - is always shown, never silent
      flashError(err?.message || "The project could not be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const left = due ? timeLeft(due) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3 sm:p-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={editing ? "Edit project" : "Create project"}>
      <form onSubmit={submit} noValidate className="flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        {/* header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div>
            <h2 className="text-xl font-black text-slate-900">{editing ? `Edit ${type} Project` : `Create New ${type} Project`}</h2>
            <p className="mt-1 text-xs text-slate-500">
              {editing ? "Change any detail. Staff see the update straight away." : "Fill in the details below. The project appears as a card for the staff as soon as it is created."}
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="rounded-xl bg-slate-100 p-2.5 text-slate-500 hover:bg-slate-200 disabled:opacity-50" aria-label="Close form">
            <X size={18} />
          </button>
        </div>

        {flash && <FlashBanner flash={flash} onClose={clear} className="mx-6 mt-4" />}

        {/* body */}
        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
          <div>
            <span className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-400">Project type</span>
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1" role="group" aria-label="Project type">
              {["Internal", "External"].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  aria-pressed={type === t}
                  className={`rounded-lg px-5 py-2 text-sm font-bold transition ${type === t ? (t === "Internal" ? "bg-blue-600 text-white shadow" : "bg-violet-600 text-white shadow") : "text-slate-500 hover:text-slate-800"}`}
                >
                  {t}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-slate-400">The card is stored only under {type} projects.</p>
          </div>

          <Step n={1} label="Project Title" required htmlFor="pf-title" error={errors.title}>
            <input id="pf-title" ref={titleRef} value={f.title} onChange={set("title")} maxLength={120} placeholder="Enter project title" aria-invalid={Boolean(errors.title)} className={fieldCls(errors.title)} />
          </Step>

          <Step n={2} label="Error / change required" required htmlFor="pf-issue" error={errors.issueDetails} hint="What exactly is wrong, or what must be changed? Staff read this first.">
            <textarea id="pf-issue" ref={issueRef} value={f.issueDetails} onChange={set("issueDetails")} rows={3} maxLength={1000} placeholder="e.g. The Submit button does nothing on Safari. Change the click handler so it also works on touch devices." aria-invalid={Boolean(errors.issueDetails)} className={fieldCls(errors.issueDetails)} />
          </Step>

          <Step n={3} label="Description" required htmlFor="pf-desc" error={errors.description}>
            <textarea id="pf-desc" ref={descRef} value={f.description} onChange={set("description")} rows={4} maxLength={2000} placeholder="Enter project description" aria-invalid={Boolean(errors.description)} className={fieldCls(errors.description)} />
          </Step>

          <Step n={4} label="Images" hint={`JPG, PNG or WEBP · up to ${MAX_IMAGES} images · ${MAX_IMAGE_MB} MB each. The first image is the card cover.`}>
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                addFiles(e.dataTransfer.files);
              }}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-8 text-center transition ${dragging ? "border-blue-500 bg-blue-50" : "border-blue-200 bg-blue-50/30 hover:bg-blue-50/60"} ${imageCount >= MAX_IMAGES ? "pointer-events-none opacity-50" : ""}`}
            >
              <input type="file" accept={IMAGE_TYPES.join(",")} multiple className="sr-only" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} aria-label="Add project images" />
              <span className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-100 text-blue-600"><Upload size={20} /></span>
              <span className="text-sm font-black text-slate-800">Click to add images, or drop them here</span>
              <span className="mt-1 text-xs text-slate-400">{imageCount} of {MAX_IMAGES} added</span>
            </label>

            {imageCount > 0 && (
              <ul className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-5" aria-label="Project images">
                {kept.map((p, i) => (
                  <li key={p} className="group relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                    <img src={imageUrl(p)} alt={`Project image ${i + 1}`} className="h-full w-full object-cover" />
                    {i === 0 && <span className="absolute left-1.5 top-1.5 rounded-md bg-blue-600 px-1.5 py-0.5 text-[9px] font-black text-white">COVER</span>}
                    <button type="button" onClick={() => { setKept((c) => c.filter((x) => x !== p)); setRemoved((c) => [...c, p]); }} className="absolute right-1.5 top-1.5 rounded-lg bg-white/90 p-1 text-red-600 shadow hover:bg-white" aria-label={`Remove image ${i + 1}`}>
                      <Trash2 size={13} />
                    </button>
                  </li>
                ))}
                {added.map((a, i) => (
                  <li key={a.id} className="relative aspect-square overflow-hidden rounded-xl border border-emerald-200 bg-slate-100">
                    <img src={a.url} alt={`New image ${i + 1}`} className="h-full w-full object-cover" />
                    <span className="absolute left-1.5 top-1.5 rounded-md bg-emerald-600 px-1.5 py-0.5 text-[9px] font-black text-white">{kept.length === 0 && i === 0 ? "COVER" : "NEW"}</span>
                    <button type="button" onClick={() => { URL.revokeObjectURL(a.url); setAdded((c) => c.filter((x) => x !== a)); }} className="absolute right-1.5 top-1.5 rounded-lg bg-white/90 p-1 text-red-600 shadow hover:bg-white" aria-label={`Remove new image ${i + 1}`}>
                      <X size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Step>

          <Step n={5} label="Assign project to" htmlFor="pf-assign" hint={assignmentLocked ? `Locked: this project is ${project.status.toLowerCase()} with ${project.assignedToName || "someone"}.` : "Leave empty to put it in the project pool. Staff can then take it themselves."}>
            <select id="pf-assign" value={f.assignedTo} onChange={set("assignedTo")} disabled={assignmentLocked} className={fieldCls(false)}>
              <option value="">Project pool (staff can take it)</option>
              {users.filter((u) => u.isActive !== false).map((u) => (
                <option key={u._id} value={u._id}>
                  {u.name}
                  {u.role ? ` - ${u.role}` : ""}
                </option>
              ))}
            </select>
          </Step>

          <Step n={6} label="Validity time" required htmlFor="pf-validity" error={errors.validity} hint="How long the project stays valid. Staff who finish before it ends score on-time points.">
            <div className="grid gap-3 sm:grid-cols-2">
              <select id="pf-validity" ref={validityRef} value={f.validity} onChange={set("validity")} aria-invalid={Boolean(errors.validity)} className={fieldCls(errors.validity)}>
                {editing && <option value="keep">Keep current ({fmtDateTime(project?.dueDate)})</option>}
                {PRESETS.map(([v, label]) => (
                  <option key={v} value={v}>{label} from now</option>
                ))}
                <option value="custom">Choose a date and time...</option>
              </select>
              {f.validity === "custom" && (
                <input type="datetime-local" value={f.customDue} onChange={set("customDue")} min={toLocalInput(new Date())} aria-label="Validity date and time" className={fieldCls(errors.validity)} />
              )}
            </div>
          </Step>

          {/* summary */}
          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4" aria-label="Project summary">
            <div className="mb-1 flex items-center gap-2">
              <Target size={17} className="text-blue-600" />
              <h3 className="text-sm font-black text-slate-700">Project Summary</h3>
            </div>
            <p className="mb-3 text-xs text-slate-400">A preview of what will be created. Nothing is saved until you press the button below.</p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {[
                ["Stored under", <span key="t" className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-black ${TYPE_STYLE[type]}`}>{type} projects</span>],
                ["Assignment", f.assignedTo ? <span key="a" className="flex items-center gap-1.5"><UserRound size={14} className="text-blue-600" />{assignee?.name || "Selected staff"}</span> : <span key="p" className="flex items-center gap-1.5"><Layers size={14} className="text-purple-600" />Project pool</span>],
                ["Images", <span key="i" className="flex items-center gap-1.5"><ImageIcon size={14} className="text-slate-500" />{imageCount ? `${imageCount} selected` : "None (optional)"}</span>],
                ["Valid until", <span key="v" className="flex items-center gap-1.5"><CalendarClock size={14} className="text-slate-500" />{due ? fmtDateTime(due) : "Not set"}{left && <em className="not-italic text-[10px] font-bold text-slate-400">({left.label})</em>}</span>],
                ["Status", <span key="s" className="text-amber-600">{editing ? project.status : "Pending"}</span>],
                ["Error / change", <span key="e" className="line-clamp-2 text-xs font-semibold">{f.issueDetails.trim() || "Not filled in yet"}</span>],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-[10px] font-black uppercase text-slate-400">{k}</p>
                  <div className="mt-1 text-sm font-bold text-slate-700">{v}</div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* footer */}
        <div className="flex flex-col-reverse gap-3 border-t border-slate-100 bg-white px-6 py-4 sm:flex-row">
          <button type="button" onClick={onClose} disabled={saving} className="flex-1 rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            Cancel
          </button>
          <button type="submit" disabled={saving} className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white shadow-lg disabled:opacity-60 ${type === "Internal" ? "bg-blue-600 hover:bg-blue-700" : "bg-violet-600 hover:bg-violet-700"}`}>
            {saving ? (
              <>
                <Loader2 size={17} className="animate-spin" /> {editing ? "Saving..." : "Creating..."}
              </>
            ) : editing ? (
              <>
                <Save size={17} /> Save changes
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
