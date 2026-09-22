// Admin "Staff Directory": add / edit / deactivate / delete staff, assign branch + attendance mode, bulk actions.
import React, { useEffect, useMemo, useState } from "react";
import { KeyRound, Pencil, Power, Search, Trash2, UsersRound, Wifi } from "lucide-react";
import { useAsync } from "../../lib/hooks";
import { fmtTime } from "../../lib/format";
import { Badge, Button, Card, Empty, ErrorNote, Field, Modal, PageHeader, Select, Spinner, Stat, StatusBadge, Table, TextInput, Themed, useApi, useConfirm, useToast } from "./ui";

const BLANK = { name: "", mobile: "", password: "", role: "", department: "", employeeCode: "", email: "", joiningDate: "", shiftStart: "09:30", shiftEnd: "18:30", branchId: "", attendanceMode: "" };

function StaffModal({ person, branches, onClose, onDone }) {
  const api = useApi();
  const toast = useToast();
  const editing = Boolean(person);
  const [f, setF] = useState(
    editing
      ? { ...BLANK, name: person.name, mobile: person.mobile, role: person.role || "", department: person.department || "", employeeCode: person.employeeCode || "", email: person.email || "", joiningDate: person.joiningDate || "", shiftStart: person.shift?.start || "09:30", shiftEnd: person.shift?.end || "18:30", branchId: person.branch?.id || "", attendanceMode: person.mode }
      : BLANK
  );
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const go = async () => {
    setBusy(true);
    try {
      const body = { ...f };
      if (!body.attendanceMode) delete body.attendanceMode;
      if (editing && !body.password) delete body.password;
      if (editing) await api.put(`/api/staff/${person.userId}`, body);
      else await api.post("/api/staff", body);
      toast(editing ? "Staff member updated" : "Staff member added");
      onDone();
      onClose();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const wifiNoBranch = (f.attendanceMode === "WIFI" || (!f.attendanceMode && f.branchId)) && !f.branchId;
  const ready = f.name.trim() && f.mobile.trim() && f.role.trim() && (editing || f.password.length >= 6) && !wifiNoBranch;

  return (
    <Modal open onClose={onClose} size="lg" title={editing ? `Edit ${person.name}` : "Create staff member"}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={go} loading={busy} disabled={!ready}>{editing ? "Save changes" : "Create staff"}</Button></>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Username (used to log in) *"><TextInput value={f.name} onChange={set("name")} /></Field>
        <Field label="Mobile *"><TextInput value={f.mobile} onChange={set("mobile")} inputMode="tel" /></Field>
        <Field label={editing ? "New password" : "Password *"} hint={editing ? "Leave blank to keep the current password" : "At least 6 characters"}><TextInput type="password" value={f.password} onChange={set("password")} autoComplete="new-password" /></Field>
        <Field label="Job role *"><TextInput value={f.role} onChange={set("role")} placeholder="Developer" /></Field>
        <Field label="Department"><TextInput value={f.department} onChange={set("department")} /></Field>
        <Field label="Employee code"><TextInput value={f.employeeCode} onChange={set("employeeCode")} /></Field>
        <Field label="Email"><TextInput type="email" value={f.email} onChange={set("email")} /></Field>
        <Field label="Joining date" hint="No absences are counted before this date"><TextInput type="date" value={f.joiningDate} onChange={set("joiningDate")} /></Field>
        <Field label="Shift start"><TextInput type="time" value={f.shiftStart} onChange={set("shiftStart")} /></Field>
        <Field label="Shift end"><TextInput type="time" value={f.shiftEnd} onChange={set("shiftEnd")} /></Field>
        <Field label="Branch"><Select value={f.branchId} onChange={set("branchId")}><option value="">No branch</option>{branches.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}</Select></Field>
        <Field label="Attendance mode" hint={wifiNoBranch ? "Wi-Fi attendance needs a branch" : f.attendanceMode === "CRM_LOGIN" ? "Attendance starts when they log in to the CRM" : "Automatic from the office Wi-Fi"}>
          <Select value={f.attendanceMode} onChange={set("attendanceMode")}>
            <option value="">{editing ? "Keep as is" : f.branchId ? "Office Wi-Fi (default)" : "CRM login (default)"}</option>
            <option value="WIFI">Office Wi-Fi (automatic)</option>
            <option value="CRM_LOGIN">CRM login</option>
          </Select>
        </Field>
      </div>
    </Modal>
  );
}

function BulkModal({ ids, branches, onClose, onDone }) {
  const api = useApi();
  const toast = useToast();
  const [f, setF] = useState({ attendanceMode: "", branchId: "", isActive: "" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const go = async () => {
    setBusy(true);
    try {
      const body = { userIds: ids };
      if (f.attendanceMode) body.attendanceMode = f.attendanceMode;
      if (f.branchId) body.branchId = f.branchId;
      if (f.isActive) body.isActive = f.isActive === "true";
      const r = await api.post("/api/staff/bulk", body);
      toast(`${r.modified} updated${r.skipped.length ? `, ${r.skipped.length} skipped (no branch)` : ""}`, r.skipped.length ? "error" : "success");
      onDone();
      onClose();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} size="sm" title={`Update ${ids.length} staff`} subtitle="Only the fields you choose are changed."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={go} loading={busy} disabled={!f.attendanceMode && !f.branchId && !f.isActive}>Apply</Button></>}>
      <div className="space-y-4">
        <Field label="Attendance mode"><Select value={f.attendanceMode} onChange={set("attendanceMode")}><option value="">No change</option><option value="WIFI">Office Wi-Fi (automatic)</option><option value="CRM_LOGIN">CRM login</option></Select></Field>
        <Field label="Branch"><Select value={f.branchId} onChange={set("branchId")}><option value="">No change</option>{branches.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}</Select></Field>
        <Field label="Account"><Select value={f.isActive} onChange={set("isActive")}><option value="">No change</option><option value="true">Active</option><option value="false">Deactivated</option></Select></Field>
      </div>
    </Modal>
  );
}

function PasswordModal({ person, onClose }) {
  const api = useApi();
  const toast = useToast();
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { await api.post(`/api/staff/${person.userId}/reset-password`, { password: pw }); toast("Password updated"); onClose(); }
    catch (e) { toast(e.message, "error"); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} size="sm" title={`Reset password`} subtitle={person.name}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={go} loading={busy} disabled={pw.length < 6}>Update password</Button></>}>
      <Field label="New password" hint="At least 6 characters. The employee is notified."><TextInput type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></Field>
    </Modal>
  );
}

function Body({ addSignal = 0 }) {
  const api = useApi();
  const toast = useToast();
  const [confirm, ask] = useConfirm();
  const [q, setQ] = useState("");
  const [branchId, setBranchId] = useState("");
  const [mode, setMode] = useState("");
  const [status, setStatus] = useState("active");
  const [selected, setSelected] = useState(new Set());
  const [modal, setModal] = useState(null); // {type:'edit'|'new'|'bulk'|'pw', person}
  // the dashboard header's "Create Staff" button opens this same form
  useEffect(() => { if (addSignal) setModal({ type: "new" }); }, [addSignal]);

  const branches = useAsync(() => api.get("/api/branches"), []);
  const staff = useAsync(() => api.get("/api/staff", { branchId, mode, status }), [branchId, mode, status]);
  const all = useMemo(() => staff.data?.staff || [], [staff.data]);
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? all.filter((r) => [r.name, r.mobile, r.role, r.department, r.employeeCode, r.email].some((v) => String(v || "").toLowerCase().includes(n))) : all;
  }, [all, q]);
  const branchList = branches.data?.branches || [];

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.userId));
  const toggle = (id) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const done = () => { staff.reload({ silent: true }); setSelected(new Set()); };

  const toggleActive = (p) =>
    ask({
      title: p.isActive ? `Deactivate ${p.name}?` : `Reactivate ${p.name}?`,
      message: p.isActive ? "They can no longer log in and their attendance stops. History is kept." : "They can log in again and attendance resumes.",
      confirmLabel: p.isActive ? "Deactivate" : "Reactivate",
      danger: p.isActive,
      onYes: async () => { try { await api.put(`/api/staff/${p.userId}`, { isActive: !p.isActive }); toast(p.isActive ? "Deactivated" : "Reactivated"); done(); } catch (e) { toast(e.message, "error"); } },
    });
  const remove = (p) =>
    ask({
      title: `Delete ${p.name}?`,
      message: "This permanently removes the account, their devices and pending requests. Attendance history is kept. Consider deactivating instead.",
      confirmLabel: "Delete permanently",
      onYes: async () => { try { await api.del(`/api/staff/${p.userId}`); toast("Staff member deleted"); done(); } catch (e) { toast(e.message, "error"); } },
    });

  const wifiCount = all.filter((r) => r.mode === "WIFI").length;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5">
      {confirm}
      <PageHeader icon={<UsersRound size={20} />} title="Staff directory" subtitle="Accounts, branches and how each person's attendance is recorded." />
      <ErrorNote message={staff.error} onRetry={staff.reload} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Showing" value={rows.length} />
        <Stat label="Wi-Fi attendance" value={wifiCount} tone="green" />
        <Stat label="CRM-login attendance" value={all.length - wifiCount} tone="blue" />
        <Stat label="Wi-Fi without device" value={all.filter((r) => r.mode === "WIFI" && (!r.device || r.device.status !== "ACTIVE")).length} tone="amber" />
      </div>

      <Card padded={false}>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-4 border-b border-slate-100">
          <div className="relative md:col-span-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
            <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search staff" className="!pl-9" />
          </div>
          <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}><option value="">All branches</option>{branchList.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}</Select>
          <Select value={mode} onChange={(e) => setMode(e.target.value)}><option value="">Any attendance mode</option><option value="WIFI">Office Wi-Fi</option><option value="CRM_LOGIN">CRM login</option></Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}><option value="active">Active</option><option value="inactive">Deactivated</option><option value="all">All</option></Select>
        </div>

        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-sky-50 border-b border-sky-100">
            <span className="text-xs font-bold text-blue-900">{selected.size} selected</span>
            <Button size="sm" onClick={() => setModal({ type: "bulk" })}><Wifi size={12} /> Change mode / branch / status</Button>
            <button onClick={() => setSelected(new Set())} className="text-[11px] font-semibold text-slate-500 hover:underline">Clear</button>
          </div>
        )}

        {staff.loading && !staff.data ? <Spinner /> : rows.length === 0 ? (
          <Empty icon={<UsersRound size={20} />} title="No staff found" hint="Adjust the filters or add a staff member." />
        ) : (
          <Table head={["", "Employee", "Contact", "Branch", "Attendance mode", "Shift", "Device", "Today", ""]} className="!border-0 !rounded-none">
            {rows.map((p) => (
              <tr key={p.userId} className={p.isActive ? "" : "opacity-60"}>
                <td className="px-4 py-3"><input type="checkbox" checked={selected.has(p.userId)} onChange={() => toggle(p.userId)} aria-label={`Select ${p.name}`} /></td>
                <td className="px-4 py-3">
                  <p className="font-bold text-slate-800 flex items-center gap-2">{p.name}{!p.isActive && <Badge tone="red">Deactivated</Badge>}</p>
                  <p className="text-[10px] text-slate-400">{[p.role, p.department, p.employeeCode].filter(Boolean).join(" · ")}</p>
                </td>
                <td className="px-4 py-3 text-slate-600"><p>{p.mobile}</p><p className="text-[10px] text-slate-400">{p.email}</p></td>
                <td className="px-4 py-3 text-slate-600">{p.branch?.name || <span className="text-slate-300">--</span>}</td>
                <td className="px-4 py-3"><Badge tone={p.mode === "WIFI" ? "green" : "blue"}>{p.mode === "WIFI" ? "Office Wi-Fi" : "CRM login"}</Badge></td>
                <td className="px-4 py-3 whitespace-nowrap text-slate-600">{p.shift.start} – {p.shift.end}</td>
                <td className="px-4 py-3">{p.mode !== "WIFI" ? <span className="text-slate-300">n/a</span> : !p.device ? <Badge tone="red">None</Badge> : <Badge tone={p.device.status === "ACTIVE" ? "green" : "amber"}>{p.device.status === "ACTIVE" ? "Active" : "Pending"}</Badge>}</td>
                <td className="px-4 py-3 whitespace-nowrap"><StatusBadge code={p.display} overdue={p.overdue} label={p.label} />{p.checkIn && <span className="block text-[10px] text-slate-400">in {fmtTime(p.checkIn)}</span>}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button onClick={() => setModal({ type: "edit", person: p })} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100" title="Edit" aria-label="Edit"><Pencil size={14} /></button>
                  <button onClick={() => setModal({ type: "pw", person: p })} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100" title="Reset password" aria-label="Reset password"><KeyRound size={14} /></button>
                  <button onClick={() => toggleActive(p)} className={`p-1.5 rounded-lg hover:bg-slate-100 ${p.isActive ? "text-amber-500" : "text-emerald-600"}`} title={p.isActive ? "Deactivate" : "Reactivate"} aria-label="Toggle active"><Power size={14} /></button>
                  <button onClick={() => remove(p)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50" title="Delete" aria-label="Delete"><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </Table>
        )}
        {rows.length > 0 && (
          <label className="flex items-center gap-2 px-4 py-3 border-t border-slate-100 text-[11px] text-slate-500 cursor-pointer">
            <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.userId)))} /> Select all {rows.length} shown
          </label>
        )}
      </Card>

      {modal?.type === "new" && <StaffModal branches={branchList} onClose={() => setModal(null)} onDone={done} />}
      {modal?.type === "edit" && <StaffModal person={modal.person} branches={branchList} onClose={() => setModal(null)} onDone={done} />}
      {modal?.type === "bulk" && <BulkModal ids={[...selected]} branches={branchList} onClose={() => setModal(null)} onDone={done} />}
      {modal?.type === "pw" && <PasswordModal person={modal.person} onClose={() => setModal(null)} />}
    </div>
  );
}

export default function StaffDirectory({ addSignal = 0 }) {
  return <Themed role="admin"><Body addSignal={addSignal} /></Themed>;
}
