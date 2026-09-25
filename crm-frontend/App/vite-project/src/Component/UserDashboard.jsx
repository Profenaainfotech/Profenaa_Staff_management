import React, { useEffect, useMemo, useRef, useState } from "react";

import {
  LayoutDashboard,
  CheckSquare,
  ChevronDown,
  FolderKanban,
  Hash,
  User,
  LogOut,
  Bell,
  Clock,
  CheckCircle,
  Loader2,
  RefreshCw,
  CalendarDays,
  FileText,
  MessageSquare,
  History,
  Send,
  Menu,
  X,
  Activity,
  CircleUserRound,
  Link as LinkIcon,
  ExternalLink,
  Upload,
  AlertCircle,
  ShieldCheck,
  Eye,
  RotateCcw,
  Info,
  PackageOpen,
  CalendarCheck2,
} from "lucide-react";

import Attendance from "../Component/Attendance";

// Wi-Fi attendance, leaves and live notifications
import MyAttendance from "./wifi/MyAttendance";
import MyLeaves from "./wifi/MyLeaves";
import NotificationCenter from "./wifi/NotificationCenter";
import DailyReport from "./wifi/DailyReport";
import RecentProjects from "./projects/RecentProjects";
import ProjectLeaderboard from "./projects/ProjectLeaderboard";
import StaffProjectCard from "./projects/StaffProjectCard";
import ProjectDetailsModal from "./projects/ProjectDetailsModal";
import MyTechnologyProjects from "./projects/MyTechnologyProjects";
import { DomainChips, WorkItemList } from "./projects/TechnologyWork";
import { FlashBanner } from "./projects/Flash";
import { useFlash } from "./projects/useFlash";
import { projectRequest } from "./projects/projectApi";
import SidebarScroll from "./SidebarScroll";
import { API_ORIGIN } from "../lib/api";
import { CalendarOff as LeavesNavIcon, ClipboardList as ReportNavIcon } from "lucide-react";

const TASK_API_URL = `${API_ORIGIN}/api/Task`;
const USER_API_URL = `${API_ORIGIN}/api/UserAccounts`;
const PROJECT_API_URL = `${API_ORIGIN}/api/Project`;
const REPORT_API_URL = `${API_ORIGIN}/api/reports`;

// The project API needs the logged-in staff member's token on every call
const projectAuth = () => ({
  Authorization: `Bearer ${localStorage.getItem("authToken") || ""}`,
});

// The task API now needs it too (it used to accept no login at all)
const taskAuth = () => ({
  Authorization: `Bearer ${localStorage.getItem("authToken") || ""}`,
});

const PROFENAA_LOGO =
  "https://www.profenaatechrmpcbe.com/images/profenaa.webp";

