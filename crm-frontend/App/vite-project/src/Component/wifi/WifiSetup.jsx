// Admin "Wi-Fi Setup" tab:  Branches & networks | Devices | Rules
import React, { useEffect, useState } from "react";
import { Building2, Check, Laptop, Pencil, Plus, Router, Save, SlidersHorizontal, Trash2, TriangleAlert, X } from "lucide-react";
import { useAsync } from "../../lib/hooks";
import { fmtDateTime, timeAgo } from "../../lib/format";
import { Badge, Button, Card, Empty, ErrorNote, Field, Modal, PageHeader, Select, Spinner, Table, Tabs, TextInput, Themed, Toggle, useApi, useConfirm, useToast } from "./ui";

// ================================================================= branches
function BranchModal({ branch, onClose, onDone }) {
  const api = useApi();
  const toast = useToast();
  const [f, setF] = useState({ name: branch?.name || "", address: branch?.address || "", heartbeatInterval: branch?.heartbeatInterval || 90, gracePeriod: branch?.gracePeriod || 300 });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const go = async () => {
    setBusy(true);
    try {
      const body = { ...f, heartbeatInterval: Number(f.heartbeatInterval), gracePeriod: Number(f.gracePeriod) };
      if (branch?._id) await api.put(`/api/branches/${branch._id}`, body);
      else await api.post("/api/branches", body);
      toast(branch?._id ? "Branch updated" : "Branch created");
      onDone();
      onClose();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={branch?._id ? "Edit branch" : "Add branch"}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={go} loading={busy} disabled={!f.name.trim()}>Save</Button></>}>
      <div className="space-y-4">
        <Field label="Branch name"><TextInput value={f.name} onChange={set("name")} placeholder="Pollachi" /></Field>
        <Field label="Address (optional)"><TextInput value={f.address} onChange={set("address")} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Check every (seconds)" hint="How often each PC reports. 15–900."><TextInput type="number" min={15} max={900} value={f.heartbeatInterval} onChange={set("heartbeatInterval")} /></Field>
          <Field label="Grace period (seconds)" hint="How long a Wi-Fi drop is forgiven. 30–3600."><TextInput type="number" min={30} max={3600} value={f.gracePeriod} onChange={set("gracePeriod")} /></Field>
        </div>
      </div>
    </Modal>
  );
}

