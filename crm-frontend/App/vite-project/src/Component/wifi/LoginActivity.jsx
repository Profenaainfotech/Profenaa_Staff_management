// Who signed in to the CRM, from which device / browser / network - and who was turned away.
//   <LoginActivity />           admin screen (filters, CSV)
//   <SignInList logins={...} /> the same rows, for an employee's own history and the day detail
import React, { useMemo, useState } from "react";
import { Download, Globe, MonitorSmartphone, RefreshCw, ShieldAlert, Smartphone } from "lucide-react";
import { useAsync, useLiveRefresh } from "../../lib/hooks";
import { downloadCsv, fmtDateTime, fmtTime, istDateKey } from "../../lib/format";
import { Badge, Button, Card, Empty, ErrorNote, PageHeader, Select, Spinner, Stat, Table, TextInput, useApi } from "./ui";

const NETWORK = {
  OFFICE: { label: "Office Wi-Fi", tone: "green" },
  OUTSIDE: { label: "Outside the office", tone: "red" },
  UNVERIFIED: { label: "Not verified yet", tone: "amber" },
  NOT_CHECKED: { label: "Not checked", tone: "slate" },
};

export function DeviceCell({ l }) {
  const Icon = l.deviceType === "Mobile" || l.deviceType === "Tablet" ? Smartphone : MonitorSmartphone;
  return (
    <div className="flex items-start gap-2 min-w-0">
      <Icon size={15} className="text-slate-400 shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-xs font-bold text-slate-800 truncate">{l.deviceName || `${l.deviceType || "Device"}${l.os ? ` · ${l.os}` : ""}`}</p>
        <p className="text-[10px] text-slate-400 truncate">
          {l.deviceName ? `${l.browser || ""}${l.os ? ` · ${l.os}` : ""}` : `${l.browser || ""}${l.role === "user" && l.mode === "WIFI" ? " · not a registered PC" : ""}`}
        </p>
      </div>
    </div>
  );
}

const ResultBadge = ({ l }) =>
  l.result === "BLOCKED" ? (
    <Badge tone="red"><ShieldAlert size={10} /> Blocked</Badge>
  ) : l.kind === "LOGOUT" ? (
    <Badge tone={l.verified === false ? "amber" : "slate"}>{l.verified === false ? "Logout · Wi-Fi not confirmed" : "Logout"}</Badge>
  ) : (
    <Badge tone="green">Signed in</Badge>
  );

