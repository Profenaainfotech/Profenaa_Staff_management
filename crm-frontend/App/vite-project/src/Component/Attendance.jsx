
import React, { useEffect, useMemo, useState } from "react";
import { API_ORIGIN } from "../lib/api";
import {
  CalendarDays,
  Clock3,
  UserCheck,
  CheckCircle2,
  AlertCircle,
  Timer,
  LogIn,
  LogOut,
  Activity,
  Moon,
  Sun,
  TrendingUp,
  BarChart3,
  CalendarCheck2,
  CircleCheck,
  CircleAlert,
  Coffee,
  ShieldCheck,
  RefreshCw,
  Loader2,
  Info,
  Hourglass,
  Zap,
  Target,
  History,
  UserX,
} from "lucide-react";

const ATTENDANCE_API = `${API_ORIGIN}/api/attendance`;
const USER_API = `${API_ORIGIN}/api/UserAccounts`;

const ACTIVE_THRESHOLD = 2 * 60 * 1000; // 2 minutes
const REFRESH_INTERVAL = 15000; // 15 seconds

const Attendance = () => {
  const [profile, setProfile] = useState(null);
  const [todayAttendance, setTodayAttendance] = useState(null);
  const [history, setHistory] = useState([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [currentTime, setCurrentTime] = useState(new Date());

  const token = localStorage.getItem("authToken");

  /* =========================================================
     DATE / TIME HELPERS
  ========================================================= */

  const parseDate = (value) => {
    if (!value) return null;

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return date;
  };

  const formatDate = (value) => {
    const date = parseDate(value);

    if (!date) return "--";

    return date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const formatTime = (value) => {
    const date = parseDate(value);

    if (!date) return "--";

    return date.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  const formatDateTime = (value) => {
    const date = parseDate(value);

    if (!date) return "--";

    return date.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  const formatMinutes = (minutes = 0) => {
    const total = Math.max(0, Math.floor(Number(minutes) || 0));

    const hours = Math.floor(total / 60);
    const mins = total % 60;

    return `${hours}h ${mins}m`;
  };

  const formatHoursDecimal = (minutes = 0) => {
    const total = Math.max(0, Number(minutes) || 0);

    return (total / 60).toFixed(1);
  };

  const getMinutesFromTime = (timeString) => {
    if (!timeString || !timeString.includes(":")) {
      return 0;
    }

    const [hours, minutes] = timeString.split(":").map(Number);

    return hours * 60 + minutes;
  };

  const getShiftDuration = (start, end) => {
    const startMinutes = getMinutesFromTime(start);
    const endMinutes = getMinutesFromTime(end);

    if (!start || !end) return 0;

    let difference = endMinutes - startMinutes;

    if (difference < 0) {
      difference += 24 * 60;
    }

    return difference;
  };

  const getTodayKey = () => {
    const now = new Date();

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  };

  const isSameDate = (dateValue, dateKey) => {
    const date = parseDate(dateValue);

    if (!date || !dateKey) return false;

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}` === dateKey;
  };

  const calculateDuration = (start, end) => {
    const startDate = parseDate(start);
    const endDate = parseDate(end);

    if (!startDate || !endDate) return 0;

    const difference = endDate.getTime() - startDate.getTime();

    if (difference <= 0) return 0;

    return Math.floor(difference / 60000);
  };

  /* =========================================================
     API
  ========================================================= */

  const fetchProfile = async () => {
    if (!token) {
      throw new Error("Unauthorized. Please login again.");
    }

    const response = await fetch(`${USER_API}/get-profile`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error("Unauthorized. Please login again.");
      }

      throw new Error("Unable to load your profile.");
    }

    const data = await response.json();

    return data?.user || data?.profile || data?.data || data;
  };

  const fetchTodayAttendance = async () => {
    if (!token) {
      throw new Error("Unauthorized. Please login again.");
    }

    const response = await fetch(`${ATTENDANCE_API}/my/today`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error("Unauthorized. Please login again.");
      }

      throw new Error("Unable to load today's attendance.");
    }

    const data = await response.json();

    return (
      data?.attendance ||
      data?.data ||
      data?.record ||
      data?.result ||
      null
    );
  };

  const fetchHistory = async () => {
    if (!token) return [];

    const response = await fetch(`${ATTENDANCE_API}/my/history`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error("Unauthorized. Please login again.");
      }

      throw new Error("Unable to load attendance history.");
    }

    const data = await response.json();

    return (
      data?.attendance ||
      data?.history ||
      data?.data ||
      data?.records ||
      []
    );
  };

  const loadAttendanceData = async (showLoader = false) => {
    try {
      if (showLoader) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      setError("");

      const [profileData, todayData, historyData] = await Promise.all([
        fetchProfile(),
        fetchTodayAttendance(),
        fetchHistory(),
      ]);

      setProfile(profileData || null);
      setTodayAttendance(todayData || null);
      setHistory(Array.isArray(historyData) ? historyData : []);
    } catch (err) {
      console.error("Attendance loading error:", err);

      setError(
        err?.message || "Unable to load attendance information."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  /* =========================================================
     INITIAL LOAD
  ========================================================= */

  useEffect(() => {
    loadAttendanceData(true);

    const refreshTimer = setInterval(() => {
      loadAttendanceData(false);
    }, REFRESH_INTERVAL);

    return () => {
      clearInterval(refreshTimer);
    };
  }, []);

  /* =========================================================
     LIVE CLOCK
  ========================================================= */

  useEffect(() => {
    const clockTimer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => {
      clearInterval(clockTimer);
    };
  }, []);

  /* =========================================================
     PROFILE / SHIFT
  ========================================================= */

  const employeeName =
    profile?.name ||
    todayAttendance?.userName ||
    localStorage.getItem("userName") ||
    "Employee";

  const shiftStart = profile?.shiftStart || "09:30";
  const shiftEnd = profile?.shiftEnd || "18:30";

  const shiftStartMinutes = getMinutesFromTime(shiftStart);
  const shiftEndMinutes = getMinutesFromTime(shiftEnd);

  const shiftDurationMinutes = getShiftDuration(
    shiftStart,
    shiftEnd
  );

  /* =========================================================
     CRM STATUS
  ========================================================= */

 const isOnline = profile?.isOnline === true;

const lastActivity = parseDate(profile?.lastActivity);

const activityAge = lastActivity
  ? currentTime.getTime() - lastActivity.getTime()
  : Infinity;

const isActive =
  isOnline && activityAge <= ACTIVE_THRESHOLD;

const isInactive =
  isOnline && activityAge > ACTIVE_THRESHOLD;

const isLoggedOut =
  !isOnline && Boolean(todayAttendance?.checkOut);
 
 
  /* =========================================================
     ATTENDANCE TIMES
  ========================================================= */

  const attendanceCheckIn =
    todayAttendance?.checkIn ||
    profile?.loginTime ||
    null;

  const attendanceCheckOut =
    todayAttendance?.checkOut ||
    profile?.logoutTime ||
    null;

  const isAttendanceStarted =
    Boolean(todayAttendance?.checkIn) ||
    Boolean(profile?.loginTime);

  const isAttendanceCompleted =
    Boolean(todayAttendance?.checkOut) ||
    Boolean(profile?.logoutTime);

  /* =========================================================
     WORKING MINUTES
  ========================================================= */

  const workingMinutes = useMemo(() => {
    if (todayAttendance?.totalMinutes !== undefined) {
      const storedMinutes = Number(todayAttendance.totalMinutes);

      if (
        Number.isFinite(storedMinutes) &&
        storedMinutes > 0
      ) {
        return Math.floor(storedMinutes);
      }
    }

    if (!attendanceCheckIn) {
      return 0;
    }

    const start = parseDate(attendanceCheckIn);

    if (!start) return 0;

    const end = attendanceCheckOut
      ? parseDate(attendanceCheckOut)
      : currentTime;

    if (!end) return 0;

    const difference =
      end.getTime() - start.getTime();

    if (difference <= 0) return 0;

    return Math.floor(difference / 60000);
  }, [
    todayAttendance,
    attendanceCheckIn,
    attendanceCheckOut,
    currentTime,
  ]);

  /* =========================================================
     SHIFT COMPLIANCE
  ========================================================= */

  const loginDate = parseDate(attendanceCheckIn);
  const logoutDate = parseDate(attendanceCheckOut);

  const loginMinutes = loginDate
    ? loginDate.getHours() * 60 + loginDate.getMinutes()
    : null;

  const logoutMinutes = logoutDate
    ? logoutDate.getHours() * 60 + logoutDate.getMinutes()
    : null;

  const lateMinutes = useMemo(() => {
    if (!loginDate) return 0;

    const value = loginMinutes - shiftStartMinutes;

    return Math.max(0, value);
  }, [loginDate, loginMinutes, shiftStartMinutes]);

  const earlyLogoutMinutes = useMemo(() => {
    if (!logoutDate) return 0;

    const value = shiftEndMinutes - logoutMinutes;

    return Math.max(0, value);
  }, [logoutDate, logoutMinutes, shiftEndMinutes]);

  const overtimeMinutes = useMemo(() => {
    if (!logoutDate) return 0;

    const value = logoutMinutes - shiftEndMinutes;

    return Math.max(0, value);
  }, [logoutDate, logoutMinutes, shiftEndMinutes]);

  const targetMinutes = shiftDurationMinutes;

  const progressPercentage =
    targetMinutes > 0
      ? Math.min(
          100,
          Math.round(
            (workingMinutes / targetMinutes) * 100
          )
        )
      : 0;

  /* =========================================================
     DISPLAY STATUS
  ========================================================= */

  const todayDisplayStatus = useMemo(() => {
    if (!todayAttendance && !isAttendanceStarted) {
      return "Not Started";
    }

    if (todayAttendance?.status === "Absent") {
      return "Absent";
    }

    if (todayAttendance?.status === "Leave") {
      return "Leave";
    }

    if (todayAttendance?.status === "Half Day") {
      return "Half Day";
    }

    if (isAttendanceCompleted) {
      return "Completed";
    }

    return "Present";
  }, [
    todayAttendance,
    isAttendanceStarted,
    isAttendanceCompleted,
  ]);

  /* =========================================================
     ATTENDANCE HEALTH
  ========================================================= */

  const attendanceHealth = useMemo(() => {
    if (!todayAttendance && !isAttendanceStarted) {
      return {
        title: "Attendance Missing",
        description:
          "You have not logged into the CRM today.",
        type: "warning",
        icon: UserX,
      };
    }

    if (
      todayAttendance?.status === "Absent"
    ) {
      return {
        title: "Absent",
        description:
          "Attendance is marked as absent.",
        type: "danger",
        icon: CircleAlert,
      };
    }

    if (
      todayAttendance?.status === "Leave"
    ) {
      return {
        title: "On Leave",
        description:
          "Today's attendance is marked as leave.",
        type: "info",
        icon: Coffee,
      };
    }

    if (
      todayAttendance?.status === "Half Day"
    ) {
      return {
        title: "Half Day",
        description:
          "Today's attendance is marked as half day.",
        type: "warning",
        icon: CircleAlert,
      };
    }

    if (lateMinutes > 0) {
      return {
        title: "Late Login",
        description: `You logged in ${formatMinutes(
          lateMinutes
        )} after your shift started.`,
        type: "warning",
        icon: Clock3,
      };
    }

    if (isAttendanceCompleted && earlyLogoutMinutes > 0) {
      return {
        title: "Early Logout",
        description: `You logged out ${formatMinutes(
          earlyLogoutMinutes
        )} before shift end.`,
        type: "warning",
        icon: LogOut,
      };
    }

    if (
      isAttendanceCompleted &&
      overtimeMinutes > 0
    ) {
      return {
        title: "Overtime",
        description: `You completed ${formatMinutes(
          overtimeMinutes
        )} beyond your shift.`,
        type: "success",
        icon: Zap,
      };
    }

    if (isAttendanceCompleted) {
      return {
        title: "Completed Successfully",
        description:
          "Your attendance session has been completed.",
        type: "success",
        icon: CircleCheck,
      };
    }

    if (isActive) {
      return {
        title: "Attendance Running",
        description:
          "Your attendance timer is running normally.",
        type: "success",
        icon: ShieldCheck,
      };
    }

    if (isInactive) {
      return {
        title: "CRM Inactive",
        description:
          "No recent CRM activity detected. Working time continues.",
        type: "info",
        icon: Moon,
      };
    }

    return {
      title: "Present",
      description:
        "Your attendance has been recorded.",
      type: "success",
      icon: UserCheck,
    };
  }, [
    todayAttendance,
    isAttendanceStarted,
    lateMinutes,
    isAttendanceCompleted,
    earlyLogoutMinutes,
    overtimeMinutes,
    isActive,
    isInactive,
  ]);

  /* =========================================================
     HISTORY STATISTICS
  ========================================================= */

  const historyStats = useMemo(() => {
    const records = Array.isArray(history)
      ? history
      : [];

    let totalMinutes = 0;
    let completedDays = 0;
    let presentDays = 0;
    let lateDays = 0;
    let earlyLogoutDays = 0;
    let overtimeDays = 0;

    records.forEach((record) => {
      const minutes = Number(
        record?.totalMinutes || 0
      );

      totalMinutes += minutes;

      const status = String(
        record?.status || ""
      ).toLowerCase();

      if (
        status === "present" ||
        status === "completed"
      ) {
        presentDays++;
      }

      if (
        record?.checkOut ||
        status === "completed"
      ) {
        completedDays++;
      }

      const recordLate =
        Number(record?.lateMinutes || 0);

      const recordEarly =
        Number(record?.earlyLogoutMinutes || 0);

      const recordOvertime =
        Number(record?.overtimeMinutes || 0);

      if (recordLate > 0) {
        lateDays++;
      }

      if (recordEarly > 0) {
        earlyLogoutDays++;
      }

      if (recordOvertime > 0) {
        overtimeDays++;
      }
    });

    const averageMinutes =
      records.length > 0
        ? Math.round(
            totalMinutes / records.length
          )
        : 0;

    const onTimePercentage =
      presentDays > 0
        ? Math.round(
            ((presentDays - lateDays) /
              presentDays) *
              100
          )
        : 0;

    return {
      totalMinutes,
      totalDays: records.length,
      completedDays,
      presentDays,
      lateDays,
      earlyLogoutDays,
      overtimeDays,
      averageMinutes,
      onTimePercentage:
        Math.max(0, onTimePercentage),
    };
  }, [history]);

  /* =========================================================
     WEEKLY DATA
  ========================================================= */

  const weeklyData = useMemo(() => {
    const days = [];

    for (let i = 6; i >= 0; i--) {
      const date = new Date();

      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - i);

      const year = date.getFullYear();
      const month = String(
        date.getMonth() + 1
      ).padStart(2, "0");
      const day = String(
        date.getDate()
      ).padStart(2, "0");

      const dateKey = `${year}-${month}-${day}`;

      const record = history.find(
        (item) =>
          item?.date === dateKey ||
          isSameDate(item?.checkIn, dateKey)
      );

      const minutes = Number(
        record?.totalMinutes || 0
      );

      days.push({
        date,
        dateKey,
        record,
        minutes,
        label: date.toLocaleDateString(
          "en-IN",
          {
            weekday: "short",
          }
        ),
        shortDate:
          date.toLocaleDateString(
            "en-IN",
            {
              day: "2-digit",
              month: "short",
            }
          ),
      });
    }

    return days;
  }, [history, currentTime]);

  const weeklyTotalMinutes = weeklyData.reduce(
    (sum, item) => sum + item.minutes,
    0
  );

  const weeklyAverageMinutes =
    weeklyData.filter(
      (item) => item.minutes > 0
    ).length > 0
      ? Math.round(
          weeklyTotalMinutes /
            weeklyData.filter(
              (item) => item.minutes > 0
            ).length
        )
      : 0;

  /* =========================================================
     TIMELINE
  ========================================================= */

  const timelineEvents = useMemo(() => {
    const events = [];

    if (attendanceCheckIn) {
      events.push({
        type: "login",
        title: "CRM Login",
        description:
          "Attendance automatically started.",
        time: attendanceCheckIn,
        icon: LogIn,
      });
    }

    if (isAttendanceStarted) {
      if (isActive) {
        events.push({
          type: "active",
          title: "CRM Active",
          description:
            "Recent CRM activity detected.",
          time: lastActivity,
          icon: Activity,
        });
      }

      if (isInactive) {
        events.push({
          type: "inactive",
          title: "CRM Inactive",
          description:
            "No recent CRM activity. Working timer continues.",
          time: lastActivity,
          icon: Moon,
        });
      }
    }

    if (attendanceCheckOut) {
      events.push({
        type: "logout",
        title: "CRM Logout",
        description:
          "Attendance automatically completed.",
        time: attendanceCheckOut,
        icon: LogOut,
      });
    }

    return events;
  }, [
    attendanceCheckIn,
    attendanceCheckOut,
    isAttendanceStarted,
    isActive,
    isInactive,
    lastActivity,
  ]);

  /* =========================================================
     STATUS COLORS
  ========================================================= */

  const getStatusClasses = (type) => {
    switch (type) {
      case "success":
        return {
          bg: "bg-emerald-50",
          border: "border-emerald-200",
          text: "text-emerald-700",
          icon: "text-emerald-600",
        };

      case "warning":
        return {
          bg: "bg-amber-50",
          border: "border-amber-200",
          text: "text-amber-700",
          icon: "text-amber-600",
        };

      case "danger":
        return {
          bg: "bg-red-50",
          border: "border-red-200",
          text: "text-red-700",
          icon: "text-red-600",
        };

      case "info":
      default:
        return {
          bg: "bg-blue-50",
          border: "border-blue-200",
          text: "text-blue-700",
          icon: "text-blue-600",
        };
    }
  };

  const healthClasses = getStatusClasses(
    attendanceHealth.type
  );

  const HealthIcon = attendanceHealth.icon;

  /* =========================================================
     LOADING
  ========================================================= */

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 px-8 py-10 text-center">
          <Loader2 className="w-9 h-9 mx-auto text-blue-600 animate-spin" />

          <p className="mt-4 text-slate-700 font-medium">
            Loading attendance...
          </p>

          <p className="mt-1 text-sm text-slate-500">
            Please wait.
          </p>
        </div>
      </div>
    );
  }

  /* =========================================================
     MAIN UI
  ========================================================= */

  return (
    <div className="min-h-screen bg-slate-50 p-3 sm:p-5 lg:p-6">
      <div className="max-w-7xl mx-auto space-y-5">

        {/* =====================================================
            HEADER
        ===================================================== */}

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 sm:p-5">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">

            <div>
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-blue-100 flex items-center justify-center">
                  <CalendarCheck2 className="w-6 h-6 text-blue-600" />
                </div>

                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
                    Attendance
                  </h1>

                  <p className="text-sm text-slate-500 mt-0.5">
                    Welcome, {employeeName}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-medium">
                {currentTime.toLocaleDateString(
                  "en-IN",
                  {
                    weekday: "long",
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  }
                )}
              </div>

              <div className="px-3 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold">
                {currentTime.toLocaleTimeString(
                  "en-IN",
                  {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                    hour12: true,
                  }
                )}
              </div>

              <button
                type="button"
                onClick={() =>
                  loadAttendanceData(false)
                }
                disabled={refreshing}
                className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition disabled:opacity-50"
                title="Refresh attendance"
              >
                <RefreshCw
                  className={`w-5 h-5 text-slate-600 ${
                    refreshing
                      ? "animate-spin"
                      : ""
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* =====================================================
            ERROR
        ===================================================== */}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />

            <div>
              <p className="font-semibold text-red-700">
                Attendance Error
              </p>

              <p className="text-sm text-red-600 mt-1">
                {error}
              </p>
            </div>
          </div>
        )}

        {/* =====================================================
            CRM STATUS + SHIFT
        ===================================================== */}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* CRM STATUS */}

          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">
                  CRM Status
                </p>

                <h2 className="text-xl font-bold text-slate-900 mt-1">
                  {isOnline
                    ? isActive
                      ? "Active"
                      : "Inactive"
                    : "Offline"}
                </h2>
              </div>

              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                  isActive
                    ? "bg-emerald-100"
                    : isInactive
                    ? "bg-amber-100"
                    : "bg-slate-100"
                }`}
              >
                <Activity
                  className={`w-6 h-6 ${
                    isActive
                      ? "text-emerald-600"
                      : isInactive
                      ? "text-amber-600"
                      : "text-slate-500"
                  }`}
                />
              </div>
            </div>

            <div className="mt-5">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    isActive
                      ? "bg-emerald-500 animate-pulse"
                      : isInactive
                      ? "bg-amber-500"
                      : "bg-slate-400"
                  }`}
                />

                <span className="text-sm font-medium text-slate-700">
                  {isActive
                    ? "Recent activity detected"
                    : isInactive
                    ? "No recent activity"
                    : "Not logged into CRM"}
                </span>
              </div>

              {lastActivity && (
                <p className="text-xs text-slate-500 mt-2">
                  Last activity:{" "}
                  {formatTime(lastActivity)}
                </p>
              )}
            </div>

            {isInactive && (
              <div className="mt-4 p-3 rounded-xl bg-amber-50 border border-amber-100">
                <div className="flex gap-2">
                  <Info className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />

                  <p className="text-xs text-amber-700 leading-relaxed">
                    CRM inactivity only means there has been no
                    recent CRM activity. Your attendance working
                    timer continues until CRM logout.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* SHIFT */}

          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">
                  Your Shift
                </p>

                <h2 className="text-xl font-bold text-slate-900 mt-1">
                  {shiftStart} - {shiftEnd}
                </h2>
              </div>

              <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center">
                <Clock3 className="w-6 h-6 text-indigo-600" />
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-slate-50">
                <div className="flex items-center gap-2 text-slate-500 text-xs">
                  <Sun className="w-4 h-4" />
                  Shift Start
                </div>

                <p className="font-semibold text-slate-800 mt-1">
                  {shiftStart}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50">
                <div className="flex items-center gap-2 text-slate-500 text-xs">
                  <Moon className="w-4 h-4" />
                  Shift End
                </div>

                <p className="font-semibold text-slate-800 mt-1">
                  {shiftEnd}
                </p>
              </div>
            </div>

            <div className="mt-3 text-xs text-slate-500">
              Expected shift duration:{" "}
              <span className="font-semibold text-slate-700">
                {formatMinutes(
                  shiftDurationMinutes
                )}
              </span>
            </div>
          </div>

          {/* ATTENDANCE HEALTH */}

          <div
            className={`rounded-2xl shadow-sm border p-5 ${healthClasses.bg} ${healthClasses.border}`}
          >
            <div className="flex items-start justify-between">
              <div>
                <p
                  className={`text-sm ${healthClasses.text} opacity-80`}
                >
                  Attendance Health
                </p>

                <h2
                  className={`text-xl font-bold mt-1 ${healthClasses.text}`}
                >
                  {attendanceHealth.title}
                </h2>
              </div>

              <HealthIcon
                className={`w-7 h-7 ${healthClasses.icon}`}
              />
            </div>

            <p
              className={`text-sm mt-4 leading-relaxed ${healthClasses.text}`}
            >
              {attendanceHealth.description}
            </p>

            {todayDisplayStatus ===
              "Not Started" && (
              <div className="mt-4 px-3 py-2 rounded-xl bg-white/70 text-xs font-medium">
                Login to the CRM to automatically start
                today's attendance.
              </div>
            )}
          </div>
        </div>

        {/* =====================================================
            AUTOMATIC ATTENDANCE + WORKING TIME
        ===================================================== */}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* AUTOMATIC ATTENDANCE */}

          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">
                  Today's Attendance
                </p>

                <h2 className="text-2xl font-bold text-slate-900 mt-1">
                  {todayDisplayStatus}
                </h2>
              </div>

              <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                <UserCheck className="w-6 h-6 text-emerald-600" />
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">

              <div className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-center gap-2 text-slate-500 text-xs">
                  <LogIn className="w-4 h-4" />
                  CRM Login
                </div>

                <p className="font-bold text-slate-800 mt-2">
                  {attendanceCheckIn
                    ? formatTime(
                        attendanceCheckIn
                      )
                    : "--"}
                </p>

                {attendanceCheckIn && (
                  <p className="text-xs text-slate-400 mt-1">
                    {formatDate(
                      attendanceCheckIn
                    )}
                  </p>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-center gap-2 text-slate-500 text-xs">
                  <LogOut className="w-4 h-4" />
                  CRM Logout
                </div>

                <p className="font-bold text-slate-800 mt-2">
                  {attendanceCheckOut
                    ? formatTime(
                        attendanceCheckOut
                      )
                    : isAttendanceStarted
                    ? "Still Logged In"
                    : "--"}
                </p>

                {attendanceCheckOut && (
                  <p className="text-xs text-slate-400 mt-1">
                    {formatDate(
                      attendanceCheckOut
                    )}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-4 p-4 rounded-xl bg-blue-50 border border-blue-100">
              <div className="flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />

                <div>
                  <p className="font-semibold text-blue-800 text-sm">
                    Automatic attendance
                  </p>

                  <p className="text-xs text-blue-700 mt-1 leading-relaxed">
                    Your attendance is automatically recorded
                    when you log into the CRM and completed when
                    you log out. No separate check-in or
                    check-out button is required.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* WORKING TIME */}

          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">
                  Working Time
                </p>

                <h2 className="text-3xl font-bold text-slate-900 mt-1">
                  {formatMinutes(
                    workingMinutes
                  )}
                </h2>
              </div>

              <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
                <Timer className="w-6 h-6 text-purple-600" />
              </div>
            </div>

            <div className="mt-6">
              <div className="flex justify-between items-center text-sm mb-2">
                <span className="text-slate-500">
                  Shift target
                </span>

                <span className="font-semibold text-slate-700">
                  {formatMinutes(
                    targetMinutes
                  )}
                </span>
              </div>

              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all duration-500"
                  style={{
                    width: `${progressPercentage}%`,
                  }}
                />
              </div>

              <div className="flex justify-between mt-2 text-xs">
                <span className="text-slate-500">
                  {progressPercentage}% completed
                </span>

                <span className="text-slate-500">
                  {formatHoursDecimal(
                    workingMinutes
                  )}{" "}
                  hrs
                </span>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2">
              <div className="p-3 rounded-xl bg-slate-50 text-center">
                <p className="text-xs text-slate-500">
                  Login
                </p>

                <p className="font-semibold text-slate-800 mt-1 text-xs sm:text-sm">
                  {attendanceCheckIn
                    ? formatTime(
                        attendanceCheckIn
                      )
                    : "--"}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 text-center">
                <p className="text-xs text-slate-500">
                  Worked
                </p>

                <p className="font-semibold text-slate-800 mt-1 text-xs sm:text-sm">
                  {formatMinutes(
                    workingMinutes
                  )}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 text-center">
                <p className="text-xs text-slate-500">
                  Target
                </p>

                <p className="font-semibold text-slate-800 mt-1 text-xs sm:text-sm">
                  {formatMinutes(
                    targetMinutes
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* =====================================================
            SHIFT COMPLIANCE
        ===================================================== */}

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <Target className="w-5 h-5 text-blue-600" />

                <h2 className="text-lg font-bold text-slate-900">
                  Shift Compliance
                </h2>
              </div>

              <p className="text-sm text-slate-500 mt-1">
                Compare your actual attendance with your assigned shift.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-5">

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
              <p className="text-xs text-slate-500">
                Shift
              </p>

              <p className="font-bold text-slate-800 mt-1">
                {shiftStart} - {shiftEnd}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
              <p className="text-xs text-slate-500">
                Late Login
              </p>

              <p
                className={`font-bold mt-1 ${
                  lateMinutes > 0
                    ? "text-amber-600"
                    : "text-emerald-600"
                }`}
              >
                {lateMinutes > 0
                  ? formatMinutes(
                      lateMinutes
                    )
                  : "On Time"}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
              <p className="text-xs text-slate-500">
                Early Logout
              </p>

              <p
                className={`font-bold mt-1 ${
                  earlyLogoutMinutes > 0
                    ? "text-amber-600"
                    : "text-emerald-600"
                }`}
              >
                {earlyLogoutMinutes > 0
                  ? formatMinutes(
                      earlyLogoutMinutes
                    )
                  : isAttendanceCompleted
                  ? "On Time"
                  : "--"}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
              <p className="text-xs text-slate-500">
                Overtime
              </p>

              <p
                className={`font-bold mt-1 ${
                  overtimeMinutes > 0
                    ? "text-blue-600"
                    : "text-slate-700"
                }`}
              >
                {overtimeMinutes > 0
                  ? formatMinutes(
                      overtimeMinutes
                    )
                  : "0h 0m"}
              </p>
            </div>
          </div>
        </div>

        {/* =====================================================
            TODAY TIMELINE
        ===================================================== */}

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
          <div>
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-blue-600" />

              <h2 className="text-lg font-bold text-slate-900">
                Today's Timeline
              </h2>
            </div>

            <p className="text-sm text-slate-500 mt-1">
              Automatic CRM attendance and activity events.
            </p>
          </div>

          {timelineEvents.length === 0 ? (
            <div className="mt-5 p-6 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-center">
              <CalendarDays className="w-8 h-8 mx-auto text-slate-400" />

              <p className="font-semibold text-slate-700 mt-3">
                No attendance activity today
              </p>

              <p className="text-sm text-slate-500 mt-1">
                Login to the CRM to start today's attendance.
              </p>
            </div>
          ) : (
            <div className="mt-6">
              <div className="relative">

                {timelineEvents.map(
                  (event, index) => {
                    const EventIcon =
                      event.icon;

                    const isLast =
                      index ===
                      timelineEvents.length - 1;

                    return (
                      <div
                        key={`${event.type}-${index}`}
                        className="relative flex gap-4 pb-6 last:pb-0"
                      >
                        {!isLast && (
                          <div className="absolute left-5 top-10 bottom-0 w-px bg-slate-200" />
                        )}

                        <div
                          className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center ${
                            event.type ===
                            "login"
                              ? "bg-emerald-100 text-emerald-600"
                              : event.type ===
                                "logout"
                              ? "bg-red-100 text-red-600"
                              : event.type ===
                                "inactive"
                              ? "bg-amber-100 text-amber-600"
                              : "bg-blue-100 text-blue-600"
                          }`}
                        >
                          <EventIcon className="w-5 h-5" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                            <p className="font-semibold text-slate-800">
                              {event.title}
                            </p>

                            <span className="text-xs font-medium text-slate-500">
                              {event.time
                                ? formatTime(
                                    event.time
                                  )
                                : "--"}
                            </span>
                          </div>

                          <p className="text-sm text-slate-500 mt-1">
                            {event.description}
                          </p>
                        </div>
                      </div>
                    );
                  }
                )}
              </div>
            </div>
          )}
        </div>

        {/* =====================================================
            ATTENDANCE INSIGHTS
        ===================================================== */}

        <div>
          <div className="mb-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-600" />

              <h2 className="text-lg font-bold text-slate-900">
                Attendance Insights
              </h2>
            </div>

            <p className="text-sm text-slate-500 mt-1">
              Your attendance performance based on available history.
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">

            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
              <p className="text-xs text-slate-500">
                Total Days
              </p>

              <p className="text-2xl font-bold text-slate-900 mt-2">
                {historyStats.totalDays}
              </p>

              <CalendarDays className="w-5 h-5 text-blue-500 mt-3" />
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
              <p className="text-xs text-slate-500">
                Present Days
              </p>

              <p className="text-2xl font-bold text-emerald-600 mt-2">
                {historyStats.presentDays}
              </p>

              <UserCheck className="w-5 h-5 text-emerald-500 mt-3" />
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
              <p className="text-xs text-slate-500">
                Average Hours
              </p>

              <p className="text-2xl font-bold text-slate-900 mt-2">
                {formatHoursDecimal(
                  historyStats.averageMinutes
                )}
              </p>

              <TrendingUp className="w-5 h-5 text-blue-500 mt-3" />
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
              <p className="text-xs text-slate-500">
                Late Days
              </p>

              <p className="text-2xl font-bold text-amber-600 mt-2">
                {historyStats.lateDays}
              </p>

              <Clock3 className="w-5 h-5 text-amber-500 mt-3" />
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
              <p className="text-xs text-slate-500">
                On-Time %
              </p>

              <p className="text-2xl font-bold text-indigo-600 mt-2">
                {historyStats.onTimePercentage}%
              </p>

              <CheckCircle2 className="w-5 h-5 text-indigo-500 mt-3" />
            </div>
          </div>
        </div>

        {/* =====================================================
            WEEKLY OVERVIEW
        ===================================================== */}

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">

            <div>
              <div className="flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-blue-600" />

                <h2 className="text-lg font-bold text-slate-900">
                  Weekly Overview
                </h2>
              </div>

              <p className="text-sm text-slate-500 mt-1">
                Last 7 days attendance working time.
              </p>
            </div>

            <div className="px-4 py-2 rounded-xl bg-blue-50 border border-blue-100">
              <p className="text-xs text-blue-600">
                Weekly Total
              </p>

              <p className="font-bold text-blue-800">
                {formatMinutes(
                  weeklyTotalMinutes
                )}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-2 mt-6">
            {weeklyData.map((day) => {
              const hasAttendance =
                Boolean(day.record);

              const completed =
                Boolean(
                  day.record?.checkOut
                );

              const isToday =
                day.dateKey ===
                getTodayKey();

              return (
                <div
                  key={day.dateKey}
                  className={`rounded-xl border p-2 sm:p-3 text-center ${
                    isToday
                      ? "border-blue-300 bg-blue-50"
                      : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <p className="text-[10px] sm:text-xs font-semibold text-slate-500">
                    {day.label}
                  </p>

                  <p className="text-xs sm:text-sm font-bold text-slate-800 mt-1">
                    {day.shortDate}
                  </p>

                  <div className="my-3 flex justify-center">
                    {hasAttendance ? (
                      completed ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      ) : (
                        <Hourglass className="w-5 h-5 text-amber-500" />
                      )
                    ) : (
                      <CircleAlert className="w-5 h-5 text-slate-400" />
                    )}
                  </div>

                  <p className="text-[10px] sm:text-xs font-bold text-slate-700">
                    {day.minutes > 0
                      ? formatMinutes(
                          day.minutes
                        )
                      : "--"}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="mt-5 flex flex-wrap gap-4 text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              Completed
            </div>

            <div className="flex items-center gap-2">
              <Hourglass className="w-4 h-4 text-amber-500" />
              In Progress
            </div>

            <div className="flex items-center gap-2">
              <CircleAlert className="w-4 h-4 text-slate-400" />
              No Record
            </div>
          </div>

          <div className="mt-4 p-3 rounded-xl bg-slate-50">
            <p className="text-sm text-slate-600">
              Weekly average:{" "}
              <span className="font-semibold text-slate-800">
                {formatMinutes(
                  weeklyAverageMinutes
                )}
              </span>{" "}
              per recorded working day.
            </p>
          </div>
        </div>

        {/* =====================================================
            HISTORY
        ===================================================== */}

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">

          <div className="p-5 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-blue-600" />

              <h2 className="text-lg font-bold text-slate-900">
                Attendance History
              </h2>
            </div>

            <p className="text-sm text-slate-500 mt-1">
              Your previous attendance records.
            </p>
          </div>

          {history.length === 0 ? (
            <div className="p-8 text-center">
              <CalendarDays className="w-9 h-9 mx-auto text-slate-300" />

              <p className="font-semibold text-slate-700 mt-3">
                No attendance history
              </p>

              <p className="text-sm text-slate-500 mt-1">
                Attendance records will appear here after CRM login.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase">
                      Date
                    </th>

                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase">
                      Login
                    </th>

                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase">
                      Logout
                    </th>

                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase">
                      Working Time
                    </th>

                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase">
                      Late
                    </th>

                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase">
                      Overtime
                    </th>

                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase">
                      Status
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {history.map(
                    (record, index) => {
                      const recordStatus =
                        record?.status ||
                        "Present";

                      const recordMinutes =
                        Number(
                          record?.totalMinutes ||
                            0
                        );

                      const recordLate =
                        Number(
                          record?.lateMinutes ||
                            0
                        );

                      const recordOvertime =
                        Number(
                          record?.overtimeMinutes ||
                            0
                        );

                      const statusLower =
                        String(
                          recordStatus
                        ).toLowerCase();

                      let statusClass =
                        "bg-blue-50 text-blue-700";

                      if (
                        statusLower ===
                          "completed" ||
                        statusLower ===
                          "present"
                      ) {
                        statusClass =
                          "bg-emerald-50 text-emerald-700";
                      }

                      if (
                        statusLower ===
                        "half day"
                      ) {
                        statusClass =
                          "bg-amber-50 text-amber-700";
                      }

                      if (
                        statusLower ===
                          "absent" ||
                        statusLower ===
                          "leave"
                      ) {
                        statusClass =
                          "bg-red-50 text-red-700";
                      }

                      return (
                        <tr
                          key={
                            record?._id ||
                            record?.id ||
                            `${record?.date}-${index}`
                          }
                          className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50 transition"
                        >
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-2">
                              <CalendarDays className="w-4 h-4 text-slate-400" />

                              <span className="font-medium text-slate-800">
                                {record?.date
                                  ? formatDate(
                                      `${record.date}T00:00:00`
                                    )
                                  : record?.checkIn
                                  ? formatDate(
                                      record.checkIn
                                    )
                                  : "--"}
                              </span>
                            </div>
                          </td>

                          <td className="px-5 py-4 text-sm text-slate-700">
                            {record?.checkIn
                              ? formatTime(
                                  record.checkIn
                                )
                              : "--"}
                          </td>

                          <td className="px-5 py-4 text-sm text-slate-700">
                            {record?.checkOut
                              ? formatTime(
                                  record.checkOut
                                )
                              : "--"}
                          </td>

                          <td className="px-5 py-4">
                            <span className="font-semibold text-slate-800">
                              {recordMinutes >
                              0
                                ? formatMinutes(
                                    recordMinutes
                                  )
                                : "--"}
                            </span>
                          </td>

                          <td className="px-5 py-4">
                            <span
                              className={
                                recordLate >
                                0
                                  ? "text-amber-600 font-semibold"
                                  : "text-emerald-600 font-medium"
                              }
                            >
                              {recordLate >
                              0
                                ? formatMinutes(
                                    recordLate
                                  )
                                : "On Time"}
                            </span>
                          </td>

                          <td className="px-5 py-4">
                            <span
                              className={
                                recordOvertime >
                                0
                                  ? "text-blue-600 font-semibold"
                                  : "text-slate-500"
                              }
                            >
                              {recordOvertime >
                              0
                                ? formatMinutes(
                                    recordOvertime
                                  )
                                : "--"}
                            </span>
                          </td>

                          <td className="px-5 py-4">
                            <span
                              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${statusClass}`}
                            >
                              {recordStatus}
                            </span>
                          </td>
                        </tr>
                      );
                    }
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* =====================================================
            ATTENDANCE INFORMATION
        ===================================================== */}

        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />

            <div>
              <h3 className="font-bold text-blue-900">
                How attendance works
              </h3>

              <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">

                <div className="bg-white/70 rounded-xl p-3">
                  <div className="flex items-center gap-2">
                    <LogIn className="w-4 h-4 text-emerald-600" />

                    <span className="text-sm font-semibold text-slate-800">
                      CRM Login
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                    Logging into the CRM automatically starts your
                    attendance for the day.
                  </p>
                </div>

                <div className="bg-white/70 rounded-xl p-3">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-blue-600" />

                    <span className="text-sm font-semibold text-slate-800">
                      Activity
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                    CRM activity controls Active/Inactive status.
                    Inactivity does not stop your attendance timer.
                  </p>
                </div>

                <div className="bg-white/70 rounded-xl p-3">
                  <div className="flex items-center gap-2">
                    <LogOut className="w-4 h-4 text-red-600" />

                    <span className="text-sm font-semibold text-slate-800">
                      CRM Logout
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                    Logging out automatically closes attendance and
                    calculates your working time.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Attendance;