function NetworkModal({ branch, network, prefill, onClose, onDone }) {
  const api = useApi();
  const toast = useToast();
  const [f, setF] = useState({ ssid: network?.ssid ?? prefill?.ssid ?? "", bssid: network?.bssid ?? prefill?.bssid ?? "", band: network?.band || "Other", label: network?.label || "" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const go = async () => {
    setBusy(true);
    try {
      if (network) await api.patch(`/api/branches/${branch._id}/networks/${network._id}`, f);
      else await api.post(`/api/branches/${branch._id}/networks`, f);
      toast(network ? "Access point updated" : "Access point added");
      onDone();
      onClose();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={network ? "Edit access point" : "Add access point"} subtitle={branch.name}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={go} loading={busy} disabled={!f.ssid.trim() || !f.bssid.trim()}>Save</Button></>}>
      <div className="space-y-4">
        <Field label="Wi-Fi name (SSID)" hint="Exactly as broadcast, including any space, e.g. “PROFENAA- 2G”."><TextInput value={f.ssid} onChange={set("ssid")} /></Field>
        <Field label="Access point ID (BSSID)" hint="Format 8C:C7:C3:09:1D:70. A prefix like 8C:C7:C3:09:1D:* also works (at least 3 fixed parts)."><TextInput value={f.bssid} onChange={set("bssid")} placeholder="8C:C7:C3:09:1D:70" className="font-mono" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Band"><Select value={f.band} onChange={set("band")}><option>2.4 GHz</option><option>5 GHz</option><option>Other</option></Select></Field>
          <Field label="Label (optional)"><TextInput value={f.label} onChange={set("label")} placeholder="Reception router" /></Field>
        </div>
        <p className="text-[11px] text-slate-500 rounded-xl bg-sky-50 px-3 py-2.5">
          To find the BSSID, run <code className="font-mono font-bold">node index.js --wifi</code> in the agent folder on a PC that is connected to this Wi-Fi.
        </p>
      </div>
    </Modal>
  );
}

function Branches() {
  const api = useApi();
  const toast = useToast();
  const [confirm, ask] = useConfirm();
  const branches = useAsync(() => api.get("/api/branches"), []);
  const rejected = useAsync(() => api.get("/api/branches/rejected-networks"), []);
  const [branchModal, setBranchModal] = useState(null); // {} = new, branch = edit
  const [netModal, setNetModal] = useState(null); // { branch, network?, prefill? }
  const refresh = () => { branches.reload({ silent: true }); rejected.reload({ silent: true }); };

  const list = branches.data?.branches || [];

  const removeBranch = (b) => ask({
    title: `Delete ${b.name}?`,
    message: "Only possible when no staff are assigned to it. Its access points are removed too.",
    confirmLabel: "Delete branch",
    onYes: async () => { try { await api.del(`/api/branches/${b._id}`); toast("Branch deleted"); refresh(); } catch (e) { toast(e.message, "error"); } },
  });
  const removeNet = (b, n) => ask({
    title: "Remove this access point?",
    message: `${n.ssid} (${n.bssid}). Staff connected to it will no longer be counted as present.`,
    confirmLabel: "Remove",
    onYes: async () => { try { await api.del(`/api/branches/${b._id}/networks/${n._id}`); toast("Access point removed"); refresh(); } catch (e) { toast(e.message, "error"); } },
  });
  const toggleNet = async (b, n) => {
    try { await api.patch(`/api/branches/${b._id}/networks/${n._id}`, { active: !n.active }); refresh(); } catch (e) { toast(e.message, "error"); }
  };
  const quickAdd = async (item) => {
    try {
      await api.post(`/api/branches/${item.branchId}/networks`, { ssid: item.ssid, bssid: item.bssid, band: "Other" });
      toast(`Added to ${item.branchName}`);
      refresh();
    } catch (e) { toast(e.message, "error"); }
  };

  return (
    <div className="space-y-5">
      {confirm}
      <PageHeader icon={<Building2 size={20} />} title="Branches & office Wi-Fi" subtitle="Staff count as present when their PC is on one of these access points."
        actions={<Button onClick={() => setBranchModal({})}><Plus size={14} /> Add branch</Button>} />
      <ErrorNote message={branches.error} onRetry={branches.reload} />

      {rejected.data?.items?.length > 0 && (
        <Card className="!border-amber-200 !bg-amber-50/40">
          <p className="text-sm font-bold text-amber-800 flex items-center gap-2"><TriangleAlert size={15} /> Networks staff connected to that are NOT registered</p>
          <p className="text-[11px] text-amber-700/80 mt-1">If one of these is your office router (a second band, a new extender), add it and those staff will be counted as present. <b>Never add a phone hotspot or a personal router</b>: anyone could then be marked present from anywhere.</p>
          <ul className="mt-3 space-y-2">
            {rejected.data.items.slice(0, 6).map((r) => (
              <li key={`${r.branchId}${r.bssid}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-white border border-amber-100 px-3 py-2.5">
                <span className="text-xs font-bold text-slate-800">{r.ssid || "(hidden)"}</span>
                <span className="text-[11px] font-mono text-slate-500">{r.bssid}</span>
                <span className="text-[10px] text-slate-400">{r.branchName} · {r.users.join(", ")} · seen {r.count}×, {timeAgo(r.lastSeen)}</span>
                <Button size="sm" variant="ghost" className="ml-auto" onClick={() => quickAdd(r)}><Plus size={12} /> Add to {r.branchName}</Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {branches.loading && !branches.data ? <Spinner /> : list.length === 0 ? (
        <Card><Empty icon={<Building2 size={20} />} title="No branches yet" hint="Add your first branch, then register its Wi-Fi access points." action={<Button onClick={() => setBranchModal({})}>Add branch</Button>} /></Card>
      ) : list.map((b) => (
        <Card key={b._id} padded={false}>
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate-100">
            <div>
              <p className="text-sm font-bold text-slate-900 flex items-center gap-2">{b.name} {!b.active && <Badge tone="red">Inactive</Badge>}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">{b.staffCount} staff · report every {b.heartbeatInterval}s · grace {Math.round(b.gracePeriod / 60 * 10) / 10} min{b.address ? ` · ${b.address}` : ""}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" onClick={() => setNetModal({ branch: b })}><Plus size={12} /> Access point</Button>
              <Button size="sm" variant="ghost" onClick={() => setBranchModal(b)}><Pencil size={12} /> Edit</Button>
              <Button size="sm" variant="softDanger" onClick={() => removeBranch(b)}><Trash2 size={12} /></Button>
            </div>
          </div>
          {b.networks.length === 0 ? (
            <p className="px-5 py-6 text-xs text-amber-700 bg-amber-50/50 flex items-center gap-2"><TriangleAlert size={14} /> No access points registered - nobody at this branch can be marked present.</p>
          ) : (
            <Table head={["Wi-Fi name", "Access point ID", "Band", "Label", "Enabled", ""]} className="!border-0 !rounded-none">
              {b.networks.map((n) => (
                <tr key={n._id} className={n.active ? "" : "opacity-50"}>
                  <td className="px-4 py-3 font-bold text-slate-800 whitespace-pre">{n.ssid}</td>
                  <td className="px-4 py-3 font-mono text-slate-600">{n.bssid}</td>
                  <td className="px-4 py-3"><Badge tone={n.band === "5 GHz" ? "indigo" : n.band === "2.4 GHz" ? "blue" : "slate"}>{n.band}</Badge></td>
                  <td className="px-4 py-3 text-slate-500">{n.label || "--"}</td>
                  <td className="px-4 py-3"><button onClick={() => toggleNet(b, n)} className={`w-9 h-5 rounded-full relative transition ${n.active ? "bg-emerald-500" : "bg-slate-300"}`} aria-label="Enable or disable"><span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${n.active ? "left-[18px]" : "left-0.5"}`} /></button></td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button onClick={() => setNetModal({ branch: b, network: n })} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Edit"><Pencil size={13} /></button>
                    <button onClick={() => removeNet(b, n)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50" aria-label="Remove"><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      ))}

      {branchModal && <BranchModal branch={branchModal._id ? branchModal : null} onClose={() => setBranchModal(null)} onDone={refresh} />}
      {netModal && <NetworkModal branch={netModal.branch} network={netModal.network} prefill={netModal.prefill} onClose={() => setNetModal(null)} onDone={refresh} />}
    </div>
  );
}

// ================================================================= devices
function Devices({ onPending }) {
  const api = useApi();
  const toast = useToast();
  const [confirm, ask] = useConfirm();
  const [status, setStatus] = useState("PENDING");
  const all = useAsync(() => api.get("/api/devices"), []);
  const devices = all.data?.devices || [];
  const count = (s) => devices.filter((d) => d.status === s).length;
  useEffect(() => { onPending?.(count("PENDING")); }, [all.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (d, what) => {
    try {
      await api.patch(`/api/devices/${d._id}/${what}`);
      toast(what === "approve" ? "Device approved" : "Device revoked");
      all.reload({ silent: true });
    } catch (e) { toast(e.message, "error"); }
  };
  const remove = (d) => ask({
    title: "Delete this device record?",
    message: `${d.userName}'s ${d.hostname || "computer"} will have to register again.`,
    confirmLabel: "Delete",
    onYes: async () => { try { await api.del(`/api/devices/${d._id}`); toast("Device deleted"); all.reload({ silent: true }); } catch (e) { toast(e.message, "error"); } },
  });

  const shown = status === "ALL" ? devices : devices.filter((d) => d.status === status);

  return (
    <div className="space-y-5">
      {confirm}
      <PageHeader icon={<Laptop size={20} />} title="Registered computers" subtitle="Each employee's first computer is approved automatically (configurable in Rules). Additional ones need your approval, which stops one person clocking in for another." />
      <Tabs value={status} onChange={setStatus} tabs={[
        { id: "PENDING", label: "Pending", count: count("PENDING") },
        { id: "ACTIVE", label: `Active (${count("ACTIVE")})` },
        { id: "REVOKED", label: `Revoked (${count("REVOKED")})` },
        { id: "ALL", label: "All" },
      ]} />
      <ErrorNote message={all.error} onRetry={all.reload} />
      {all.loading && !all.data ? <Spinner /> : shown.length === 0 ? (
        <Card><Empty icon={<Laptop size={20} />} title="Nothing here" hint={status === "PENDING" ? "No devices are waiting for approval." : "No devices in this state."} /></Card>
      ) : (
        <Table head={["Employee", "Computer", "Branch", "Status", "Last seen", "Registered", ""]}>
          {shown.map((d) => (
            <tr key={d._id}>
              <td className="px-4 py-3 font-bold text-slate-800 whitespace-nowrap">{d.userName}</td>
              <td className="px-4 py-3"><p className="font-semibold text-slate-700">{d.hostname || "--"}</p><p className="text-[10px] text-slate-400">{d.platform}{d.agentVersion ? ` · agent ${d.agentVersion}` : ""}</p></td>
              <td className="px-4 py-3 text-slate-500">{d.branchId?.name || "--"}</td>
              <td className="px-4 py-3"><Badge tone={d.status === "ACTIVE" ? "green" : d.status === "PENDING" ? "amber" : "red"}>{d.status === "ACTIVE" ? "Active" : d.status === "PENDING" ? "Pending" : "Revoked"}</Badge></td>
              <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{d.lastSeenAt ? `${timeAgo(d.lastSeenAt)}${d.lastSsid ? ` · ${d.lastSsid}` : ""}` : "never"}</td>
              <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{fmtDateTime(d.createdAt)}</td>
              <td className="px-4 py-3 text-right whitespace-nowrap">
                <span className="inline-flex gap-2">
                  {d.status !== "ACTIVE" && <Button size="sm" variant="softSuccess" onClick={() => act(d, "approve")}><Check size={12} /> Approve</Button>}
                  {d.status === "ACTIVE" && <Button size="sm" variant="softDanger" onClick={() => act(d, "revoke")}><X size={12} /> Revoke</Button>}
                  <button onClick={() => remove(d)} className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500" aria-label="Delete"><Trash2 size={13} /></button>
                </span>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

// ================================================================= rules
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const NUM = (v) => (v === "" ? "" : Number(v));

function Rules() {
  const api = useApi();
  const toast = useToast();
  const { data, loading, error, reload } = useAsync(() => api.get("/api/settings"), []);
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) setF(data.settings); }, [data]);
  if (loading && !f) return <Spinner />;
  if (!f) return <ErrorNote message={error} onRetry={reload} />;
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === "number" ? NUM(e.target.value) : e.target.value }));
  const quota = (t) => (e) => setF((x) => ({ ...x, leaveQuotas: { ...x.leaveQuotas, [t]: NUM(e.target.value) } }));
  const toggleDay = (d) => setF((x) => ({ ...x, weeklyOffDays: x.weeklyOffDays.includes(d) ? x.weeklyOffDays.filter((n) => n !== d) : [...x.weeklyOffDays, d].sort() }));

  const save = async () => {
    setBusy(true);
    try {
      const body = {
        fullDayMinutes: f.fullDayMinutes, halfDayMinutes: f.halfDayMinutes, lateGraceMinutes: f.lateGraceMinutes,
        autoCheckoutAfterShiftMinutes: f.autoCheckoutAfterShiftMinutes, earliestCheckInBeforeShiftMinutes: f.earliestCheckInBeforeShiftMinutes,
        noShowReminderMinutes: f.noShowReminderMinutes, morningDigestTime: f.morningDigestTime || "",
        autoApproveFirstDevice: f.autoApproveFirstDevice, maxActiveDevicesPerUser: f.maxActiveDevicesPerUser,
        weeklyOffDays: f.weeklyOffDays, leaveQuotas: f.leaveQuotas,
        requireOfficeWifiLogin: f.requireOfficeWifiLogin !== false,
        extraOfficeIps: String(f.extraOfficeIpsText ?? (f.extraOfficeIps || []).join(", ")).split(/[\s,]+/).filter(Boolean),
        overtimePromptMinutes: f.overtimePromptMinutes ?? 10, overtimeRecheckMinutes: f.overtimeRecheckMinutes ?? 60,
        noResponseAction: f.noResponseAction || "HALF_DAY", dailyReportReminderMinutes: f.dailyReportReminderMinutes ?? 15,
      };
      await api.put("/api/settings", body);
      toast("Rules saved");
      reload({ silent: true });
    } catch (e) { toast(e.message, "error"); } finally { setBusy(false); }
  };

  const h = (m) => (m ? `${Math.floor(m / 60)}h ${m % 60}m` : "");

  return (
    <div className="space-y-5">
      <PageHeader icon={<SlidersHorizontal size={20} />} title="Attendance rules" subtitle="Apply to every branch." actions={<Button onClick={save} loading={busy}><Save size={13} /> Save rules</Button>} />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Card>
          <p className="text-sm font-bold text-slate-800 mb-4">Working time</p>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Full day (minutes)" hint={h(f.fullDayMinutes)}><TextInput type="number" min={60} value={f.fullDayMinutes} onChange={set("fullDayMinutes")} /></Field>
            <Field label="Half day (minutes)" hint={`${h(f.halfDayMinutes)} - less than this is Absent`}><TextInput type="number" min={30} value={f.halfDayMinutes} onChange={set("halfDayMinutes")} /></Field>
            <Field label="Late after (minutes)" hint="Grace after shift start before someone counts as late"><TextInput type="number" min={0} value={f.lateGraceMinutes} onChange={set("lateGraceMinutes")} /></Field>
            <Field label="Auto-close after shift end (min)" hint="Forgotten PCs stop counting. 0 = never"><TextInput type="number" min={0} value={f.autoCheckoutAfterShiftMinutes} onChange={set("autoCheckoutAfterShiftMinutes")} /></Field>
            <Field label="Earliest check-in before shift (min)" hint="Stops a PC left on overnight from checking in"><TextInput type="number" min={0} value={f.earliestCheckInBeforeShiftMinutes} onChange={set("earliestCheckInBeforeShiftMinutes")} /></Field>
          </div>
          <p className="text-[11px] font-bold text-slate-600 mt-5 mb-2">Weekly off</p>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((d, i) => (
              <button key={d} onClick={() => toggleDay(i)} className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${f.weeklyOffDays.includes(i) ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"}`}>{d}</button>
            ))}
          </div>
        </Card>

        <div className="space-y-5">
          <Card>
            <p className="text-sm font-bold text-slate-800 mb-4">Reminders</p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Remind staff who haven't shown up (min after shift start)" hint="0 = off"><TextInput type="number" min={0} value={f.noShowReminderMinutes} onChange={set("noShowReminderMinutes")} /></Field>
              <Field label="Admin morning summary at" hint="Leave empty to turn off"><TextInput type="time" value={f.morningDigestTime || ""} onChange={set("morningDigestTime")} /></Field>
            </div>
          </Card>
          <Card>
            <p className="text-sm font-bold text-slate-800 mb-1">Shift end: "Are you still working?"</p>
            <p className="text-[11px] text-slate-400 mb-4">Asked on the employee's PC when the shift is over and they are still on the office Wi-Fi.</p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Time to answer (minutes)"><TextInput type="number" min={1} max={120} value={f.overtimePromptMinutes ?? 10} onChange={set("overtimePromptMinutes")} /></Field>
              <Field label="Ask again during overtime (min)"><TextInput type="number" min={15} max={480} value={f.overtimeRecheckMinutes ?? 60} onChange={set("overtimeRecheckMinutes")} /></Field>
            </div>
            <Field label="If nobody answers" className="mt-4" hint="The day always ends at shift end. Nobody is penalised when the PC simply went offline, or on a day off.">
              <Select value={f.noResponseAction || "HALF_DAY"} onChange={set("noResponseAction")}>
                <option value="HALF_DAY">Half day until the employee explains and I approve</option>
                <option value="FLAG_ONLY">Only flag it (status is not changed)</option>
              </Select>
            </Field>
          </Card>
          <Card>
            <p className="text-sm font-bold text-slate-800 mb-1">Signing in to the CRM</p>
            <p className="text-[11px] text-slate-400 mb-4">Staff on Wi-Fi attendance can only sign in from the office network. Mobile data and other Wi-Fi are refused.</p>
            <div className="space-y-4">
              <Toggle checked={f.requireOfficeWifiLogin !== false} onChange={(v) => setF((x) => ({ ...x, requireOfficeWifiLogin: v }))} label="Require the office Wi-Fi to sign in" hint="Staff with approved work-from-home are allowed from anywhere." />
              <Field label="Extra office addresses (optional)" hint="Only needed if your office has a fixed public IP. The office network is otherwise learned from the attendance agents."><TextInput value={f.extraOfficeIpsText ?? (f.extraOfficeIps || []).join(", ")} onChange={(e) => setF((x) => ({ ...x, extraOfficeIpsText: e.target.value }))} placeholder="e.g. 49.204.10.5" /></Field>
              <Field label="Remind staff to submit the Daily Report (min after shift end)" hint="0 = off"><TextInput type="number" min={0} value={f.dailyReportReminderMinutes ?? 15} onChange={set("dailyReportReminderMinutes")} /></Field>
            </div>
          </Card>
          <Card>
            <p className="text-sm font-bold text-slate-800 mb-4">Devices</p>
            <div className="space-y-4">
              <Toggle checked={f.autoApproveFirstDevice} onChange={(v) => setF((x) => ({ ...x, autoApproveFirstDevice: v }))} label="Approve an employee's first computer automatically" hint="Turn off to approve every computer yourself." />
              <Field label="Active computers per employee"><TextInput type="number" min={1} max={5} value={f.maxActiveDevicesPerUser} onChange={set("maxActiveDevicesPerUser")} /></Field>
            </div>
          </Card>
          <Card>
            <p className="text-sm font-bold text-slate-800 mb-4">Yearly leave allowance (days)</p>
            <div className="grid grid-cols-3 gap-4">
              {["Casual Leave", "Sick Leave", "Earned Leave"].map((t) => (
                <Field key={t} label={t.replace(" Leave", "")}><TextInput type="number" min={0} value={f.leaveQuotas?.[t] ?? 0} onChange={quota(t)} /></Field>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ================================================================= shell
export default function WifiSetup() {
  const [tab, setTab] = useState("branches");
  const [pending, setPending] = useState(0);
  const tabs = [
    { id: "branches", label: "Branches & Wi-Fi", icon: <Router size={14} /> },
    { id: "devices", label: "Devices", icon: <Laptop size={14} />, count: pending },
    { id: "rules", label: "Rules", icon: <SlidersHorizontal size={14} /> },
  ];
  return (
    <Themed role="admin">
      <div className="p-4 sm:p-6 lg:p-8 space-y-5">
        <Tabs tabs={tabs} value={tab} onChange={setTab} />
        {tab === "branches" && <Branches />}
        {tab === "devices" && <Devices onPending={setPending} />}
        {tab === "rules" && <Rules />}
        {tab !== "devices" && <PendingProbe onCount={setPending} />}
      </div>
    </Themed>
  );
}

// keeps the "Devices" tab badge fresh while another tab is open
function PendingProbe({ onCount }) {
  const api = useApi();
  useEffect(() => {
    api.get("/api/devices", { status: "PENDING" }).then((r) => onCount(r.devices.length)).catch(() => {});
  }, [api, onCount]);
  return null;
}
