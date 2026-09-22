// The employee "Attendance" tab.
//  * Wi-Fi mode staff  -> the new automatic Wi-Fi attendance screen
//  * everyone else     -> the ORIGINAL Attendance component, completely unchanged
import React, { useEffect, useState } from "react";
import { makeApi } from "../../lib/api";
import { Spinner } from "./ui";
import WifiAttendance from "./WifiAttendance";

export default function MyAttendance({ ClassicView, ...classicProps }) {
  const [mode, setMode] = useState(null); // null = still checking

  useEffect(() => {
    let alive = true;
    makeApi("user")
      .get("/api/attendance/my/live")
      .then((r) => alive && setMode(r.mode))
      .catch(() => alive && setMode("CRM_LOGIN")); // if anything is wrong, keep the familiar screen
    return () => { alive = false; };
  }, []);

  if (mode === null) return <Spinner />;
  if (mode === "WIFI") return <WifiAttendance />;
  return <ClassicView {...classicProps} />;
}