export default function UserDashboard() {
  // =========================================================
  // USER
  // =========================================================

  const [userData, setUserData] = useState(null);

  // Fields the login response doesn't include (date of birth, mode of learning, ...) -
  // fetched once from /get-profile and merged into userData for the Profile tab.
  const fetchOwnProfile = async () => {
    try {
      const token = localStorage.getItem("authToken");
      if (!token) return;
      const res = await fetch(`${USER_API_URL}/get-profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.user) {
        setUserData((prev) => (prev ? { ...prev, ...data.user } : data.user));
      }
    } catch {
      /* profile enrichment is best-effort; the rest of the dashboard still works without it */
    }
  };

  // Technologies work items ticked off ALREADY TODAY (title -> true), from today's Daily
  // Report draft/submission. A Technologies task always stays in My Tasks (it is daily,
  // recurring work) but only shows items NOT YET done today - what was ticked today is
  // recorded in that day's Daily Report, not repeated here.
  const [todayDoneTitles, setTodayDoneTitles] = useState(() => new Set());
  const fetchTodayTechWork = async () => {
    try {
      const token = localStorage.getItem("authToken");
      if (!token) return;
      const res = await fetch(`${REPORT_API_URL}/my`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const done = (data?.tech?.items || []).filter((i) => i.done).map((i) => i.title);
        setTodayDoneTitles(new Set(done));
      }
    } catch {
      /* if this fails, Technologies tasks just show their full item list, which is still correct */
    }
  };

  // =========================================================
  // TASKS
  // =========================================================

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  // =========================================================
  // PROJECTS
  // =========================================================

  const [projectPool, setProjectPool] = useState([]);
  // Refreshes can overlap (load, tab change, live update, a click). Only the answer of the
  // refresh that STARTED last is used, so an older, slower answer can never bring back an old list.
  const poolSeq = useRef(0);
  const [projectLoading, setProjectLoading] = useState(false);
  const [projectError, setProjectError] = useState("");

  // "My Projects" tab: its own type filter, busy-row tracker, details modal and messages
  const [myProjectsType, setMyProjectsType] = useState("All");
  const [myProjectsBusy, setMyProjectsBusy] = useState("");
  const [myProjectsOpen, setMyProjectsOpen] = useState(null);
  const myProjectsFlash = useFlash();

  // =========================================================
  // NAVIGATION
  // =========================================================

  const [activeTab, setActiveTab] = useState("Dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // =========================================================
  // COMMENTS
  // =========================================================

  const [commentText, setCommentText] = useState("");
  const [commentTaskId, setCommentTaskId] = useState(null);
  const [commentingTaskId, setCommentingTaskId] = useState(null);

  // =========================================================
  // WORK SUBMISSION
  // =========================================================

  const [submissionTaskId, setSubmissionTaskId] = useState(null);
  const [submissionContent, setSubmissionContent] = useState("");
  const [submissionUrl, setSubmissionUrl] = useState("");
  const [submittingTaskId, setSubmittingTaskId] = useState(null);

  // =========================================================
  // ADMIN STATUS NOTIFICATION
  // =========================================================

  const [statusNotification, setStatusNotification] = useState(null);
  const [previousStatuses, setPreviousStatuses] = useState({});

  // =========================================================
  // LOAD USER
  // =========================================================

  useEffect(() => {
    loadLoggedInUser();
  }, []);

  // =========================================================
  // AUTO REFRESH TASKS
  // =========================================================

  useEffect(() => {
    if (!userData) return;

    const userId = userData?._id || userData?.id;

    if (!userId) return;

    const interval = setInterval(() => {
      fetchUserTasks(userId, false, true);
    }, 5000);

    return () => clearInterval(interval);
  }, [userData]);

  // =========================================================
  // SAFE RESPONSE READER
  // =========================================================

  const readResponse = async (response) => {
    const contentType =
      response.headers.get("content-type") || "";

    const text = await response.text();

    if (contentType.includes("application/json")) {
      try {
        return text ? JSON.parse(text) : {};
      } catch (err) {
        console.error("INVALID JSON RESPONSE:", text);
        throw new Error("Invalid JSON response from server.");
      }
    }

    return {
      message: text || "Invalid server response.",
    };
  };

  // =========================================================
  // LOAD LOGGED-IN USER
  // =========================================================

  const loadLoggedInUser = async () => {
    try {
      setLoading(true);
      setError("");

      const token = localStorage.getItem("authToken");

      if (!token) {
        window.location.href = "/login";
        return;
      }

      const storedUser = localStorage.getItem("userData");

      if (storedUser) {
        try {
          const parsedUser = JSON.parse(storedUser);

          if (parsedUser) {
            setUserData(parsedUser);

            const userId =
              parsedUser._id || parsedUser.id;

            if (userId) {
              await fetchUserTasks(userId, true, false);
              await fetchProjectPool();
              fetchOwnProfile();
              fetchTodayTechWork();

              return;
            }
          }
        } catch (err) {
          console.error("STORED USER ERROR:", err);
          localStorage.removeItem("userData");
        }
      }

      const response = await fetch(
        `${USER_API_URL}/get-profile`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        }
      );

      const data = await readResponse(response);

      if (!response.ok) {
        throw new Error(
          data.message || "Unable to load profile."
        );
      }

      const user =
        data.user ||
        data.profile ||
        data.getprofile ||
        data.userData;

      if (!user) {
        throw new Error("User information not found.");
      }

      setUserData(user);

      localStorage.setItem(
        "userData",
        JSON.stringify(user)
      );

      const userId = user._id || user.id;

      if (userId) {
        await fetchUserTasks(userId, true, false);
        await fetchProjectPool();
        fetchOwnProfile();
        fetchTodayTechWork();
      }
    } catch (err) {
      console.error("LOAD USER ERROR:", err);

      setError(
        err.message || "Unable to load user."
      );

      setLoading(false);
    }
  };

  // =========================================================
  // FETCH USER TASKS
  // =========================================================

  const fetchUserTasks = async (
    userId,
    showLoader = true,
    checkForStatusChange = false
  ) => {
    try {
      if (!userId) return;

      if (showLoader) {
        setLoading(true);
      }

      const response = await fetch(
        `${TASK_API_URL}/user/${userId}`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            ...taskAuth(),
          },
        }
      );

      const data = await readResponse(response);

      if (!response.ok) {
        throw new Error(
          data.message || "Failed to load tasks."
        );
      }

      let receivedTasks = [];

      if (Array.isArray(data)) {
        receivedTasks = data;
      } else if (Array.isArray(data.tasks)) {
        receivedTasks = data.tasks;
      } else if (Array.isArray(data.taskList)) {
        receivedTasks = data.taskList;
      } else if (Array.isArray(data.data)) {
        receivedTasks = data.data;
      } else if (
        data.data &&
        Array.isArray(data.data.tasks)
      ) {
        receivedTasks = data.data.tasks;
      }

      if (
        checkForStatusChange &&
        tasks.length > 0
      ) {
        receivedTasks.forEach((task) => {
          if (!task?._id) return;

          const oldStatus =
            previousStatuses[task._id];

          const newStatus =
            normalizeTaskStatus(task.status);

          if (
            oldStatus &&
            oldStatus !== newStatus
          ) {
            setStatusNotification({
              taskId: task._id,
              title: task.title || "Task",
              oldStatus,
              newStatus,
            });

            setTimeout(() => {
              setStatusNotification(null);
            }, 7000);
          }
        });
      }

      const statusMap = {};

      receivedTasks.forEach((task) => {
        if (task?._id) {
          statusMap[task._id] =
            normalizeTaskStatus(task.status);
        }
      });

      setPreviousStatuses(statusMap);
      setTasks(receivedTasks);
      setLastUpdated(new Date());
      setError("");
    } catch (err) {
      console.error("FETCH TASKS ERROR:", err);

      setError(
        err.message || "Failed to load tasks."
      );
    } finally {
      if (showLoader) {
        setLoading(false);
      }
    }
  };

  // =========================================================
  // FETCH PROJECT POOL
  // =========================================================

  const fetchProjectPool = async () => {
    if (!localStorage.getItem("authToken")) return;
    const seq = ++poolSeq.current;
    try {
      setProjectLoading(true);
      setProjectError("");

      const response = await fetch(
        `${PROJECT_API_URL}/pool`, { headers: projectAuth() });

      const data = await readResponse(response);

      if (!response.ok) {
        throw new Error(
          data?.message ||
            "Failed to fetch project pool"
        );
      }

      if (seq !== poolSeq.current) return; // a newer refresh has started

      setProjectPool(data?.projects || []);
    } catch (error) {
      console.error(
        "Error fetching project pool:",
        error
      );

      setProjectError(
        error.message ||
          "Failed to load project pool"
      );
    } finally {
      setProjectLoading(false);
    }
  };
  // Reload everything project-related (used after taking / starting / completing a project)
  const reloadProjects = async () => {
    await fetchProjectPool();
  };

  // "My Projects" tab: browse the pool and self-assign. The moment a project is taken (or
  // an admin assigns one), it becomes a task - see it and work it from My Tasks from there.
  const myProjectsRun = async (project, call, message) => {
    setMyProjectsBusy(project._id);
    try {
      const data = await call();
      myProjectsFlash.success(data?.message || message);
      await reloadProjects();
    } catch (err) {
      myProjectsFlash.error(err.message);
      await reloadProjects(); // somebody else may have just taken it: show the fresh list
    } finally {
      setMyProjectsBusy("");
    }
  };
  const myProjectsTake = (p) => myProjectsRun(p, () => projectRequest("user", "PUT", `/self-assign/${p._id}`, { json: {} }), "Successfully added to your tasks.");

  const myProjectsPool = useMemo(
    () => projectPool.filter((p) => myProjectsType === "All" || p.projectType === myProjectsType),
    [projectPool, myProjectsType]
  );
  const myProjectsTechTasks = useMemo(() => tasks.filter((t) => t.projectType === "Technologies"), [tasks]);

  // =========================================================
  // NORMALIZE TASK STATUS
  // =========================================================

  const normalizeTaskStatus = (status) => {
    const value = String(
      status || "Pending"
    )
      .trim()
      .toLowerCase();

    if (
      value === "completed" ||
      value === "complete" ||
      value === "done"
    ) {
      return "Completed";
    }

    if (
      value === "in progress" ||
      value === "in-progress" ||
      value === "progress"
    ) {
      return "In Progress";
    }

    return "Pending";
  };

  // =========================================================
  // TASK STATUS CLASS
  // =========================================================

  const getStatusClass = (status) => {
    const normalized =
      normalizeTaskStatus(status);

    if (normalized === "Completed") {
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    }

    if (normalized === "In Progress") {
      return "bg-sky-50 text-sky-700 border-sky-200";
    }

    return "bg-blue-50 text-blue-700 border-blue-200";
  };

  // =========================================================
  // TASK STATUS ICON
  // =========================================================

  const getStatusIcon = (
    status,
    size = 15
  ) => {
    const normalized =
      normalizeTaskStatus(status);

    if (normalized === "Completed") {
      return <CheckCircle size={size} />;
    }

    if (normalized === "In Progress") {
      return <Activity size={size} />;
    }

    return <Clock size={size} />;
  };

  // =========================================================
  // URL VALIDATION
  // =========================================================

  const validateTaskUrl = (url) => {
    const value = String(url || "").trim();

    if (!value) {
      return {
        valid: false,
        message:
          "Please enter the Drive/work link.",
      };
    }

    if (!/^https?:\/\//i.test(value)) {
      return {
        valid: false,
        message:
          "URL must start with https://",
      };
    }

    try {
      const parsed = new URL(value);

      return {
        valid: true,
        url: parsed.href,
      };
    } catch {
      return {
        valid: false,
        message:
          "Please enter a valid URL.",
      };
    }
  };

  // =========================================================
  // GET SUBMISSION OBJECT
  // =========================================================

  const getSubmissionObject = (task) => {
    if (!task) return null;

    if (
      task.submission &&
      typeof task.submission === "object"
    ) {
      return task.submission;
    }

    if (
      task.workSubmission &&
      typeof task.workSubmission === "object"
    ) {
      return task.workSubmission;
    }

    if (
      task.submittedWork &&
      typeof task.submittedWork === "object"
    ) {
      return task.submittedWork;
    }

    if (
      Array.isArray(task.submissions) &&
      task.submissions.length > 0
    ) {
      return task.submissions[
        task.submissions.length - 1
      ];
    }

    if (
      Array.isArray(task.workSubmissions) &&
      task.workSubmissions.length > 0
    ) {
      return task.workSubmissions[
        task.workSubmissions.length - 1
      ];
    }

    return null;
  };

  // =========================================================
  // SUBMISSION HELPERS
  // =========================================================

  const getSubmissionStatus = (task) => {
    const submission =
      getSubmissionObject(task);

    return (
      task?.submissionStatus ||
      submission?.status ||
      submission?.submissionStatus ||
      ""
    );
  };

  const getSubmissionContent = (task) => {
    const submission =
      getSubmissionObject(task);

    return (
      submission?.content ||
      submission?.description ||
      submission?.workDescription ||
      submission?.submissionContent ||
      task?.submissionContent ||
      task?.content ||
      ""
    );
  };

  const getSubmissionUrl = (task) => {
    const submission =
      getSubmissionObject(task);

    return (
      submission?.taskUrl ||
      submission?.driveLink ||
      submission?.driveUrl ||
      submission?.driveURL ||
      submission?.googleDriveLink ||
      submission?.googleDriveUrl ||
      submission?.googleDriveURL ||
      submission?.submissionUrl ||
      submission?.submissionLink ||
      submission?.workLink ||
      submission?.fileUrl ||
      submission?.fileURL ||
      submission?.url ||
      task?.taskUrl ||
      task?.driveLink ||
      task?.driveUrl ||
      task?.driveURL ||
      task?.googleDriveLink ||
      task?.googleDriveUrl ||
      task?.googleDriveURL ||
      task?.submissionUrl ||
      task?.submissionLink ||
      task?.workLink ||
      task?.fileUrl ||
      task?.fileURL ||
      task?.url ||
      ""
    );
  };

  const getSubmittedAt = (task) => {
    const submission =
      getSubmissionObject(task);

    return (
      submission?.submittedAt ||
      submission?.submittedOn ||
      submission?.submissionDate ||
      submission?.createdAt ||
      task?.submittedAt ||
      task?.submissionDate ||
      null
    );
  };

  const getSubmissionCommand = (task) => {
    const submission =
      getSubmissionObject(task);

    return (
      submission?.command ||
      submission?.commands ||
      submission?.note ||
      submission?.notes ||
      submission?.remarks ||
      submission?.comment ||
      task?.submissionCommand ||
      task?.command ||
      task?.commands ||
      task?.remarks ||
      ""
    );
  };

  const hasSubmission = (task) => {
    const content =
      getSubmissionContent(task);

    const url =
      getSubmissionUrl(task);

    const command =
      getSubmissionCommand(task);

    const status =
      getSubmissionStatus(task);

    return Boolean(
      String(content || "").trim() ||
        String(url || "").trim() ||
        String(command || "").trim() ||
        String(status || "").trim()
    );
  };

  // =========================================================
  // SUBMISSION STATUS
  // =========================================================

  const getSubmissionStatusClass = (
    status
  ) => {
    const normalized = String(
      status || ""
    )
      .trim()
      .toLowerCase();

    if (
      normalized === "approved" ||
      normalized === "accepted"
    ) {
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    }

    if (
      normalized === "rejected" ||
      normalized === "declined"
    ) {
      return "bg-red-50 text-red-700 border-red-200";
    }

    if (
      normalized === "under review" ||
      normalized === "review"
    ) {
      return "bg-amber-50 text-amber-700 border-amber-200";
    }

    if (
      normalized === "submitted" ||
      normalized === "pending"
    ) {
      return "bg-sky-50 text-sky-700 border-sky-200";
    }

    return "bg-slate-50 text-slate-600 border-slate-200";
  };

  const getSubmissionStatusLabel = (task) => {
    const status =
      getSubmissionStatus(task);

    if (status) return status;

    if (hasSubmission(task)) {
      return "Submitted";
    }

    return "Not Submitted";
  };

  // =========================================================
  // SUBMIT TASK WORK
  // =========================================================

  const submitTaskWork = async (taskId) => {
    const userId =
      userData?._id ||
      userData?.id;

    const userName =
      userData?.name ||
      userData?.username ||
      "User";

    if (!userId) {
      alert(
        "User ID not found. Please login again."
      );
      return;
    }

    const content =
      submissionContent.trim();

    if (!content) {
      alert(
        "Please enter the completed work/content description."
      );
      return;
    }

    const validation =
      validateTaskUrl(submissionUrl);

    if (!validation.valid) {
      alert(validation.message);
      return;
    }

    try {
      setSubmittingTaskId(taskId);
      setError("");

      const token =
        localStorage.getItem("authToken");

      const payload = {
        userId: String(userId),
        userName: String(userName),
        content,
        taskUrl: validation.url,
      };

      const response = await fetch(
        `${TASK_API_URL}/submission/${taskId}`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
            Accept: "application/json",
            ...(token
              ? {
                  Authorization:
                    `Bearer ${token}`,
                }
              : {}),
          },
          body: JSON.stringify(payload),
        }
      );

      const data =
        await readResponse(response);

      if (!response.ok) {
        throw new Error(
          data.message ||
            data.error ||
            `Submission failed (${response.status})`
        );
      }

      if (data.task) {
        setTasks((previous) =>
          previous.map((task) =>
            task._id === taskId
              ? data.task
              : task
          )
        );
      }

      setSubmissionContent("");
      setSubmissionUrl("");
      setSubmissionTaskId(null);

      await fetchUserTasks(
        userId,
        false,
        false
      );

      alert(
        "Work submitted successfully. Waiting for administrator review."
      );
    } catch (err) {
      console.error(
        "SUBMISSION ERROR:",
        err
      );

      alert(
        err.message ||
          "Unable to submit work."
      );
    } finally {
      setSubmittingTaskId(null);
    }
  };

  // =========================================================
  // ADD COMMENT
  // =========================================================

  const addComment = async (taskId) => {
    if (!commentText.trim()) {
      alert("Please enter a comment.");
      return;
    }

    const userId =
      userData?._id ||
      userData?.id;

    if (!userId) {
      alert("User ID not found.");
      return;
    }

    try {
      setCommentingTaskId(taskId);

      const token =
        localStorage.getItem("authToken");

      const response = await fetch(
        `${TASK_API_URL}/comment/${taskId}`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
            Accept: "application/json",
            ...(token
              ? {
                  Authorization:
                    `Bearer ${token}`,
                }
              : {}),
          },
          body: JSON.stringify({
            userId,
            userName:
              userData?.name ||
              userData?.username ||
              "User",
            comment:
              commentText.trim(),
          }),
        }
      );

      const data =
        await readResponse(response);

      if (!response.ok) {
        throw new Error(
          data.message ||
            "Failed to add comment."
        );
      }

      if (data.task) {
        setTasks((previous) =>
          previous.map((task) =>
            task._id === taskId
              ? data.task
              : task
          )
        );
      }

      await fetchUserTasks(
        userId,
        false,
        false
      );

      setCommentText("");
      setCommentTaskId(null);
    } catch (err) {
      console.error(
        "COMMENT ERROR:",
        err
      );

      alert(
        err.message ||
          "Failed to add comment."
      );
    } finally {
      setCommentingTaskId(null);
    }
  };

  // =========================================================
  // LOGOUT
  // =========================================================

  const handleLogout = async () => {
    // Tell the server first: it checks this PC's office Wi-Fi state, stops the attendance
    // timer and records the sign-out. A slow or unreachable server must never trap the
    // person on this screen, so the wait is capped.
    try {
      const token = localStorage.getItem("authToken");

      if (token) {
        await Promise.race([
          fetch(`${USER_API_URL}/logout`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            keepalive: true,
          }),
          new Promise((resolve) => setTimeout(resolve, 4000)),
        ]);
      }
    } catch {
      /* offline: still sign out on this computer */
    }

    localStorage.removeItem("authToken");
    localStorage.removeItem("userData");

    window.location.href = "/login";
  };

  // =========================================================
  // DATE
  // =========================================================

  const formatDate = (date) => {
    if (!date) {
      return "Not available";
    }

    const parsed = new Date(date);

    if (Number.isNaN(parsed.getTime())) {
      return "Invalid date";
    }

    return parsed.toLocaleString(
      "en-IN",
      {
        dateStyle: "medium",
        timeStyle: "short",
      }
    );
  };

  // =========================================================
  // STATISTICS
  // =========================================================

  const totalTasks = tasks.length;

  const pendingTasks =
    tasks.filter(
      (task) =>
        normalizeTaskStatus(
          task.status
        ) === "Pending"
    ).length;

  const progressTasks =
    tasks.filter(
      (task) =>
        normalizeTaskStatus(
          task.status
        ) === "In Progress"
    ).length;

  const completedTasks =
    tasks.filter(
      (task) =>
        normalizeTaskStatus(
          task.status
        ) === "Completed"
    ).length;

  const submittedTasks =
    tasks.filter((task) =>
      hasSubmission(task)
    ).length;

  const reviewPendingTasks =
    tasks.filter((task) => {
      const submission =
        getSubmissionStatus(task)
          .toLowerCase();

      return (
        hasSubmission(task) &&
        (
          !submission ||
          submission === "submitted" ||
          submission === "pending" ||
          submission === "under review" ||
          submission === "review"
        )
      );
    }).length;

  // =========================================================
  // NAVIGATION
  // =========================================================

  const navigation = [
    {
      label: "Dashboard",
      icon: <LayoutDashboard size={18} />,
    },
    {
      label: "My Tasks",
      icon: <CheckSquare size={18} />,
    },
    {
      label: "My Projects",
      icon: <FileText size={18} />,
    },
    {
      label: "Attendance",
      icon: <CalendarCheck2 size={18} />,
    },
    {
      label: "Leaves",
      icon: <LeavesNavIcon size={18} />,
    },
    {
      label: "Daily Report",
      icon: <ReportNavIcon size={18} />,
    },
    {
      label: "Task History",
      icon: <History size={18} />,
    },
    {
      label: "Profile",
      icon: <User size={18} />,
    },
  ];

  // =========================================================
  // CHANGE TAB
  // =========================================================

  const changeTab = (tab) => {
    setActiveTab(tab);
    setSidebarOpen(false);
  };

  // =========================================================
  // REFRESH
  // =========================================================

  const handleRefresh = () => {
    const userId =
      userData?._id ||
      userData?.id;

    if (userId) {
      fetchUserTasks(
        userId,
        true,
        false
      );

      // Projects are visible both on the Dashboard (Recent Projects) and the My Projects
      // tab, so refresh them either way - not just when My Projects happens to be open.
      fetchProjectPool();
      fetchTodayTechWork();
    }
  };

  // =========================================================
  // RENDER
  // =========================================================

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-['Poppins',sans-serif]">

      {/* =====================================================
          STATUS NOTIFICATION
      ===================================================== */}

      {statusNotification && (
        <div className="fixed top-4 right-4 z-[100] w-[calc(100%-2rem)] max-w-md">
          <div className="bg-white border border-sky-200 shadow-2xl rounded-2xl p-4">
            <div className="flex items-start gap-3">

              <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
                <Bell size={19} />
              </div>

              <div className="flex-1 min-w-0">

                <div className="flex items-center justify-between gap-2">

                  <p className="text-sm font-bold text-slate-900">
                    Task Status Updated
                  </p>

                  <button
                    onClick={() =>
                      setStatusNotification(null)
                    }
                    className="text-slate-400 hover:text-slate-700"
                  >
                    <X size={16} />
                  </button>

                </div>

                <p className="text-xs text-slate-600 mt-1">
                  Administrator changed the
                  status of{" "}
                  <span className="font-semibold">
                    {statusNotification.title}
                  </span>
                  .
                </p>

                <div className="flex items-center gap-2 mt-3">

                  <span
                    className={`px-2.5 py-1 rounded-full border text-[9px] font-bold ${getStatusClass(
                      statusNotification.oldStatus
                    )}`}
                  >
                    {statusNotification.oldStatus}
                  </span>

                  <span className="text-slate-400">
                    →
                  </span>

                  <span
                    className={`px-2.5 py-1 rounded-full border text-[9px] font-bold ${getStatusClass(
                      statusNotification.newStatus
                    )}`}
                  >
                    {statusNotification.newStatus}
                  </span>

                </div>

              </div>

            </div>
          </div>
        </div>
      )}

      {/* =====================================================
          MOBILE OVERLAY
      ===================================================== */}

      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() =>
            setSidebarOpen(false)
          }
        />
      )}

      {/* =====================================================
          SIDEBAR
      ===================================================== */}

      <aside
        className={`
          fixed
          top-0 left-0
          z-50
          w-64
          h-screen
          bg-blue-950
          text-white
          border-r border-slate-800
          flex flex-col
          transform transition-transform duration-300
          ${
            sidebarOpen
              ? "translate-x-0"
              : "-translate-x-full lg:translate-x-0"
          }
        `}
      >

        {/* SIDEBAR HEADER */}

        <div className="h-20 shrink-0 flex items-center justify-between px-5 border-b border-slate-800">

          <div className="flex items-center gap-3 min-w-0">

            <div className="w-10 h-10 rounded-xl bg-white border border-slate-700 flex items-center justify-center shadow-lg overflow-hidden shrink-0">

              <img
                src={PROFENAA_LOGO}
                alt="Profenaa Infotech Logo"
                className="w-full h-full object-contain p-1"
              />

            </div>

            <div className="min-w-0">

              <h1 className="font-bold text-base tracking-wide text-white">
                PROFENAA
              </h1>

              <p className="text-[10px] text-slate-400">
                INFOTECH CRM
              </p>

            </div>

          </div>

          <button
            onClick={() =>
              setSidebarOpen(false)
            }
            className="lg:hidden text-slate-400 hover:text-white shrink-0"
          >
            <X size={20} />
          </button>

        </div>

        {/* PROFILE */}

        <div className="shrink-0 px-4 pt-5">

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3">

            <div className="flex items-center gap-3">

              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-500 to-cyan-400 flex items-center justify-center text-white shrink-0">
                <User size={18} />
              </div>

              <div className="min-w-0">

                <p className="text-xs font-semibold truncate text-white">
                  {userData?.name ||
                    userData?.username ||
                    "User"}
                </p>

                <p className="text-[10px] text-slate-400">
                  Employee
                </p>

              </div>

            </div>

          </div>

        </div>

        {/* MENU */}

        <SidebarScroll theme="dark" className="mt-4">
          <div className="flex flex-1 flex-col px-4 pb-3">

          <p className="text-[10px] uppercase tracking-widest text-slate-500 px-3 mb-3">
            Main Menu
          </p>

          <nav className="space-y-1">

            {navigation.map((item) => (
              <button
                key={item.label}
                onClick={() =>
                  changeTab(item.label)
                }
                className={`
                  w-full flex items-center gap-3
                  px-3 py-3 rounded-xl sbs-item
                  text-xs font-medium
                  transition
                  ${
                    activeTab === item.label
                      ? "bg-sky-500 text-white shadow-lg shadow-sky-500/20"
                      : "text-slate-400 hover:bg-slate-900 hover:text-white"
                  }
                `}
              >

                {item.icon}

                <span>
                  {item.label}
                </span>

              </button>
            ))}

          </nav>

          {/* STATUS INFO: always a clear gap below the last menu item, and pushed down when there is room */}
          <div className="mt-auto pt-6">

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">

            <div className="flex items-start gap-2">

              <ShieldCheck
                size={15}
                className="text-sky-400 mt-0.5 shrink-0"
              />

              <div>

                <p className="text-[10px] font-semibold text-white">
                  Admin Controlled Status
                </p>

                <p className="text-[9px] text-slate-500 mt-1 leading-relaxed">
                  Your task status is updated by the administrator.
                </p>

              </div>

            </div>

          </div>

        </div>
          </div>
        </SidebarScroll>


        {/* LOGOUT */}

        <div className="shrink-0 p-3 border-t border-slate-800">

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-xs text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition"
          >

            <LogOut size={18} />

            <span>
              Logout
            </span>

          </button>

        </div>

      </aside>

      {/* =====================================================
          MAIN
      ===================================================== */}

      <main className="lg:ml-64 min-h-screen">

        {/* HEADER */}

        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">

          <div className="h-20 px-4 sm:px-6 lg:px-8 flex items-center justify-between">

            <div className="flex items-center gap-4">

              <button
                onClick={() =>
                  setSidebarOpen(true)
                }
                className="lg:hidden p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50"
              >
                <Menu size={20} />
              </button>

              <div>

                <h2 className="text-lg sm:text-xl font-bold text-slate-900">
                  {activeTab}
                </h2>

                <p className="text-[10px] sm:text-xs text-slate-500">
                  Manage your work and tasks
                </p>

              </div>

            </div>

            <div className="flex items-center gap-2">

              <button
                onClick={handleRefresh}
                className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 bg-white hover:bg-sky-50 hover:border-sky-200 hover:text-sky-600 transition"
                title="Refresh"
              >
                <RefreshCw size={16} />
              </button>

              <NotificationCenter
                role="user"
                onNavigate={changeTab}
              />

              <button
                onClick={() =>
                  setStatusNotification(null)
                }
                className={`
                  relative w-9 h-9 flex items-center justify-center
                  rounded-xl border
                  transition
                  ${
                    statusNotification
                      ? "border-sky-300 bg-sky-50 text-sky-600"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  }
                `}
              >

                <Bell size={16} />

                {statusNotification && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-sky-500 border-2 border-white rounded-full" />
                )}

              </button>

              <div className="hidden sm:flex items-center gap-2 ml-2 pl-3 border-l border-slate-200">

                <div className="w-9 h-9 rounded-full bg-sky-50 text-sky-600 flex items-center justify-center">
                  <CircleUserRound size={18} />
                </div>

                <div>

                  <p className="text-xs font-semibold text-slate-900">
                    {userData?.name ||
                      userData?.username ||
                      "User"}
                  </p>

                  <p className="text-[9px] text-slate-400">
                    Employee
                  </p>

                </div>

              </div>

            </div>

          </div>

        </header>

        {/* =====================================================
            CONTENT
        ===================================================== */}

        <div className="p-4 sm:p-6 lg:p-8">

          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl text-xs flex items-start gap-3">

              <AlertCircle
                size={16}
                className="shrink-0 mt-0.5"
              />

              <span>
                {error}
              </span>

            </div>
          )}

          {/* =================================================
              DASHBOARD
          ================================================= */}

          {activeTab === "Dashboard" && (
            <div className="space-y-6">

              <div className="relative overflow-hidden bg-gradient-to-br from-blue-950 via-slate-900 to-sky-950 rounded-3xl p-6 sm:p-8 text-white">

                <div className="relative z-10">

                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/10 text-[10px] text-sky-200">

                    <ShieldCheck size={13} />

                    Employee Workspace

                  </div>

                  <h1 className="text-xl sm:text-3xl font-bold mt-4">

                    Hello,{" "}
                    {userData?.name ||
                      userData?.username ||
                      "User"}{" "}
                    👋

                  </h1>

                  <p className="text-xs text-slate-300 mt-2 max-w-2xl leading-relaxed">

                    Track your assigned tasks,
                    submit completed work, and
                    monitor administrator review
                    status from one place.

                  </p>

                  <div className="flex flex-wrap items-center gap-3 mt-5">

                    <div className="flex items-center gap-2 text-[10px] text-slate-300">

                      <RefreshCw
                        size={13}
                        className="text-sky-400"
                      />

                      Auto-sync every 5 seconds

                    </div>

                    {lastUpdated && (
                      <div className="text-[10px] text-slate-400">

                        Last updated:{" "}
                        {formatDate(lastUpdated)}

                      </div>
                    )}

                  </div>

                </div>

                <div className="absolute -right-20 -top-20 w-64 h-64 rounded-full bg-sky-500/10 blur-3xl" />

                <div className="absolute right-20 -bottom-32 w-72 h-72 rounded-full bg-cyan-400/10 blur-3xl" />

              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">

                <StatCard
                  title="Total Tasks"
                  value={totalTasks}
                  icon={<FileText size={20} />}
                  description="All assigned tasks"
                />

                <StatCard
                  title="Pending"
                  value={pendingTasks}
                  icon={<Clock size={20} />}
                  description="Admin marked pending"
                  accent="blue"
                />

                <StatCard
                  title="In Progress"
                  value={progressTasks}
                  icon={<Activity size={20} />}
                  description="Currently working"
                  accent="sky"
                />

                <StatCard
                  title="Completed"
                  value={completedTasks}
                  icon={<CheckCircle size={20} />}
                  description="Admin marked completed"
                  accent="emerald"
                />

                <StatCard
                  title="Submitted"
                  value={submittedTasks}
                  icon={<Upload size={20} />}
                  description="Work submissions"
                  accent="cyan"
                />

              </div>

              {reviewPendingTasks > 0 && (
                <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4">

                  <div className="flex items-start gap-3">

                    <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center shrink-0">
                      <Eye size={18} />
                    </div>

                    <div className="flex-1">

                      <h3 className="text-sm font-bold text-sky-900">
                        Administrator Review
                      </h3>

                      <p className="text-xs text-sky-700 mt-1">

                        You have{" "}
                        <strong>
                          {reviewPendingTasks}
                        </strong>{" "}
                        submitted task
                        {reviewPendingTasks !== 1
                          ? "s"
                          : ""}{" "}
                        waiting for administrator
                        review.

                      </p>

                    </div>

                    <button
                      onClick={() =>
                        setActiveTab("My Tasks")
                      }
                      className="hidden sm:block px-4 py-2 rounded-lg bg-sky-600 text-white text-[10px] font-bold hover:bg-sky-700"
                    >
                      View Tasks
                    </button>

                  </div>

                </div>
              )}

              <div className="space-y-8">
                <MyTechnologyProjects
                  tasks={tasks}
                  todayDoneTitles={todayDoneTitles}
                  onOpenTasks={() => setActiveTab("My Tasks")}
                />
                <RecentProjects
                  pool={projectPool}
                  tasks={tasks}
                  todayDoneTitles={todayDoneTitles}
                  loading={projectLoading}
                  onChanged={reloadProjects}
                  onViewAll={() => setActiveTab("My Projects")}
                />
                <ProjectLeaderboard role="user" compact />
              </div>

            </div>
          )}

          {/* =================================================
              MY TASKS
          ================================================= */}

          {activeTab === "My Tasks" && (
            <div>

              <div className="mb-6">

                <h3 className="text-lg font-bold text-slate-900">
                  My Tasks
                </h3>

                <p className="text-xs text-slate-500 mt-1">
                  View assigned tasks, submit completed work,
                  and monitor administrator status.
                </p>

              </div>

              <TaskList
                tasks={tasks.filter(
                  (t) =>
                    t.projectType === "Technologies" ||
                    normalizeTaskStatus(t.status) !== "Completed"
                )}
                todayDoneTitles={todayDoneTitles}
                loading={loading}
                formatDate={formatDate}
                getStatusClass={getStatusClass}
                getStatusIcon={getStatusIcon}
                getSubmissionStatus={
                  getSubmissionStatus
                }
                getSubmissionStatusClass={
                  getSubmissionStatusClass
                }
                getSubmissionStatusLabel={
                  getSubmissionStatusLabel
                }
                getSubmissionContent={
                  getSubmissionContent
                }
                getSubmissionUrl={
                  getSubmissionUrl
                }
                getSubmittedAt={getSubmittedAt}
                getSubmissionCommand={
                  getSubmissionCommand
                }
                hasSubmission={hasSubmission}
                submissionTaskId={
                  submissionTaskId
                }
                setSubmissionTaskId={
                  setSubmissionTaskId
                }
                submissionContent={
                  submissionContent
                }
                setSubmissionContent={
                  setSubmissionContent
                }
                submissionUrl={submissionUrl}
                setSubmissionUrl={
                  setSubmissionUrl
                }
                submitTaskWork={
                  submitTaskWork
                }
                submittingTaskId={
                  submittingTaskId
                }
                addComment={addComment}
                commentText={commentText}
                setCommentText={
                  setCommentText
                }
                commentTaskId={
                  commentTaskId
                }
                setCommentTaskId={
                  setCommentTaskId
                }
                commentingTaskId={
                  commentingTaskId
                }
              />

            </div>
          )}

          {/* =================================================
              MY PROJECTS
          ================================================= */}

          {activeTab === "My Projects" && (
            <div>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">

                <div>

                  <h3 className="text-lg font-bold text-slate-900">
                    Project Pool
                  </h3>

                  <p className="text-xs text-slate-500 mt-1">
                    Internal and External projects available to take. Taking
                    one turns it into a task straight away - see it and work
                    it from My Tasks.
                  </p>

                </div>

                <button
                  onClick={async () => {
                    await fetchProjectPool();
                  }}
                  disabled={projectLoading}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-950 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition"
                >

                  <RefreshCw
                    size={14}
                    className={
                      projectLoading
                        ? "animate-spin"
                        : ""
                    }
                  />

                  Refresh

                </button>

              </div>

              {projectError && (
                <div className="mb-5 bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-xs">
                  {projectError}
                </div>
              )}

              {myProjectsFlash.flash && (
                <FlashBanner
                  flash={myProjectsFlash.flash}
                  onClose={myProjectsFlash.clear}
                  className="mb-5"
                />
              )}

              <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label="Filter projects by type">
                {["All", "Internal", "External", "Technologies"].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setMyProjectsType(t)}
                    aria-pressed={myProjectsType === t}
                    className={`rounded-full border px-3.5 py-1.5 text-xs font-bold transition ${
                      myProjectsType === t
                        ? "border-sky-500 bg-sky-500 text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:border-sky-300"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {myProjectsType === "Technologies" ? (

                myProjectsTechTasks.length === 0 ? (

                  <EmptyState
                    icon={<PackageOpen size={32} />}
                    title="No Technologies work allocated to you"
                    description="Work the administrator allocates to you will appear here."
                  />

                ) : (

                  <div className="space-y-3">
                    {myProjectsTechTasks.map((t) => {
                      const remaining = (t.workItems || []).filter((i) => !todayDoneTitles.has(i.title));
                      return (
                        <article key={t._id} className="rounded-2xl border border-slate-200 bg-white p-4">
                          <div className="flex items-start justify-between gap-3">
                            <h4 className="text-sm font-black text-slate-900">{t.title}</h4>
                            {remaining.length === 0 ? (
                              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-700">
                                <CheckCircle size={12} /> Done today
                              </span>
                            ) : (
                              <span className="shrink-0 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-[10px] font-black text-teal-700">{remaining.length} left today</span>
                            )}
                          </div>
                          <DomainChips domains={t.domains} className="mt-2" />
                          {remaining.length > 0 && <WorkItemList items={remaining} domains={t.domains} className="mt-3 rounded-xl bg-slate-50 p-3" />}
                        </article>
                      );
                    })}
                  </div>

                )

              ) : projectLoading ? (

                <div className="bg-white border border-slate-200 rounded-2xl py-12 text-center">

                  <Loader2
                    size={24}
                    className="animate-spin mx-auto text-sky-600"
                  />

                  <p className="text-xs text-slate-400 mt-3">
                    Loading available projects...
                  </p>

                </div>

              ) : myProjectsPool.length === 0 ? (

                <EmptyState
                  icon={<PackageOpen size={32} />}
                  title="No projects available"
                  description="When the administrator adds a project to the pool without assigning it, it will appear here for anyone to take."
                />

              ) : (

                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  {myProjectsPool.map((project) => (
                    <StaffProjectCard
                      key={project._id}
                      project={project}
                      busy={myProjectsBusy === project._id}
                      onTake={myProjectsTake}
                      onOpen={setMyProjectsOpen}
                    />
                  ))}
                </div>

              )}

              {myProjectsOpen && (
                <ProjectDetailsModal
                  project={myProjectsOpen}
                  onClose={() => setMyProjectsOpen(null)}
                />
              )}

            </div>
          )}

          {/* =================================================
              ATTENDANCE
          ================================================= */}

          {activeTab === "Attendance" && (
            <div>

              <div className="mb-6">

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">

                  <div>

                    <div className="flex items-center gap-2">

                      <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">

                        <CalendarCheck2
                          size={20}
                        />

                      </div>

                      <div>

                        <h3 className="text-lg font-bold text-slate-900">
                          Attendance
                        </h3>

                        <p className="text-xs text-slate-500 mt-1">
                          Manage your daily check-in, check-out
                          and attendance history.
                        </p>

                      </div>

                    </div>

                  </div>

                </div>

              </div>

              {/* 
                IMPORTANT:
                Attendance is now completely outside the
                My Projects section.

                Your Attendance.jsx component handles the
                actual attendance API operations.
              */}

              <div className="w-full">

                <MyAttendance
                  ClassicView={Attendance}
                  userData={userData}
                  userId={
                    userData?._id ||
                    userData?.id
                  }
                  token={localStorage.getItem(
                    "authToken"
                  )}
                />

              </div>

            </div>
          )}

          {activeTab === "Leaves" && <MyLeaves />}

          {activeTab === "Daily Report" && <DailyReport />}

          {/* =================================================
              TASK HISTORY
          ================================================= */}

          {activeTab === "Task History" && (
            <div>

              <div className="mb-6">

                <h3 className="text-lg font-bold text-slate-900">
                  Task History
                </h3>

                <p className="text-xs text-slate-500 mt-1">
                  Completed tasks and submitted work.
                </p>

              </div>

              <div className="space-y-4">

                {tasks
                  .filter(
                    (task) =>
                      normalizeTaskStatus(
                        task.status
                      ) === "Completed"
                  )
                  .map((task) => {

                    const content =
                      getSubmissionContent(task);

                    const url =
                      getSubmissionUrl(task);

                    const command =
                      getSubmissionCommand(task);

                    const submittedAt =
                      getSubmittedAt(task);

                    const submissionStatus =
                      getSubmissionStatusLabel(
                        task
                      );

                    return (
                      <div
                        key={task._id}
                        className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm"
                      >

                        <div className="flex flex-col sm:flex-row justify-between gap-3">

                          <div>

                            <div className="flex flex-wrap items-center gap-2">

                              <h3 className="font-bold text-sm text-slate-900">
                                {task.title}
                              </h3>

                              <span
                                className={`px-2.5 py-1 rounded-full border text-[9px] font-bold ${getStatusClass(
                                  task.status
                                )}`}
                              >
                                Completed
                              </span>

                            </div>

                            <p className="text-xs text-slate-500 mt-1">
                              {task.description ||
                                "No description"}
                            </p>

                          </div>

                          <span
                            className={`h-fit px-3 py-1.5 rounded-full border text-[10px] font-bold ${getSubmissionStatusClass(
                              submissionStatus
                            )}`}
                          >
                            {submissionStatus}
                          </span>

                        </div>

                        <SubmissionDisplay
                          content={content}
                          url={url}
                          command={command}
                          submittedAt={submittedAt}
                          formatDate={formatDate}
                        />

                      </div>
                    );
                  })}

                {completedTasks === 0 && (
                  <EmptyState
                    icon={<History size={32} />}
                    title="No completed tasks"
                    description="Tasks marked Completed by the administrator will appear here."
                  />
                )}

              </div>

            </div>
          )}

          {/* =================================================
              PROFILE
          ================================================= */}

          {activeTab === "Profile" && (
            <div>

              <div className="mb-6">
                <h3 className="text-lg font-bold text-slate-900">My Profile</h3>
                <p className="mt-1 text-xs text-slate-500">View your account information and work statistics.</p>
              </div>

              <div className="grid gap-6 lg:grid-cols-3">

                {/* AVATAR / HERO CARD */}
                <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-sky-950 p-6 text-white">
                  <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-sky-500/10 blur-3xl" />
                  <div className="absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-cyan-400/10 blur-3xl" />

                  <div className="relative z-10 flex flex-col items-center text-center">
                    <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-cyan-400 text-white shadow-xl shadow-sky-500/30 ring-4 ring-white/10">
                      <User size={40} />
                    </div>

                    <h3 className="mt-4 text-xl font-black">{userData?.name || userData?.username || "User"}</h3>
                    <p className="mt-0.5 text-xs font-semibold text-sky-300">{userData?.role || "Employee"}</p>

                    {userData?.dateOfBirth && (
                      <p className="mt-3 flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-slate-200 border border-white/10">
                        🎂 {fmtDob(userData.dateOfBirth)}
                      </p>
                    )}

                    <div className="mt-5 w-full space-y-2">
                      <div className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2.5 text-[11px]">
                        <span className="text-slate-400">Completion rate</span>
                        <span className="font-black text-emerald-400">{totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-400 transition-all" style={{ width: `${totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0}%` }} />
                      </div>
                    </div>

                    <div className="mt-5 rounded-full border border-sky-400/20 bg-sky-500/10 px-3 py-1.5 text-[9px] text-sky-300">
                      Admin status synchronization enabled
                    </div>
                  </div>
                </div>

                {/* ACCOUNT INFORMATION */}
                <div className="rounded-3xl border border-slate-200 bg-white p-6 lg:col-span-2">
                  <h3 className="mb-5 flex items-center gap-2 text-sm font-bold text-slate-900">
                    <Info size={15} className="text-sky-600" /> Account Information
                  </h3>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <ProfileRow icon={<User size={14} />} label="Username" value={userData?.name || userData?.username || "Not available"} />
                    <ProfileRow icon={<ShieldCheck size={14} />} label="Role" value={userData?.role || "user"} />
                    <ProfileRow icon={<CalendarDays size={14} />} label="Date of Birth" value={userData?.dateOfBirth ? fmtDob(userData.dateOfBirth) : "Not set"} />
                    {userData?.learningMode && <ProfileRow icon={<CheckSquare size={14} />} label="Mode of Learning" value={userData.learningMode} />}
                    {userData?.department && <ProfileRow icon={<FolderKanban size={14} />} label="Department" value={userData.department} />}
                    <ProfileRow icon={<Hash size={14} />} label="User ID" value={userData?._id || userData?.id || "Not available"} mono />
                  </div>

                  <h3 className="mb-4 mt-6 flex items-center gap-2 text-sm font-bold text-slate-900">
                    <Activity size={15} className="text-sky-600" /> Work Statistics
                  </h3>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <StatPill icon={<FileText size={16} />} label="Total Tasks" value={totalTasks} tone="slate" />
                    <StatPill icon={<CheckCircle size={16} />} label="Completed" value={completedTasks} tone="emerald" />
                    <StatPill icon={<Upload size={16} />} label="Submitted Work" value={submittedTasks} tone="sky" />
                  </div>
                </div>

              </div>

            </div>
          )}

        </div>

      </main>

    </div>
  );
}

// ===========================================================
// TASK LIST
// ===========================================================

function TaskList({
  tasks,
  todayDoneTitles,
  loading,
  formatDate,
  getStatusClass,
  getStatusIcon,
  getSubmissionStatus,
  getSubmissionStatusClass,
  getSubmissionStatusLabel,
  getSubmissionContent,
  getSubmissionUrl,
  getSubmittedAt,
  getSubmissionCommand,
  hasSubmission,
  submissionTaskId,
  setSubmissionTaskId,
  submissionContent,
  setSubmissionContent,
  submissionUrl,
  setSubmissionUrl,
  submitTaskWork,
  submittingTaskId,
  addComment,
  commentText,
  setCommentText,
  commentTaskId,
  setCommentTaskId,
  commentingTaskId,
}) {
  const [expandedId, setExpandedId] = useState(null);

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl py-16 text-center">
        <Loader2 size={30} className="animate-spin mx-auto text-sky-500" />
        <p className="text-xs text-slate-500 mt-3">Loading tasks...</p>
      </div>
    );
  }

  if (!tasks.length) {
    return (
      <EmptyState
        icon={<CheckSquare size={32} />}
        title="No tasks assigned"
        description="Tasks assigned by the administrator will appear here."
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {tasks.map((task) => {
        const submissionStatus = getSubmissionStatusLabel(task);
        const content = getSubmissionContent(task);
        const url = getSubmissionUrl(task);
        const command = getSubmissionCommand(task);
        const submittedAt = getSubmittedAt(task);
        const alreadySubmitted = hasSubmission(task);
        const taskStatus = normalizeDisplayStatus(task.status);
        const isTech = task.projectType === "Technologies";
        const remainingItems = isTech ? (task.workItems || []).filter((i) => !todayDoneTitles.has(i.title)) : [];
        const expanded = expandedId === task._id;

        return (
          <div key={task._id} className="border-b border-slate-100 last:border-b-0">

            {/* ===== COMPACT ROW (always visible) ===== */}
            <button
              type="button"
              onClick={() => setExpandedId(expanded ? null : task._id)}
              className="flex w-full flex-col gap-3 px-4 py-3 text-left transition hover:bg-slate-50/80 sm:flex-row sm:items-center sm:gap-4"
              aria-expanded={expanded}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
                <CheckSquare size={17} />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h3 className="truncate text-sm font-bold text-slate-900">{task.title || "Untitled Task"}</h3>
                  {isTech && (
                    <span className="shrink-0 rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-[10px] font-black text-teal-700">Technologies</span>
                  )}
                </div>
                {isTech ? (
                  remainingItems.length === 0 ? (
                    <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-emerald-600">
                      <CheckCircle size={12} /> All done for today!
                    </p>
                  ) : (
                    <p className="mt-1 truncate text-[11px] text-slate-500">
                      {remainingItems.length} of {task.workItems?.length || 0} item{task.workItems?.length === 1 ? "" : "s"} still to do today
                    </p>
                  )
                ) : (
                  <p className="mt-1 truncate text-[11px] text-slate-500">{task.description || "No description"}</p>
                )}
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                <span className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-bold ${getStatusClass(taskStatus)}`}>
                  {getStatusIcon(taskStatus, 12)}
                  {taskStatus}
                </span>
                {!isTech && (
                  <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-bold ${getSubmissionStatusClass(submissionStatus)}`}>
                    {submissionStatus}
                  </span>
                )}
                <ChevronDown size={16} className={`shrink-0 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
              </div>
            </button>

            {/* ===== EXPANDED DETAILS ===== */}
            {expanded && (
              <div className="border-t border-slate-100 bg-slate-50/40 p-4 sm:p-5">

                {isTech ? (
                  <>
                    <DomainChips domains={task.domains} className="mb-3" />
                    {remainingItems.length === 0 ? (
                      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-700">
                        <CheckCircle size={16} /> Everything allocated to you is ticked for today. New items reappear tomorrow.
                      </div>
                    ) : (
                      <WorkItemList items={remainingItems} domains={task.domains} className="rounded-xl bg-white p-3" />
                    )}
                    <div className="mt-4 flex items-start gap-2 rounded-xl border border-sky-100 bg-sky-50 p-3">
                      <Info size={14} className="mt-0.5 shrink-0 text-sky-600" />
                      <p className="text-[11px] leading-relaxed text-sky-700">
                        This is daily, recurring work - tick what you complete each day in your <strong>Daily Report</strong>. It is not "submitted" here like a one-off task.
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="mb-4 whitespace-pre-wrap text-xs leading-relaxed text-slate-600">{task.description || "No description"}</p>

                    <AdminStatusMessage status={taskStatus} hasSubmission={alreadySubmitted} />

                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <InfoCard icon={<User size={14} />} title="Assigned By" value={task.assignedBy || "Admin"} />
                      <InfoCard icon={<CalendarDays size={14} />} title="Assigned At" value={formatDate(task.assignedAt)} />
                      <InfoCard icon={<Clock size={14} />} title="Due Date" value={formatDate(task.dueDate)} />
                    </div>

                    {/* WORK SUBMISSION */}
                    <div className="mt-5 overflow-hidden rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50/80 to-cyan-50/50">
                      <div className="border-b border-sky-100 p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-600">
                              <Upload size={17} />
                            </div>
                            <div>
                              <h4 className="text-xs font-bold text-slate-900">Work Submission</h4>
                              <p className="mt-1 text-[9px] text-slate-500">Submit completed work and Google Drive link</p>
                            </div>
                          </div>
                          <span className={`w-fit shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-[9px] font-bold ${getSubmissionStatusClass(submissionStatus)}`}>
                            {submissionStatus}
                          </span>
                        </div>
                      </div>

                      <div className="p-4">
                        {alreadySubmitted ? (
                          <div className="rounded-2xl border border-sky-100 bg-white p-4">
                            <div className="mb-4 flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2">
                                <CheckCircle size={16} className="text-emerald-600" />
                                <span className="text-xs font-bold text-emerald-700">Work Submitted</span>
                              </div>
                              <span className={`shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-[9px] font-bold ${getSubmissionStatusClass(submissionStatus)}`}>
                                {submissionStatus}
                              </span>
                            </div>
                            <SubmissionDisplay content={content} url={url} command={command} submittedAt={submittedAt} formatDate={formatDate} />
                          </div>
                        ) : submissionTaskId === task._id ? (
                          <div className="space-y-4">
                            <div>
                              <label className="mb-1.5 block text-[10px] font-bold text-slate-700">Completed Work / Content Description</label>
                              <textarea
                                value={submissionContent}
                                onChange={(e) => setSubmissionContent(e.target.value)}
                                placeholder="Describe the work you completed..."
                                rows={6}
                                className="w-full resize-none rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-900 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                              />
                            </div>
                            <div>
                              <label className="mb-1.5 block text-[10px] font-bold text-slate-700">Google Drive / Work URL</label>
                              <div className="relative">
                                <LinkIcon size={15} className="absolute left-3 top-3.5 text-slate-400" />
                                <input
                                  type="url"
                                  value={submissionUrl}
                                  onChange={(e) => setSubmissionUrl(e.target.value)}
                                  placeholder="https://drive.google.com/..."
                                  className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-3 text-xs text-slate-900 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                                />
                              </div>
                            </div>
                            <div className="flex items-start gap-2 rounded-xl border border-sky-100 bg-sky-50 p-3">
                              <Info size={14} className="mt-0.5 shrink-0 text-sky-600" />
                              <p className="text-[9px] leading-relaxed text-sky-700">
                                Submitting your work does not automatically make the task Completed. The administrator will review your submission and control the final task status.
                              </p>
                            </div>
                            <div className="flex flex-col gap-2 sm:flex-row">
                              <button
                                onClick={() => submitTaskWork(task._id)}
                                disabled={submittingTaskId === task._id}
                                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-sky-600 py-3 text-xs font-semibold text-white transition hover:bg-sky-700 disabled:opacity-50"
                              >
                                {submittingTaskId === task._id ? (
                                  <>
                                    <Loader2 size={15} className="animate-spin" /> Submitting...
                                  </>
                                ) : (
                                  <>
                                    <Send size={14} /> Submit Work
                                  </>
                                )}
                              </button>
                              <button
                                onClick={() => {
                                  setSubmissionTaskId(null);
                                  setSubmissionContent("");
                                  setSubmissionUrl("");
                                }}
                                className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-xs text-slate-700 hover:bg-slate-50"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <button
                              onClick={() => {
                                setSubmissionTaskId(task._id);
                                setSubmissionContent("");
                                setSubmissionUrl("");
                              }}
                              className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 py-3 text-xs font-semibold text-white shadow-lg shadow-sky-600/10 transition hover:bg-sky-700"
                            >
                              <Upload size={15} /> Add Completed Work & Drive Link
                            </button>
                            <p className="mt-2 text-center text-[9px] text-slate-400">Submit your completed work for administrator review.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {/* COMMENTS - shared by every task type */}
                <div className="mt-5 rounded-2xl border border-slate-100 bg-white/70 p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MessageSquare size={15} className="text-sky-600" />
                      <h4 className="text-xs font-bold">Comments</h4>
                    </div>
                    {task.comments?.length > 0 && (
                      <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[9px]">{task.comments.length} comments</span>
                    )}
                  </div>

                  {task.comments?.length > 0 && (
                    <div className="mb-4 space-y-2">
                      {task.comments.map((comment, index) => (
                        <div key={comment?._id || index} className="rounded-xl border border-slate-200 bg-white p-3">
                          <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-center">
                            <strong className="text-xs text-slate-800">{comment?.userName || "User"}</strong>
                            <span className="text-[9px] text-slate-400">{formatDate(comment?.createdAt)}</span>
                          </div>
                          <p className="mt-2 whitespace-pre-wrap text-xs text-slate-600">{comment?.comment || ""}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {commentTaskId === task._id ? (
                    <div className="space-y-2">
                      <textarea
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        placeholder="Enter your comment..."
                        rows={3}
                        className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => addComment(task._id)}
                          disabled={commentingTaskId === task._id}
                          className="flex-1 rounded-xl bg-slate-950 py-2.5 text-xs text-white transition hover:bg-slate-800 disabled:opacity-50"
                        >
                          {commentingTaskId === task._id ? "Adding..." : (
                            <>
                              <Send size={14} className="mr-2 inline" /> Add Comment
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => {
                            setCommentTaskId(null);
                            setCommentText("");
                          }}
                          className="rounded-xl border border-slate-200 bg-white px-4 text-xs hover:bg-slate-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setCommentTaskId(task._id)}
                      className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold transition hover:border-sky-200 hover:text-sky-600"
                    >
                      <MessageSquare size={14} /> Add Comment
                    </button>
                  )}
                </div>

                <div className="mt-3 flex flex-col justify-between gap-1 text-[9px] text-slate-400 sm:flex-row">
                  <p>Last Updated: {formatDate(task.updatedAt)}</p>
                  <p className="break-all text-slate-300">Task ID: {task._id}</p>
                </div>

              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ===========================================================
// DISPLAY STATUS
// ===========================================================

function normalizeDisplayStatus(status) {
  const value = String(
    status || "Pending"
  )
    .trim()
    .toLowerCase();

  if (
    value === "completed" ||
    value === "complete" ||
    value === "done"
  ) {
    return "Completed";
  }

  if (
    value === "in progress" ||
    value === "in-progress" ||
    value === "progress"
  ) {
    return "In Progress";
  }

  return "Pending";
}

// ===========================================================
// ADMIN STATUS MESSAGE
// ===========================================================

function AdminStatusMessage({
  status,
  hasSubmission,
}) {
  const normalized =
    String(status || "Pending")
      .trim()
      .toLowerCase();

  if (normalized === "completed") {
    return (
      <div className="mt-5 flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-3">

        <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
          <CheckCircle size={16} />
        </div>

        <div>

          <p className="text-[10px] font-bold text-emerald-800">
            Administrator marked this task Completed
          </p>

          <p className="text-[9px] text-emerald-700 mt-1">
            Your task has been completed and approved at the task-status level.
          </p>

        </div>

      </div>
    );
  }

  if (normalized === "in progress") {
    return (
      <div className="mt-5 flex items-start gap-3 bg-sky-50 border border-sky-200 rounded-xl p-3">

        <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-600 flex items-center justify-center shrink-0">
          <Activity size={16} />
        </div>

        <div>

          <p className="text-[10px] font-bold text-sky-800">
            Administrator marked this task In Progress
          </p>

          <p className="text-[9px] text-sky-700 mt-1">
            Continue working on the task and provide an updated submission if required.
          </p>

        </div>

      </div>
    );
  }

  return (
    <div className="mt-5 flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl p-3">

      <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">

        {hasSubmission ? (
          <RotateCcw size={16} />
        ) : (
          <Clock size={16} />
        )}

      </div>

      <div>

        <p className="text-[10px] font-bold text-blue-900">
          Administrator Status: Pending
        </p>

        <p className="text-[9px] text-blue-700 mt-1 leading-relaxed">
          {hasSubmission
            ? "Your submitted work is not currently marked as completed by the administrator. Please review the comments or update your work if requested."
            : "This task is currently pending. Start working on it when instructed."}
        </p>

      </div>

    </div>
  );
}

// ===========================================================
// SUBMISSION DISPLAY
// ===========================================================

function SubmissionDisplay({
  content,
  url,
  command,
  submittedAt,
  formatDate,
}) {
  if (
    !content &&
    !url &&
    !command
  ) {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">

        <p className="text-xs text-slate-500">
          No work submission found.
        </p>

      </div>
    );
  }

  return (
    <div className="space-y-4">

      {content && (
        <div>

          <p className="text-[9px] uppercase font-bold text-slate-400 mb-1.5">
            Completed Work / Content
          </p>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">

            <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
              {content}
            </p>

          </div>

        </div>
      )}

      {command && (
        <div>

          <p className="text-[9px] uppercase font-bold text-slate-400 mb-1.5">
            Administrator Note / Comment
          </p>

          <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">

            <p className="text-xs text-amber-800 whitespace-pre-wrap">
              {command}
            </p>

          </div>

        </div>
      )}

      {url && (
        <div>

          <p className="text-[9px] uppercase font-bold text-slate-400 mb-1.5">
            Work / Google Drive Link
          </p>

          <div className="bg-sky-50 border border-sky-100 rounded-xl p-3">

            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-xs text-sky-700 font-semibold hover:text-sky-900 hover:underline break-all"
            >

              <LinkIcon size={14} />

              <span className="break-all">
                {url}
              </span>

              <ExternalLink size={12} />

            </a>

          </div>

        </div>
      )}

      {submittedAt && (
        <p className="text-[9px] text-slate-400">
          Submitted:{" "}
          {formatDate(submittedAt)}
        </p>
      )}

    </div>
  );
}

// ===========================================================
// STAT CARD
// ===========================================================

function StatCard({
  title,
  value,
  icon,
  description,
  accent = "blue",
}) {
  const accentClasses = {
    blue: "bg-blue-50 text-blue-600",
    sky: "bg-sky-50 text-sky-600",
    emerald:
      "bg-emerald-50 text-emerald-600",
    cyan: "bg-cyan-50 text-cyan-600",
    indigo: "bg-indigo-50 text-indigo-600",
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition">

      <div className="flex justify-between gap-3">

        <div className="min-w-0">

          <p className="text-[10px] uppercase text-slate-400 font-semibold tracking-wide">
            {title}
          </p>

          <p className="text-2xl font-bold mt-2 text-slate-900">
            {value}
          </p>

          <p className="text-[9px] text-slate-400 mt-1">
            {description}
          </p>

        </div>

        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            accentClasses[accent]
          }`}
        >
          {icon}
        </div>

      </div>

    </div>
  );
}

// ===========================================================
// INFO CARD
// ===========================================================

function InfoCard({
  icon,
  title,
  value,
}) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">

      <div className="flex items-center gap-2 text-slate-400">

        {icon}

        <span className="text-[9px] uppercase tracking-wide">
          {title}
        </span>

      </div>

      <p className="text-xs font-semibold mt-2 text-slate-800 break-words">
        {String(value || "")}
      </p>

    </div>
  );
}