/** Compact list for one employee (own history / one day) */
export function SignInList({ logins = [], showDate = false }) {
  if (!logins.length) return <p className="text-xs text-slate-400">No sign-ins recorded.</p>;
  return (
    <ul className="space-y-2">
      {logins.map((l) => (
        <li key={l._id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-slate-100 px-3 py-2.5">
          <span className="text-[11px] font-bold text-slate-700 tabular-nums w-24 shrink-0">{showDate ? fmtDateTime(l.at) : fmtTime(l.at)}</span>
          <ResultBadge l={l} />
          <div className="flex-1 min-w-[10rem]"><DeviceCell l={l} /></div>
          <Badge tone={(NETWORK[l.network] || NETWORK.NOT_CHECKED).tone}>{(NETWORK[l.network] || NETWORK.NOT_CHECKED).label}</Badge>
          {l.reason && l.result === "BLOCKED" && <span className="text-[10px] text-red-500 w-full">{l.reason}</span>}
        </li>
      ))}
    </ul>
  );
}

export default function LoginActivity() {
  const api = useApi();
  const today = istDateKey();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [q, setQ] = useState("");
  const [result, setResult] = useState("");
  const [role, setRole] = useState("");

  const list = useAsync(() => api.get("/api/attendance/admin/logins", { from, to, q, result, role, limit: 500 }), [from, to, q, result, role]);
  useLiveRefresh("admin", list.reload, { events: ["notification"], pollMs: 30000 });
  const rows = useMemo(() => list.data?.logins || [], [list.data]);

  const logins = rows.filter((r) => r.kind === "LOGIN");
  const blocked = rows.filter((r) => r.result === "BLOCKED").length;
  const outside = logins.filter((r) => r.result === "ALLOWED" && r.network === "OUTSIDE").length;
  const mobile = logins.filter((r) => r.deviceType === "Mobile" || r.deviceType === "Tablet").length;

  const exportCsv = () =>
    downloadCsv(`login-activity-${from}_${to}.csv`, [
      ["Time", "Name", "Role", "Action", "Result", "Device", "Browser", "OS", "Type", "Network", "IP", "Note"],
      ...rows.map((r) => [
        fmtDateTime(r.at), r.userName, r.role === "admin" ? "Admin" : "Staff", r.kind, r.result,
        r.deviceName || "", r.browser, r.os, r.deviceType, (NETWORK[r.network] || {}).label || r.network, r.ip, r.reason || (r.verified === false ? "Wi-Fi not confirmed" : ""),
      ]),
    ]);

  return (
    <div className="space-y-5">
      <PageHeader
        icon={<Globe size={20} />}
        title="Login activity"
        subtitle="Every sign-in and sign-out: which device and browser, which network, and whether it was allowed."
        actions={
          <>
            <Button variant="ghost" onClick={() => list.reload()}><RefreshCw size={13} className={list.loading ? "animate-spin" : ""} /> Refresh</Button>
            <Button variant="ghost" onClick={exportCsv} disabled={!rows.length}><Download size={13} /> CSV</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Sign-ins" value={logins.length} tone="blue" />
        <Stat label="Blocked (not on office Wi-Fi)" value={blocked} tone={blocked ? "red" : "slate"} onClick={() => setResult(result === "BLOCKED" ? "" : "BLOCKED")} active={result === "BLOCKED"} />
        <Stat label="Allowed from outside" value={outside} tone={outside ? "amber" : "slate"} hint="approved WFH / admins" />
        <Stat label="From phones / tablets" value={mobile} tone={mobile ? "violet" : "slate"} />
      </div>

      <Card padded={false}>
        <div className="grid grid-cols-2 md:flex md:flex-wrap gap-3 p-4 border-b border-slate-100">
          <TextInput type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value || today)} className="md:!w-40" aria-label="From date" />
          <TextInput type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value || today)} className="md:!w-40" aria-label="To date" />
          <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name" className="col-span-2 md:!w-56" />
          <Select value={result} onChange={(e) => setResult(e.target.value)} className="md:!w-40">
            <option value="">Allowed + blocked</option>
            <option value="ALLOWED">Allowed only</option>
            <option value="BLOCKED">Blocked only</option>
          </Select>
          <Select value={role} onChange={(e) => setRole(e.target.value)} className="md:!w-36">
            <option value="">Staff + admins</option>
            <option value="user">Staff only</option>
            <option value="admin">Admins only</option>
          </Select>
        </div>
        <ErrorNote message={list.error} onRetry={list.reload} />
        {list.loading && !list.data ? <Spinner /> : rows.length === 0 ? (
          <Empty icon={<Globe size={20} />} title="No sign-ins in this period" hint="Try another date range." />
        ) : (
          <Table head={["Time", "Who", "Action", "Device / browser", "Network", "IP address"]} className="!border-0 !rounded-none">
            {rows.map((r) => (
              <tr key={r._id} className={r.result === "BLOCKED" ? "bg-red-50/40" : ""}>
                <td className="px-4 py-3 whitespace-nowrap tabular-nums text-slate-600">{fmtDateTime(r.at)}</td>
                <td className="px-4 py-3">
                  <p className="font-bold text-slate-800">{r.userName || "--"}</p>
                  <p className="text-[10px] text-slate-400">{r.role === "admin" ? "Admin" : r.mode === "WIFI" ? "Staff · Wi-Fi attendance" : "Staff"}</p>
                </td>
                <td className="px-4 py-3">
                  <ResultBadge l={r} />
                  {r.reason && r.result === "BLOCKED" && <span className="block text-[10px] text-red-500 mt-0.5">{r.reason}</span>}
                </td>
                <td className="px-4 py-3 max-w-[16rem]"><DeviceCell l={r} /></td>
                <td className="px-4 py-3 whitespace-nowrap"><Badge tone={(NETWORK[r.network] || NETWORK.NOT_CHECKED).tone}>{(NETWORK[r.network] || NETWORK.NOT_CHECKED).label}</Badge></td>
                <td className="px-4 py-3 whitespace-nowrap text-slate-500 tabular-nums">{r.ip || "--"}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
