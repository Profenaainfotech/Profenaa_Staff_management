// Shows the "Are you still working?" (shift end) and "Are you working today?" (day off) questions
// with their Yes / No buttons at the TOP of the staff dashboard, on every tab, for everyone -
// including staff who log in with the CRM (they have no Windows pop-up, so this is the only place
// they can answer). It looks for an open question every 15 seconds, and straight away when the
// notification for it arrives. Nothing is shown when no question is waiting.
import React, { useCallback, useEffect, useState } from "react";
import { makeApi } from "../../lib/api";
import { subscribe } from "../../lib/socket";
import { OffDayBanner, ShiftEndBanner } from "./ShiftEnd";
import { Themed } from "./ui";

const POLL_MS = 15000;
const ASK_TYPES = new Set(["OVERTIME_ASK", "OFFDAY_ASK", "NO_RESPONSE", "FORCE_LOGOUT"]);

function Host() {
  const [prompt, setPrompt] = useState(null);
  const [fetchedAt, setFetchedAt] = useState(Date.now());

  const load = useCallback(async () => {
    try {
      const r = await makeApi("user").get("/api/attendance/my/live");
      setPrompt(r?.live?.prompt || null);
      setFetchedAt(Date.now());
    } catch {
      /* the question is best-effort; the next check tries again */
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    const off = subscribe("user", "notification", (n) => {
      if (ASK_TYPES.has(n?.type)) load();
    });
    return () => {
      clearInterval(timer);
      off();
    };
  }, [load]);

  const overtime = prompt?.type === "OVERTIME" ? prompt : null;
  const offDay = prompt?.type === "OFFDAY" ? prompt : null;

  return (
    <div className="space-y-4 mb-6 empty:hidden">
      {/* stays mounted: after "No, finished" it keeps showing "please log out" */}
      <ShiftEndBanner prompt={overtime} fetchedAt={fetchedAt} onChanged={load} />
      {offDay && <OffDayBanner prompt={offDay} fetchedAt={fetchedAt} onChanged={load} />}
    </div>
  );
}

export default function ShiftPromptHost() {
  return (
    <Themed role="user">
      <Host />
    </Themed>
  );
}