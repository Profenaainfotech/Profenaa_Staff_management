// Admin "Attendance" tab.
//  Live board | Monthly report | Corrections | Audit log | Records (the ORIGINAL screen, untouched)
import React, { useCallback, useEffect, useState } from "react";
import { BarChart3, ClipboardEdit, FolderClock, Flame, Globe, Radio, ScrollText } from "lucide-react";
import { makeApi } from "../../lib/api";
import { subscribe } from "../../lib/socket";
import AuditLog from "./AuditLog";
import Corrections from "./Corrections";
import LiveBoard from "./LiveBoard";
import LoginActivity from "./LoginActivity";
import MonthlyReport from "./MonthlyReport";
import { OvertimeReport } from "./OvertimePanel";
import { Tabs, Themed } from "./ui";

export default function AdminAttendanceHub({ ClassicView }) {
  const [tab, setTab] = useState("live");
  const [pending, setPending] = useState(0);

  const loadPending = useCallback(() => {
    const api = makeApi("admin");
    // corrections waiting for a decision + shift-end replies waiting for a decision
    Promise.all([
      api.get("/api/regularizations", { status: "Pending" }).then((r) => r.regularizations.length).catch(() => 0),
      api.get("/api/attendance/admin/reviews").then((r) => r.reviews.length).catch(() => 0),
    ]).then(([a, b]) => setPending(a + b));
  }, []);

  useEffect(() => {
    loadPending();
    return subscribe("admin", "notification", (n) => ["CORRECTION_REQUEST", "NO_RESPONSE", "REVIEW_EXPLAINED"].includes(n.type) && loadPending());
  }, [loadPending]);

  const tabs = [
    { id: "live", label: "Live board", icon: <Radio size={14} /> },
    { id: "report", label: "Monthly report", icon: <BarChart3 size={14} /> },
    { id: "corrections", label: "Corrections", icon: <ClipboardEdit size={14} />, count: pending },
    { id: "extra", label: "Overtime & Sunday", icon: <Flame size={14} /> },
    { id: "logins", label: "Login activity", icon: <Globe size={14} /> },
    { id: "audit", label: "Audit log", icon: <ScrollText size={14} /> },
    { id: "classic", label: "Records", icon: <FolderClock size={14} /> },
  ];

  return (
    <Themed role="admin">
      <div className="p-4 sm:p-6 lg:p-8 pb-0">
        <Tabs tabs={tabs} value={tab} onChange={setTab} />
      </div>
      {tab === "classic" ? (
        <ClassicView />
      ) : (
        <div className="p-4 sm:p-6 lg:p-8">
          {tab === "live" && <LiveBoard onPendingChanged={loadPending} />}
          {tab === "report" && <MonthlyReport />}
          {tab === "corrections" && <Corrections onPendingChanged={loadPending} />}
          {tab === "extra" && <OvertimeReport />}
          {tab === "logins" && <LoginActivity />}
          {tab === "audit" && <AuditLog />}
        </div>
      )}
    </Themed>
  );
}