// ===========================================================
// PROFILE ROW
// ===========================================================

function ProfileRow({
  label,
  value,
  icon,
  mono,
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">

      <p className="flex items-center gap-1.5 text-[9px] font-semibold uppercase text-slate-400">
        {icon}
        {label}
      </p>

      <p className={`mt-1.5 text-sm font-semibold text-slate-800 break-all ${mono ? "font-mono text-xs" : ""}`}>
        {String(value ?? "")}
      </p>

    </div>
  );
}

// ===========================================================
// STAT PILL  (Profile tab work statistics)
// ===========================================================

function StatPill({ icon, label, value, tone = "slate" }) {
  const TONES = {
    slate: "bg-slate-50 text-slate-600 border-slate-200",
    emerald: "bg-emerald-50 text-emerald-600 border-emerald-200",
    sky: "bg-sky-50 text-sky-600 border-sky-200",
  };
  return (
    <div className={`rounded-xl border p-4 ${TONES[tone] || TONES.slate}`}>
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-2xl font-black">{value}</span>
      </div>
      <p className="mt-1 text-[10px] font-bold uppercase tracking-wide opacity-70">{label}</p>
    </div>
  );
}

// ===========================================================
// DATE OF BIRTH  ("YYYY-MM-DD" -> "17 June 1995", no timezone shift)
// ===========================================================

function fmtDob(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""));
  if (!m) return "Not set";
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const [, y, mo, d] = m;
  return `${Number(d)} ${MONTHS[Number(mo) - 1] || ""} ${y}`;
}

// ===========================================================
// EMPTY STATE
// ===========================================================

function EmptyState({
  icon,
  title,
  description,
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl py-16 text-center">

      <div className="w-14 h-14 bg-sky-50 rounded-full flex items-center justify-center mx-auto text-sky-300">
        {icon}
      </div>

      <h3 className="font-bold text-sm mt-4 text-slate-700">
        {title}
      </h3>

      <p className="text-[10px] text-slate-400 mt-1 max-w-md mx-auto px-4">
        {description}
      </p>

    </div>
  );
}