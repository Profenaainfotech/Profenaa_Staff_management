// Admin: every attendance event (check-ins, warnings, restores, manual edits, device actions).
import React, { useState } from "react";
import { ScrollText } from "lucide-react";
import { useAsync, useLiveRefresh } from "../../lib/hooks";
import { fmtDateTime, istDateKey } from "../../lib/format";
import { EVENT, eventInfo } from "./events";
import { Badge, Card, Empty, ErrorNote, PageHeader, Select, Spinner, Table, TextInput, useApi } from "./ui";

export default function AuditLog() {
  const api = useApi();
  const [date, setDate] = useState(istDateKey());
  const [userId, setUserId] = useState("");
  const [type, setType] = useState("");
  const staff = useAsync(() => api.get("/api/staff"), []);
  const log = useAsync(() => api.get("/api/attendance/admin/events", { date, userId, type, limit: 300 }), [date, userId, type]);
  useLiveRefresh("admin", log.reload, { pollMs: 30000 });
  const events = log.data?.events || [];

  return (
    <div className="space-y-5">
      <PageHeader icon={<ScrollText size={20} />} title="Audit log" subtitle="Every automatic and manual attendance action, with the network involved." />
      <Card padded={false}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 border-b border-slate-100">
          <TextInput type="date" value={date} max={istDateKey()} onChange={(e) => setDate(e.target.value || istDateKey())} />
          <Select value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">All employees</option>
            {(staff.data?.staff || []).map((s) => <option key={s.userId} value={s.userId}>{s.name}</option>)}
          </Select>
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All event types</option>
            {Object.entries(EVENT).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
        </div>
        <ErrorNote message={log.error} onRetry={log.reload} />
        {log.loading && !log.data ? <Spinner /> : events.length === 0 ? <Empty icon={<ScrollText size={20} />} title="No events for these filters" /> : (
          <Table head={["Time", "Employee", "Event", "Details", "Network"]} className="!border-0 !rounded-none">
            {events.map((e) => {
              const info = eventInfo(e.type);
              return (
                <tr key={e._id}>
                  <td className="px-4 py-2.5 whitespace-nowrap tabular-nums text-slate-500">{fmtDateTime(e.occurredAt)}</td>
                  <td className="px-4 py-2.5 font-semibold text-slate-800 whitespace-nowrap">{e.userName}</td>
                  <td className="px-4 py-2.5"><Badge tone={info.tone}>{info.label}</Badge></td>
                  <td className="px-4 py-2.5 text-slate-500 max-w-[22rem]">{e.message}</td>
                  <td className="px-4 py-2.5 text-[10px] text-slate-400 whitespace-nowrap">{e.ssid}{e.bssid ? <span className="block">{e.bssid}</span> : null}</td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </div>
  );
}
