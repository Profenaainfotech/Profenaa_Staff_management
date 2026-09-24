import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  LayoutDashboard,
  BarChart3,
  FileText,
  Bell,
  BellRing,
  Users,
  Megaphone,
  Store,
  Database,
  Settings,
  FolderKanban,
  Trash2,
  LogOut,
  HelpCircle,
  Activity,
  CheckSquare,
  UserPlus,
  Edit,
  Eye,
  CheckCircle,
  CheckCircle2,
  X,
  Menu,
  PlusCircle,
  RefreshCw,
  Search,
  Clock,
  UserCheck,
  UserX,
  CalendarDays,
  CalendarClock,
  ExternalLink,
  Link as LinkIcon,
  ClipboardCheck,
  AlertTriangle,
  ShieldAlert,
  Volume2,
  VolumeX,
  Timer,
  TrendingUp,
  Zap,
  CircleAlert,
  ListChecks,
  Phone,
} from "lucide-react";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import ProjectManagement from "../Component/ProjectManagement";
import AdminAttendance from "../Component/AdminAttendance";

// Wi-Fi attendance, staff directory, leaves and live notifications
import AdminAttendanceHub from "./wifi/AdminAttendanceHub";
import WifiSetup from "./wifi/WifiSetup";
import StaffDirectory from "./wifi/StaffDirectory";
import AdminLeaves from "./wifi/AdminLeaves";
import NotificationCenter from "./wifi/NotificationCenter";
import AdminDailyReports from "./wifi/AdminDailyReports";
import OvertimePanel from "./wifi/OvertimePanel";
import ProjectLeaderboard from "./projects/ProjectLeaderboard";
import ProjectFormModal from "./projects/ProjectFormModal";
import SidebarScroll from "./SidebarScroll";
import { API_ORIGIN } from "../lib/api";
import {
  Wifi as WifiNavIcon,
  Contact as StaffNavIcon,
  CalendarOff as LeavesNavIcon,
  ClipboardList as ReportsNavIcon,
} from "lucide-react";

/* =========================================================
   API
========================================================= */

const USER_API_URL = `${API_ORIGIN}/api/UserAccounts`;

const TASK_API_URL = `${API_ORIGIN}/api/Task`;

/* =========================================================
   CONFIGURATION
========================================================= */

const DUE_SOON_MS =
  24 * 60 * 60 * 1000;

const REFRESH_INTERVAL =
  10000;

const NOTIFICATION_STORAGE_KEY =
  "profenaa_admin_deadline_notifications";

const SUBMISSION_NOTIFICATION_STORAGE_KEY =
  "profenaa_admin_submission_notifications";

const MAX_STORED_NOTIFICATION_KEYS =
  300;

const MAX_STORED_SUBMISSION_KEYS =
  500;

/* =========================================================
   SAFE HELPERS
========================================================= */

const toSafeText = (value) => {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value
      .map((item) =>
        toSafeText(item)
      )
      .filter(Boolean)
      .join("\n");
  }

  if (typeof value === "object") {
    return toSafeText(
      value.comment ??
        value.text ??
        value.message ??
        value.content ??
        value.remarks ??
        value.note ??
        value.description ??
        value.name ??
        value.username ??
        value.userName ??
        ""
    );
  }

  return "";
};

const getSafeName = (value) => {
  if (!value) {
    return "Unknown";
  }

  if (
    typeof value === "object"
  ) {
    return (
      toSafeText(
        value.name ??
          value.username ??
          value.userName ??
          value.fullName
      ) || "Unknown"
    );
  }

  return String(value);
};

const getSafeMobile = (value) => {
  if (!value) {
    return "";
  }

  if (
    typeof value === "object"
  ) {
    return toSafeText(
      value.mobile ??
        value.mobileNumber ??
        value.phone ??
        value.phoneNumber ??
        value.contactNumber ??
        ""
    );
  }

  return String(value);
};

const getUserId = (value) => {
  if (!value) return "";

  if (
    typeof value === "object"
  ) {
    return (
      value._id ||
      value.id ||
      value.userId ||
      ""
    );
  }

  return String(value);
};

const normalizeStatus = (
  status
) =>
  String(
    status || "Pending"
  )
    .trim()
    .toLowerCase();

/* =========================================================
   SUBMISSION HELPERS
========================================================= */

const getSubmissionText = (
  submission,
  fields = []
) => {
  if (!submission) return "";

  for (const field of fields) {
    const value =
      submission[field];

    const safeValue =
      toSafeText(value);

    if (
      safeValue.trim() !== ""
    ) {
      return safeValue;
    }
  }

  return "";
};

const getSubmissionDriveLink = (
  submission
) => {
  return getSubmissionText(
    submission,
    [
      "taskUrl",
      "driveLink",
      "driveURL",
      "driveUrl",
      "googleDriveLink",
      "googleDriveUrl",
      "submissionLink",
      "workLink",
      "url",
      "link",
    ]
  );
};

const getSubmissionContent = (
  submission
) => {
  return getSubmissionText(
    submission,
    [
      "submissionContent",
      "content",
      "contentDescription",
      "description",
      "workDescription",
      "work",
      "submittedWork",
      "submittedContent",
      "progress",
      "details",
    ]
  );
};

const getSubmissionCommand = (
  submission
) => {
  return getSubmissionText(
    submission,
    [
      "command",
      "commands",
      "remarks",
      "remark",
      "note",
      "notes",
      "comment",
      "comments",
    ]
  );
};

const getSubmissionType = (
  submission
) => {
  return (
    getSubmissionText(
      submission,
      [
        "submissionType",
        "type",
        "workType",
      ]
    ) ||
    "Work Submission"
  );
};

const getSubmissionDate = (
  submission
) => {
  if (!submission) {
    return null;
  }

  return (
    submission.submittedAt ||
    submission.submittedOn ||
    submission.submissionDate ||
    submission.createdAt ||
    submission.updatedAt ||
    null
  );
};

const normalizeSubmission = (
  submission,
  task = null,
  index = 0
) => {
  if (
    !submission ||
    typeof submission !==
      "object"
  ) {
    return null;
  }

  const taskId =
    submission.taskId ||
    submission.taskID ||
    submission.task?._id ||
    task?._id ||
    "";

  const taskTitle =
    toSafeText(
      submission.taskTitle ||
        submission.taskName ||
        submission.task?.title ||
        task?.title
    ) || "Task";

  const assignedTo =
    submission.assignedTo ||
    submission.userId ||
    submission.user?._id ||
    task?.assignedTo ||
    "";

  const assignedToName =
    getSafeName(
      submission.assignedToName ||
        submission.userName ||
        submission.user?.name ||
        submission.user?.username ||
        task?.assignedToName ||
        task?.userName
    );

  const driveLink =
    getSubmissionDriveLink(
      submission
    );

  const content =
    getSubmissionContent(
      submission
    );

  const command =
    getSubmissionCommand(
      submission
    );

  const submittedAt =
    getSubmissionDate(
      submission
    );

  return {
    ...submission,

    _id:
      submission._id ||
      submission.submissionId ||
      `${taskId}-submission-${index}`,

    taskId,

    taskTitle,

    assignedTo,

    assignedToName,

    userId:
      submission.userId ||
      getUserId(assignedTo),

    userName:
      submission.userName ||
      assignedToName,

    driveLink,

    submissionContent:
      content,

    command,

    submissionType:
      getSubmissionType(
        submission
      ),

    submittedAt,
  };
};

const extractSubmissionsFromTasks = (
  tasks
) => {
  if (!Array.isArray(tasks)) {
    return [];
  }

  const result = [];

  tasks.forEach((task) => {
    if (
      !task ||
      typeof task !==
        "object"
    ) {
      return;
    }

    const collections = [
      task.submissions,
      task.submittedWorks,
      task.workSubmissions,
      task.workSubmission,
      task.submission,
      task.submittedWork,
      task.work,
    ];

    let foundCollection =
      false;

    collections.forEach(
      (collection) => {
        if (
          collection ===
            null ||
          collection ===
            undefined
        ) {
          return;
        }

        if (
          Array.isArray(
            collection
          )
        ) {
          foundCollection =
            true;

          collection.forEach(
            (
              submission,
              index
            ) => {
              const normalized =
                normalizeSubmission(
                  submission,
                  task,
                  index
                );

              if (
                normalized
              ) {
                result.push(
                  normalized
                );
              }
            }
          );

          return;
        }

        if (
          typeof collection ===
          "object"
        ) {
          foundCollection =
            true;

          const normalized =
            normalizeSubmission(
              collection,
              task,
              result.length
            );

          if (
            normalized
          ) {
            result.push(
              normalized
            );
          }
        }
      }
    );

    const directDriveLink =
      getSubmissionDriveLink(
        task
      );

    const directContent =
      getSubmissionContent(
        task
      );

    const directCommand =
      getSubmissionCommand(
        task
      );

    const hasDirectSubmission =
      directDriveLink ||
      directContent ||
      directCommand ||
      task.submittedAt ||
      task.submittedOn ||
      task.submissionDate ||
      task.submissionType ||
      task.submissionStatus;

    if (
      !foundCollection &&
      hasDirectSubmission
    ) {
      const direct =
        normalizeSubmission(
          {
            ...task,

            taskId:
              task._id,

            taskTitle:
              task.taskTitle ||
              task.title,

            driveLink:
              directDriveLink,

            submissionContent:
              directContent,

            command:
              directCommand,

            submissionType:
              task.submissionType ||
              "Work Submission",

            submittedAt:
              task.submittedAt ||
              task.submittedOn ||
              task.submissionDate ||
              task.updatedAt,
          },
          task,
          result.length
        );

      if (direct) {
        result.push(direct);
      }
    }
  });

  return dedupeSubmissions(
    result
  );
};

const dedupeSubmissions = (
  submissions
) => {
  const unique = [];
  const seen = new Set();

  submissions.forEach(
    (item) => {
      if (!item) return;

      const key =
        item._id ||
        `${item.taskId}-${item.submittedAt}-${item.userId}-${item.driveLink}`;

      if (
        !seen.has(key)
      ) {
        seen.add(key);
        unique.push(item);
      }
    }
  );

  unique.sort(
    (a, b) =>
      new Date(
        b.submittedAt || 0
      ).getTime() -
      new Date(
        a.submittedAt || 0
      ).getTime()
  );

  return unique;
};

/* =========================================================
   SAFE EXTERNAL URL
========================================================= */

const getSafeExternalUrl = (
  value
) => {
  const raw =
    toSafeText(value).trim();

  if (!raw) {
    return "";
  }

  if (
    /^https?:\/\//i.test(raw)
  ) {
    return raw;
  }

  if (
    raw.startsWith("//")
  ) {
    return `https:${raw}`;
  }

  if (
    /^javascript:/i.test(raw)
  ) {
    return "";
  }

  return `https://${raw}`;
};

/* =========================================================
   MAIN COMPONENT
========================================================= */

export default function AdminDashboard() {
  const [
    activeTab,
    setActiveTab,
  ] = useState("Dashboard");

  const [
    userList,
    setUserList,
  ] = useState([]);

  const [
    taskList,
    setTaskList,
  ] = useState([]);

  const [
    submissionList,
    setSubmissionList,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    taskLoading,
    setTaskLoading,
  ] = useState(false);

  const [
    submissionLoading,
    setSubmissionLoading,
  ] = useState(false);

  const [
    currentTime,
    setCurrentTime,
  ] = useState(
    new Date()
  );

  /* SEARCH */

  const [
    userSearch,
    setUserSearch,
  ] = useState("");

  const [
    taskSearch,
    setTaskSearch,
  ] = useState("");

  const [
    submissionSearch,
    setSubmissionSearch,
  ] = useState("");

  /* MODALS */

  const [
    showCreateModal,
    setShowCreateModal,
  ] = useState(false);

  // "Create Staff" in the header opens the Staff Directory form
  const [staffAddSignal, setStaffAddSignal] = useState(0);

  // Small screens: the sidebar slides in from the left (menu button in the header)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!mobileMenuOpen) return undefined;

    const closeOnEscape = (event) => {
      if (event.key === "Escape") setMobileMenuOpen(false);
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileMenuOpen]);

  const [
    showEditModal,
    setShowEditModal,
  ] = useState(false);

  const [
    showAssignTaskModal,
    setShowAssignTaskModal,
  ] = useState(false);

  // Assigning a task now opens the same rich Project form used on the Projects screen -
  // one path for both. null = closed; "" or a staff id = open, optionally pre-selecting them.
  const [taskFormPreset, setTaskFormPreset] = useState(null);

  const [
    showSubmissionModal,
    setShowSubmissionModal,
  ] = useState(false);

  const [
    showEditTaskModal,
    setShowEditTaskModal,
  ] = useState(false);

  const [
    selectedUser,
    setSelectedUser,
  ] = useState(null);

  const [
    selectedSubmission,
    setSelectedSubmission,
  ] = useState(null);

  const [
    selectedTask,
    setSelectedTask,
  ] = useState(null);

  /* USER */

  const [
    name,
    setName,
  ] = useState("");

  const [
    mobile,
    setMobile,
  ] = useState("");

  const [
    password,
    setPassword,
  ] = useState("");

  /* TASK */

  const [
    taskTitle,
    setTaskTitle,
  ] = useState("");

  const [
    taskDescription,
    setTaskDescription,
  ] = useState("");

  const [
    taskAssignees,
    setTaskAssignees,
  ] = useState([]);

  const [
    taskDueDate,
    setTaskDueDate,
  ] = useState("");

  /* EDIT TASK (used to update the due date and other details
     of a task that has already been assigned) */

  const [
    editTaskTitle,
    setEditTaskTitle,
  ] = useState("");

  const [
    editTaskDescription,
    setEditTaskDescription,
  ] = useState("");

  const [
    editTaskDueDate,
    setEditTaskDueDate,
  ] = useState("");

  const [
    editTaskSaving,
    setEditTaskSaving,
  ] = useState(false);

  /* =====================================================
     NOTIFICATION STATE
  ===================================================== */

  const [
    showNotifications,
    setShowNotifications,
  ] = useState(false);

  const [
    alertsEnabled,
    setAlertsEnabled,
  ] = useState(false);

  const [
    desktopNotificationsEnabled,
    setDesktopNotificationsEnabled,
  ] = useState(false);

  const [
    notificationItems,
    setNotificationItems,
  ] = useState([]);

  const [
    dismissedNotificationIds,
    setDismissedNotificationIds,
  ] = useState([]);

  const [
    unreadCount,
    setUnreadCount,
  ] = useState(0);

  const [
    monitorInitialized,
    setMonitorInitialized,
  ] = useState(false);

  /* =====================================================
     WORK SUBMISSION NOTIFICATION STATE
  ===================================================== */

  const [
    submissionNotifications,
    setSubmissionNotifications,
  ] = useState([]);

  const [
    dismissedSubmissionNotificationIds,
    setDismissedSubmissionNotificationIds,
  ] = useState([]);

  const [
    unreadSubmissionCount,
    setUnreadSubmissionCount,
  ] = useState(0);

  const notificationKeysRef =
    useRef(
      new Set()
    );

  const submissionKeysRef =
    useRef(
      new Set()
    );

  const submissionInitializedRef =
    useRef(false);

  const audioContextRef =
    useRef(null);

  const lastAlarmRef =
    useRef(0);

  const lastSubmissionAlarmRef =
    useRef(0);

  /* =====================================================
     CLOCK
  ===================================================== */

  useEffect(() => {
    const timer =
      setInterval(() => {
        setCurrentTime(
          new Date()
        );
      }, 1000);

    return () =>
      clearInterval(timer);
  }, []);

  /* =====================================================
     INITIAL DATA
  ===================================================== */

  useEffect(() => {
    fetchUsers();
    fetchTasks();
    fetchSubmissions();

    loadStoredNotificationKeys();
    loadStoredSubmissionKeys();

    if (
      typeof Notification !==
      "undefined"
    ) {
      setDesktopNotificationsEnabled(
        Notification.permission ===
          "granted"
      );
    }
  }, []);

  /* =====================================================
     AUTO REFRESH
  ===================================================== */

  useEffect(() => {
    const interval =
      setInterval(() => {
        fetchUsers();
        fetchTasks();
        fetchSubmissions();
      }, REFRESH_INTERVAL);

    return () =>
      clearInterval(interval);
  }, []);

  /* =====================================================
     AUTH HEADERS
  ===================================================== */

  const authHeaders = () => {
    const token =
      localStorage.getItem(
        "adminToken"
      );

    return {
      "Content-Type":
        "application/json",

      ...(token
        ? {
            Authorization: `Bearer ${token}`,
          }
        : {}),
    };
  };

  /* =====================================================
     LOAD STORED NOTIFICATION KEYS
  ===================================================== */

  const loadStoredNotificationKeys =
    () => {
      try {
        const saved =
          localStorage.getItem(
            NOTIFICATION_STORAGE_KEY
          );

        if (!saved) {
          return;
        }

        const parsed =
          JSON.parse(saved);

        if (
          Array.isArray(parsed)
        ) {
          notificationKeysRef.current =
            new Set(parsed);
        }
      } catch (error) {
        console.warn(
          "Notification history could not be loaded:",
          error
        );
      }
    };

  const saveNotificationKeys =
    () => {
      try {
        const values =
          Array.from(
            notificationKeysRef.current
          ).slice(
            -MAX_STORED_NOTIFICATION_KEYS
          );

        localStorage.setItem(
          NOTIFICATION_STORAGE_KEY,
          JSON.stringify(
            values
          )
        );
      } catch (error) {
        console.warn(
          "Notification history could not be saved:",
          error
        );
      }
    };

  /* =====================================================
     LOAD STORED SUBMISSION NOTIFICATION KEYS
  ===================================================== */

  const loadStoredSubmissionKeys =
    () => {
      try {
        const saved =
          localStorage.getItem(
            SUBMISSION_NOTIFICATION_STORAGE_KEY
          );

        if (!saved) {
          return;
        }

        const parsed =
          JSON.parse(saved);

        if (
          Array.isArray(parsed)
        ) {
          submissionKeysRef.current =
            new Set(parsed);

          if (parsed.length > 0) {
            submissionInitializedRef.current = true;
          }
        }
      } catch (error) {
        console.warn(
          "Submission notification history could not be loaded:",
          error
        );
      }
    };

  const saveSubmissionKeys =
    () => {
      try {
        const values =
          Array.from(
            submissionKeysRef.current
          ).slice(
            -MAX_STORED_SUBMISSION_KEYS
          );

        localStorage.setItem(
          SUBMISSION_NOTIFICATION_STORAGE_KEY,
          JSON.stringify(
            values
          )
        );
      } catch (error) {
        console.warn(
          "Submission notification history could not be saved:",
          error
        );
      }
    };

  /* =====================================================
     PROCESS NEW WORK SUBMISSIONS (notification + alarm)
  ===================================================== */

  const processSubmissionNotifications =
    (list) => {
      if (
        !Array.isArray(list) ||
        list.length === 0
      ) {
        return;
      }

      const newOnes = [];

      list.forEach(
        (submission) => {
          const key =
            submission?._id;

          if (!key) {
            return;
          }

          if (
            !submissionKeysRef.current.has(
              key
            )
          ) {
            submissionKeysRef.current.add(
              key
            );

            if (
              submissionInitializedRef.current
            ) {
              newOnes.push(
                submission
              );
            }
          }
        }
      );

      if (newOnes.length > 0) {
        saveSubmissionKeys();

        setSubmissionNotifications(
          (current) => {
            const additions =
              newOnes.map(
                (submission) => ({
                  id: `submission-${submission._id}`,
                  type: "submission",
                  submission,
                  title:
                    "New Work Submission",
                  message: `${getSafeName(
                    submission.userName ||
                      submission.assignedToName ||
                      submission.assignedTo
                  )} submitted work for "${
                    submission.taskTitle ||
                    "a task"
                  }".`,
                })
              );

            return [
              ...additions,
              ...current,
            ].slice(0, 100);
          }
        );

        setUnreadSubmissionCount(
          (count) =>
            count +
            newOnes.length
        );

        if (
          desktopNotificationsEnabled
        ) {
          newOnes.forEach(
            (submission) => {
              sendDesktopNotification(
                "📥 New Work Submission",
                `${getSafeName(
                  submission.userName ||
                    submission.assignedToName ||
                    submission.assignedTo
                )} — ${
                  submission.taskTitle ||
                  "Task"
                }`
              );
            }
          );
        }

        if (alertsEnabled) {
          const now =
            Date.now();

          if (
            now -
              lastSubmissionAlarmRef.current >
            5000
          ) {
            playAlarm();

            lastSubmissionAlarmRef.current =
              now;
          }
        }
      }

      if (
        !submissionInitializedRef.current
      ) {
        submissionInitializedRef.current = true;

        saveSubmissionKeys();
      }
    };

  /* =====================================================
     FETCH USERS
  ===================================================== */

  const fetchUsers =
    async () => {
      setLoading(true);

      try {
        const response =
          await fetch(
            `${USER_API_URL}/get-All-Profiles`,
            {
              headers:
                authHeaders(),
            }
          );

        const data =
          await response.json();

        if (
          !response.ok
        ) {
          throw new Error(
            data.message ||
              "Failed to load users"
          );
        }

        const users =
          Array.isArray(data)
            ? data
            : data.getprofile ||
              data.users ||
              data.userList ||
              data.data ||
              data.accounts ||
              [];

        setUserList(
          Array.isArray(
            users
          )
            ? users
            : []
        );
      } catch (error) {
        console.error(
          "FETCH USERS ERROR:",
          error
        );
      } finally {
        setLoading(false);
      }
    };

  /* =====================================================
     FETCH TASKS
  ===================================================== */

  const fetchTasks =
    async () => {
      setTaskLoading(true);

      try {
        const response =
          await fetch(
            `${TASK_API_URL}/get-all-tasks`,
            {
              headers:
                authHeaders(),
            }
          );

        const data =
          await response.json();

        if (
          !response.ok
        ) {
          throw new Error(
            data.message ||
              "Failed to load tasks"
          );
        }

        let tasks = [];

        if (
          Array.isArray(data)
        ) {
          tasks = data;
        } else if (
          Array.isArray(
            data.tasks
          )
        ) {
          tasks =
            data.tasks;
        } else if (
          Array.isArray(
            data.gettasks
          )
        ) {
          tasks =
            data.gettasks;
        } else if (
          Array.isArray(
            data.taskList
          )
        ) {
          tasks =
            data.taskList;
        } else if (
          Array.isArray(
            data.data
          )
        ) {
          tasks =
            data.data;
        } else if (
          data.data &&
          typeof data.data ===
            "object"
        ) {
          if (
            Array.isArray(
              data.data.tasks
            )
          ) {
            tasks =
              data.data.tasks;
          }
        }

        const safeTasks =
          Array.isArray(
            tasks
          )
            ? tasks
            : [];

        setTaskList(
          safeTasks
        );

        const embedded =
          extractSubmissionsFromTasks(
            safeTasks
          );

        if (
          embedded.length > 0
        ) {
          setSubmissionList(
            (current) => {
              const merged =
                dedupeSubmissions(
                  [
                    ...current,
                    ...embedded,
                  ]
                );

              processSubmissionNotifications(
                merged
              );

              return merged;
            }
          );
        }
      } catch (error) {
        console.error(
          "FETCH TASKS ERROR:",
          error
        );
      } finally {
        setTaskLoading(false);
      }
    };

  /* =====================================================
     FETCH SUBMISSIONS
  ===================================================== */

  const fetchSubmissions =
    async () => {
      setSubmissionLoading(
        true
      );

      try {
        const response =
          await fetch(
            `${TASK_API_URL}/submissions`,
            {
              headers:
                authHeaders(),
            }
          );

        if (
          response.ok
        ) {
          const data =
            await response.json();

          let submissions =
            [];

          if (
            Array.isArray(data)
          ) {
            submissions =
              data;
          } else if (
            Array.isArray(
              data.submissions
            )
          ) {
            submissions =
              data.submissions;
          } else if (
            Array.isArray(
              data.submittedWorks
            )
          ) {
            submissions =
              data.submittedWorks;
          } else if (
            Array.isArray(
              data.workSubmissions
            )
          ) {
            submissions =
              data.workSubmissions;
          } else if (
            data.data &&
            Array.isArray(
              data.data.submissions
            )
          ) {
            submissions =
              data.data.submissions;
          } else if (
            Array.isArray(
              data.data
            )
          ) {
            submissions =
              data.data;
          }

          const normalized =
            submissions
              .map(
                (
                  submission,
                  index
                ) =>
                  normalizeSubmission(
                    submission,
                    null,
                    index
                  )
              )
              .filter(Boolean);

          if (
            normalized.length >
            0
          ) {
            setSubmissionList(
              normalized
            );

            processSubmissionNotifications(
              normalized
            );

            return;
          }
        }

        const embedded =
          extractSubmissionsFromTasks(
            taskList
          );

        setSubmissionList(
          embedded
        );

        processSubmissionNotifications(
          embedded
        );
      } catch (error) {
        console.warn(
          "Dedicated submissions endpoint unavailable. Using task fallback.",
          error
        );

        const embedded =
          extractSubmissionsFromTasks(
            taskList
          );

        setSubmissionList(
          embedded
        );

        processSubmissionNotifications(
          embedded
        );
      } finally {
        setSubmissionLoading(
          false
        );
      }
    };

  /* =====================================================
     REFRESH
  ===================================================== */

  const refreshAll =
    async () => {
      await Promise.all([
        fetchUsers(),
        fetchTasks(),
        fetchSubmissions(),
      ]);
    };

  /* =====================================================
     CREATE USER
  ===================================================== */

  const handleCreateUser =
    async (e) => {
      e.preventDefault();

      if (
        !name.trim() ||
        !mobile.trim() ||
        !password.trim()
      ) {
        alert(
          "Please enter username, mobile number and password."
        );
        return;
      }

      if (
        !/^[0-9+\-\s()]{7,15}$/.test(
          mobile.trim()
        )
      ) {
        alert(
          "Please enter a valid mobile number."
        );
        return;
      }

      try {
        const response =
          await fetch(
            `${USER_API_URL}/create-Account`,
            {
              method: "POST",
              headers:
                authHeaders(),
              body: JSON.stringify(
                {
                  name:
                    name.trim(),
                  mobile:
                    mobile.trim(),
                  password,
                  role: "user",
                }
              ),
            }
          );

        const data =
          await response.json();

        if (
          !response.ok
        ) {
          throw new Error(
            data.message ||
              "Failed to create user"
          );
        }

        alert(
          "User created successfully!"
        );

        await fetchUsers();

        setName("");
        setMobile("");
        setPassword("");
        setShowCreateModal(
          false
        );
      } catch (error) {
        console.error(
          "CREATE USER ERROR:",
          error
        );

        alert(
          `User creation failed: ${error.message}`
        );
      }
    };

  /* =====================================================
     EDIT USER
  ===================================================== */

  const handleEditUser =
    (user) => {
      setSelectedUser(
        user
      );

      setName(
        user?.name || ""
      );

      setMobile(
        getSafeMobile(user) || ""
      );

      setPassword("");

      setShowEditModal(
        true
      );
    };

  /* =====================================================
     UPDATE USER
  ===================================================== */

  const handleUpdateUser =
    async (e) => {
      e.preventDefault();

      if (
        !selectedUser?._id
      ) {
        alert(
          "User ID is missing."
        );
        return;
      }

      if (
        mobile.trim() &&
        !/^[0-9+\-\s()]{7,15}$/.test(
          mobile.trim()
        )
      ) {
        alert(
          "Please enter a valid mobile number."
        );
        return;
      }

      try {
        const response =
          await fetch(
            `${USER_API_URL}/update-PasswordById/${selectedUser._id}`,
            {
              method: "PUT",
              headers:
                authHeaders(),
              body: JSON.stringify(
                {
                  name:
                    name.trim(),
                  mobile:
                    mobile.trim(),
                  password,
                }
              ),
            }
          );

        const data =
          await response.json();

        if (
          !response.ok
        ) {
          throw new Error(
            data.message ||
              "Failed to update user"
          );
        }

        alert(
          "User updated successfully!"
        );

        await fetchUsers();

        setShowEditModal(
          false
        );

        setSelectedUser(
          null
        );

        setName("");
        setMobile("");
        setPassword("");
      } catch (error) {
        console.error(
          "UPDATE USER ERROR:",
          error
        );

        alert(
          `Update failed: ${error.message}`
        );
      }
    };

  /* =====================================================
     DELETE USER
  ===================================================== */

  const handleDeleteUser =
    async (userId) => {
      if (!userId) return;

      if (
        !window.confirm(
          "Are you sure you want to delete this user?"
        )
      ) {
        return;
      }

      try {
        const response =
          await fetch(
            `${USER_API_URL}/delete-Account/${userId}`,
            {
              method: "DELETE",
              headers:
                authHeaders(),
            }
          );

        const data =
          await response.json();

        if (
          !response.ok
        ) {
          throw new Error(
            data.message ||
              "Failed to delete user"
          );
        }

        alert(
          "User deleted successfully."
        );

        await fetchUsers();
      } catch (error) {
        console.error(
          "DELETE USER ERROR:",
          error
        );

        alert(
          `Delete failed: ${error.message}`
        );
      }
    };

  /* =====================================================
     OPEN ASSIGN TASK
  ===================================================== */

  const openAssignTaskModal =
    (user = null) => {
      setTaskFormPreset(
        user?._id || ""
      );
    };

  /* =====================================================
     TOGGLE ASSIGNEE
  ===================================================== */

  const toggleAssignee =
    (userId) => {
      if (!userId) return;

      setTaskAssignees(
        (current) =>
          current.includes(
            userId
          )
            ? current.filter(
                (id) =>
                  id !== userId
              )
            : [
                ...current,
                userId,
              ]
      );
    };

  const toggleAllAssignees =
    () => {
      const validIds =
        userList
          .map(
            (user) =>
              user?._id
          )
          .filter(Boolean);

      if (
        taskAssignees.length ===
          validIds.length &&
        validIds.length > 0
      ) {
        setTaskAssignees(
          []
        );
      } else {
        setTaskAssignees(
          validIds
        );
      }
    };

  /* =====================================================
     ASSIGN TASK
  ===================================================== */

  const handleAssignTask =
    async (e) => {
      e.preventDefault();

      if (
        !taskTitle.trim()
      ) {
        alert(
          "Please enter task title."
        );
        return;
      }

      const selectedUsers =
        userList.filter(
          (user) =>
            taskAssignees.includes(
              user?._id
            )
        );

      if (
        selectedUsers.length ===
        0
      ) {
        alert(
          "Please select at least one user."
        );
        return;
      }

      let dueDate = null;

      if (taskDueDate) {
        const parsed =
          new Date(
            taskDueDate
          );

        if (
          Number.isNaN(
            parsed.getTime()
          )
        ) {
          alert(
            "Invalid due date."
          );
          return;
        }

        dueDate =
          parsed.toISOString();
      }

      try {
        const results =
          await Promise.allSettled(
            selectedUsers.map(
              async (user) => {
                const response =
                  await fetch(
                    `${TASK_API_URL}/create-task`,
                    {
                      method:
                        "POST",
                      headers:
                        authHeaders(),
                      body: JSON.stringify(
                        {
                          title:
                            taskTitle.trim(),

                          description:
                            taskDescription.trim(),

                          assignedTo:
                            user._id,

                          assignedToName:
                            user.name,

                          assignedBy:
                            "Admin",

                          dueDate,

                          status:
                            "Pending",
                        }
                      ),
                    }
                  );

                const data =
                  await response.json();

                if (
                  !response.ok
                ) {
                  throw new Error(
                    data.message ||
                      `Failed to assign task to ${user.name}`
                  );
                }

                return data;
              }
            )
          );

        const successCount =
          results.filter(
            (result) =>
              result.status ===
              "fulfilled"
          ).length;

        const failedCount =
          results.filter(
            (result) =>
              result.status ===
              "rejected"
          ).length;

        if (
          successCount > 0
        ) {
          await fetchTasks();
        }

        if (
          failedCount === 0
        ) {
          alert(
            `Task assigned successfully to ${successCount} user${
              successCount !== 1
                ? "s"
                : ""
            }.`
          );

          setTaskTitle("");
          setTaskDescription(
            ""
          );
          setTaskDueDate("");
          setTaskAssignees(
            []
          );

          setShowAssignTaskModal(
            false
          );
        } else {
          alert(
            `Assigned to ${successCount} user(s). ${failedCount} assignment(s) failed.`
          );
        }
      } catch (error) {
        console.error(
          "ASSIGN TASK ERROR:",
          error
        );

        alert(
          `Task assignment failed: ${error.message}`
        );
      }
    };

  /* =====================================================
     OPEN EDIT TASK (update title/description/due date of
     a task that was already assigned)
  ===================================================== */

  const openEditTaskModal =
    (task) => {
      if (!task) return;

      setSelectedTask(task);

      setEditTaskTitle(
        task.title || ""
      );

      setEditTaskDescription(
        task.description || ""
      );

      if (task.dueDate) {
        const due = new Date(
          task.dueDate
        );

        if (
          !Number.isNaN(
            due.getTime()
          )
        ) {
          const offsetMs =
            due.getTimezoneOffset() *
            60000;

          const local = new Date(
            due.getTime() -
              offsetMs
          );

          setEditTaskDueDate(
            local
              .toISOString()
              .slice(0, 16)
          );
        } else {
          setEditTaskDueDate("");
        }
      } else {
        setEditTaskDueDate("");
      }

      setShowEditTaskModal(true);
    };

  /* =====================================================
     UPDATE TASK (persists the new due date / details)
  ===================================================== */

  const handleUpdateTask =
    async (e) => {
      e.preventDefault();

      const taskId =
        selectedTask?._id;

      if (!taskId) {
        alert(
          "Task ID is missing."
        );
        return;
      }

      if (!editTaskTitle.trim()) {
        alert(
          "Please enter a task title."
        );
        return;
      }

      let dueDate = null;

      if (editTaskDueDate) {
        const parsed = new Date(
          editTaskDueDate
        );

        if (
          Number.isNaN(
            parsed.getTime()
          )
        ) {
          alert(
            "Invalid due date."
          );
          return;
        }

        dueDate =
          parsed.toISOString();
      }

      setEditTaskSaving(true);

      try {
        const response =
          await fetch(
            `${TASK_API_URL}/update-task/${taskId}`,
            {
              method: "PUT",
              headers:
                authHeaders(),
              body: JSON.stringify(
                {
                  title:
                    editTaskTitle.trim(),
                  description:
                    editTaskDescription.trim(),
                  dueDate,
                  changedBy: "Admin",
                }
              ),
            }
          );

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data.message ||
              "Failed to update task"
          );
        }

        alert(
          "Task updated successfully."
        );

        await fetchTasks();

        setShowEditTaskModal(
          false
        );

        setSelectedTask(null);
      } catch (error) {
        console.error(
          "UPDATE TASK ERROR:",
          error
        );

        alert(
          `Task update failed: ${error.message}`
        );
      } finally {
        setEditTaskSaving(false);
      }
    };

  /* =====================================================
     UPDATE TASK STATUS
  ===================================================== */

  const toggleTaskStatus =
    async (task) => {
      const taskId =
        task?._id;

      if (!taskId) {
        return;
      }

      const current =
        normalizeStatus(
          task.status
        );

      let nextStatus =
        "Pending";

      if (
        current === "pending"
      ) {
        nextStatus =
          "In Progress";
      } else if (
        current ===
        "in progress"
      ) {
        nextStatus =
          "Completed";
      } else {
        nextStatus =
          "Pending";
      }

      try {
        const response =
          await fetch(
            `${TASK_API_URL}/update-status/${taskId}`,
            {
              method: "PUT",
              headers:
                authHeaders(),
              body: JSON.stringify(
                {
                  status:
                    nextStatus,
                  changedBy:
                    "Admin",
                }
              ),
            }
          );

        const data =
          await response.json();

        if (
          !response.ok
        ) {
          throw new Error(
            data.message ||
              "Failed to update task status"
          );
        }

        await fetchTasks();
      } catch (error) {
        console.error(
          "STATUS UPDATE ERROR:",
          error
        );

        alert(
          `Status update failed: ${error.message}`
        );
      }
    };

  /* =====================================================
     LOGOUT
  ===================================================== */

  const handleLogout =
    () => {
      localStorage.removeItem(
        "adminToken"
      );

      localStorage.removeItem(
        "adminData"
      );

      window.location.href =
        "/adminlogin";
    };

  /* =====================================================
     DATE FORMAT
  ===================================================== */

  const formatDateTime =
    (date) => {
      if (!date) {
        return "No date";
      }

      const parsed =
        new Date(date);

      if (
        Number.isNaN(
          parsed.getTime()
        )
      ) {
        return "Invalid date";
      }

      return parsed.toLocaleString(
        "en-IN",
        {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }
      );
    };

  /* =====================================================
     WORKING TIME
  ===================================================== */

  const getWorkingMilliseconds =
    (user) => {
      if (!user) return 0;

      const savedMinutes =
        Number(
          user.totalWorkingMinutes
        ) || 0;

      if (
        user.isOnline === true &&
        user.loginTime
      ) {
        const login =
          new Date(
            user.loginTime
          );

        if (
          !Number.isNaN(
            login.getTime()
          )
        ) {
          const currentSession =
            Math.max(
              0,
              currentTime.getTime() -
                login.getTime()
            );

          return (
            savedMinutes *
              60 *
              1000 +
            currentSession
          );
        }
      }

      return (
        savedMinutes *
        60 *
        1000
      );
    };

  const formatWorkingTime =
    (user) => {
      const milliseconds =
        getWorkingMilliseconds(
          user
        );

      const totalSeconds =
        Math.floor(
          milliseconds / 1000
        );

      const hours =
        Math.floor(
          totalSeconds / 3600
        );

      const minutes =
        Math.floor(
          (totalSeconds % 3600) /
            60
        );

      const seconds =
        totalSeconds % 60;

      return `${String(
        hours
      ).padStart(
        2,
        "0"
      )}h ${String(
        minutes
      ).padStart(
        2,
        "0"
      )}m ${String(
        seconds
      ).padStart(
        2,
        "0"
      )}s`;
    };

  const getTotalWorkingHours =
    (user) =>
      getWorkingMilliseconds(
        user
      ) /
      (1000 * 60 * 60);

  /* =====================================================
     DEADLINE INFORMATION
  ===================================================== */

  const getDeadlineInfo =
    (task) => {
      const status =
        normalizeStatus(
          task?.status
        );

      if (
        status === "completed"
      ) {
        return {
          state:
            "completed",
          label:
            "Completed",
          ms: null,
          hours: null,
        };
      }

      if (!task?.dueDate) {
        return {
          state:
            "no-deadline",
          label:
            "No deadline",
          ms: null,
          hours: null,
        };
      }

      const due =
        new Date(
          task.dueDate
        );

      if (
        Number.isNaN(
          due.getTime()
        )
      ) {
        return {
          state:
            "invalid",
          label:
            "Invalid deadline",
          ms: null,
          hours: null,
        };
      }

      const ms =
        due.getTime() -
        currentTime.getTime();

      if (ms < 0) {
        const totalMinutes =
          Math.ceil(
            Math.abs(ms) /
              60000
          );

        const days =
          Math.floor(
            totalMinutes /
              1440
          );

        const hours =
          Math.floor(
            (totalMinutes %
              1440) /
              60
          );

        const minutes =
          totalMinutes %
          60;

        let label =
          "";

        if (days > 0) {
          label = `Overdue by ${days}d ${hours}h`;
        } else if (
          hours > 0
        ) {
          label = `Overdue by ${hours}h`;
        } else {
          label = `Overdue by ${Math.max(
            1,
            minutes
          )}m`;
        }

        return {
          state:
            "overdue",
          label,
          ms,
          hours:
            -Math.ceil(
              Math.abs(ms) /
                3600000
            ),
        };
      }

      if (
        ms <= DUE_SOON_MS
      ) {
        const totalMinutes =
          Math.max(
            1,
            Math.ceil(
              ms / 60000
            )
          );

        const days =
          Math.floor(
            totalMinutes /
              1440
          );

        const hours =
          Math.floor(
            (totalMinutes %
              1440) /
              60
          );

        const minutes =
          totalMinutes %
          60;

        let label =
          "";

        if (
          days > 0
        ) {
          label = `Due in ${days}d ${hours}h`;
        } else if (
          hours > 0
        ) {
          label = `Due in ${hours}h ${minutes}m`;
        } else {
          label = `Due in ${Math.max(
            1,
            minutes
          )}m`;
        }

        return {
          state:
            "due-soon",
          label,
          ms,
          hours:
            Math.ceil(
              ms / 3600000
            ),
        };
      }

      const days =
        Math.floor(
          ms / 86400000
        );

      const hours =
        Math.floor(
          (ms % 86400000) /
            3600000
        );

      return {
        state:
          "on-time",
        label:
          days > 0
            ? `Due in ${days}d ${hours}h`
            : `Due in ${Math.max(
                1,
                hours
              )}h`,
        ms,
        hours:
          Math.ceil(
            ms / 3600000
          ),
      };
    };

  /* =====================================================
     DEADLINE SUMMARY
  ===================================================== */

  const deadlineSummary =
    useMemo(() => {
      const summary = {
        overdue: [],
        dueSoon: [],
        onTime: [],
        noDeadline: [],
        completed: [],
      };

      taskList.forEach(
        (task) => {
          const info =
            getDeadlineInfo(
              task
            );

          if (
            info.state ===
            "overdue"
          ) {
            summary.overdue.push(
              task
            );
          } else if (
            info.state ===
            "due-soon"
          ) {
            summary.dueSoon.push(
              task
            );
          } else if (
            info.state ===
            "on-time"
          ) {
            summary.onTime.push(
              task
            );
          } else if (
            info.state ===
            "completed"
          ) {
            summary.completed.push(
              task
            );
          } else {
            summary.noDeadline.push(
              task
            );
          }
        }
      );

      return summary;
    }, [
      taskList,
      currentTime,
    ]);

  /* =====================================================
     TASK COUNTS
  ===================================================== */

  const taskCounts =
    useMemo(() => {
      const pending =
        taskList.filter(
          (task) => {
            const info =
              getDeadlineInfo(
                task
              );

            return (
              info.state !==
                "overdue" &&
              normalizeStatus(
                task.status
              ) ===
                "pending"
            );
          }
        ).length;

      const progress =
        taskList.filter(
          (task) => {
            const info =
              getDeadlineInfo(
                task
              );

            return (
              info.state !==
                "overdue" &&
              normalizeStatus(
                task.status
              ) ===
                "in progress"
            );
          }
        ).length;

      const completed =
        taskList.filter(
          (task) =>
            normalizeStatus(
              task.status
            ) ===
            "completed"
        ).length;

      return {
        total:
          taskList.length,

        pending,

        progress,

        completed,

        overdue:
          deadlineSummary
            .overdue.length,

        dueSoon:
          deadlineSummary
            .dueSoon.length,
      };
    }, [
      taskList,
      deadlineSummary,
      currentTime,
    ]);

  /* =====================================================
     ACTIVE USERS
  ===================================================== */

  const activeUsers =
    useMemo(
      () =>
        userList.filter(
          (user) =>
            user.isOnline ===
            true
        ).length,
      [userList]
    );

  const inactiveUsers =
    userList.length -
    activeUsers;

  const totalWorkingHours =
    useMemo(
      () =>
        userList.reduce(
          (
            total,
            user
          ) =>
            total +
            getTotalWorkingHours(
              user
            ),
          0
        ),
      [
        userList,
        currentTime,
      ]
    );

  /* =====================================================
     EMPLOYEE TASK MATCH
  ===================================================== */

  const taskBelongsToUser =
    (
      task,
      user
    ) => {
      if (
        !task ||
        !user
      ) {
        return false;
      }

      const assignee =
        task.assignedTo;

      const assigneeName =
        task.assignedToName;

      if (
        assignee &&
        typeof assignee ===
          "object"
      ) {
        if (
          String(
            assignee._id || ""
          ) ===
          String(
            user._id || ""
          )
        ) {
          return true;
        }

        if (
          getSafeName(
            assignee
          ).toLowerCase() ===
          getSafeName(
            user
          ).toLowerCase()
        ) {
          return true;
        }
      }

      if (
        String(
          assignee || ""
        ) ===
        String(
          user._id || ""
        )
      ) {
        return true;
      }

      if (
        String(
          assignee || ""
        ).toLowerCase() ===
        String(
          user.name || ""
        ).toLowerCase()
      ) {
        return true;
      }

      if (
        String(
          assigneeName || ""
        ).toLowerCase() ===
        String(
          user.name || ""
        ).toLowerCase()
      ) {
        return true;
      }

      if (
        typeof assigneeName ===
          "object" &&
        assigneeName
      ) {
        return (
          String(
            assigneeName._id ||
              ""
          ) ===
            String(
              user._id || ""
            ) ||
          getSafeName(
            assigneeName
          ).toLowerCase() ===
            getSafeName(
              user
            ).toLowerCase()
        );
      }

      return false;
    };

  /* =====================================================
     EMPLOYEE STATUS DATA
  ===================================================== */

  const employeeStatusData =
    useMemo(() => {
      return userList.map(
        (user) => {
          const tasks =
            taskList.filter(
              (task) =>
                taskBelongsToUser(
                  task,
                  user
                )
            );

          let pending = 0;
          let progress = 0;
          let completed = 0;
          let overdue = 0;
          let dueSoon = 0;

          tasks.forEach(
            (task) => {
              const deadline =
                getDeadlineInfo(
                  task
                );

              if (
                deadline.state ===
                "overdue"
              ) {
                overdue++;
              } else if (
                deadline.state ===
                "due-soon"
              ) {
                dueSoon++;
              }

              const status =
                normalizeStatus(
                  task.status
                );

              if (
                status ===
                "completed"
              ) {
                completed++;
              } else if (
                status ===
                "in progress"
              ) {
                progress++;
              } else {
                pending++;
              }
            }
          );

          const total =
            tasks.length;

          const percentage =
            total > 0
              ? Math.round(
                  (completed /
                    total) *
                    100
                )
              : 0;

          return {
            user,
            name:
              getSafeName(
                user.name
              ),
            mobile:
              getSafeMobile(
                user
              ),
            total,
            pending,
            progress,
            completed,
            overdue,
            dueSoon,
            percentage,
          };
        }
      );
    }, [
      userList,
      taskList,
      currentTime,
    ]);

  /* =====================================================
     FILTERS
  ===================================================== */

  const filteredUsers =
    useMemo(() => {
      const search =
        userSearch
          .trim()
          .toLowerCase();

      return userList.filter(
        (user) => {
          if (!search) {
            return true;
          }

          return (
            getSafeName(
              user.name
            )
              .toLowerCase()
              .includes(search) ||
            getSafeMobile(
              user
            )
              .toLowerCase()
              .includes(search) ||
            String(
              user._id || ""
            )
              .toLowerCase()
              .includes(search)
          );
        }
      );
    }, [
      userList,
      userSearch,
    ]);

  const filteredTasks =
    useMemo(() => {
      const search =
        taskSearch
          .trim()
          .toLowerCase();

      return taskList.filter(
        (task) => {
          if (!search) {
            return true;
          }

          const title =
            String(
              task.title || ""
            ).toLowerCase();

          const description =
            String(
              task.description ||
                ""
            ).toLowerCase();

          const assignee =
            getSafeName(
              task.assignedToName ||
                task.assignedTo
            ).toLowerCase();

          return (
            title.includes(
              search
            ) ||
            description.includes(
              search
            ) ||
            assignee.includes(
              search
            )
          );
        }
      );
    }, [
      taskList,
      taskSearch,
    ]);

  const filteredSubmissions =
    useMemo(() => {
      const search =
        submissionSearch
          .trim()
          .toLowerCase();

      return submissionList.filter(
        (submission) => {
          if (!search) {
            return true;
          }

          const employee =
            getSafeName(
              submission.userName ||
                submission.assignedToName ||
                submission.assignedTo
            ).toLowerCase();

          const task =
            String(
              submission.taskTitle ||
                submission.title ||
                ""
            ).toLowerCase();

          const content =
            getSubmissionContent(
              submission
            ).toLowerCase();

          const command =
            getSubmissionCommand(
              submission
            ).toLowerCase();

          const link =
            getSubmissionDriveLink(
              submission
            ).toLowerCase();

          return (
            employee.includes(
              search
            ) ||
            task.includes(
              search
            ) ||
            content.includes(
              search
            ) ||
            command.includes(
              search
            ) ||
            link.includes(
              search
            )
          );
        }
      );
    }, [
      submissionList,
      submissionSearch,
    ]);

  /* =====================================================
     NOTIFICATION OBJECTS
  ===================================================== */

  const deadlineNotifications =
    useMemo(() => {
      const items = [];

      deadlineSummary.overdue.forEach(
        (task) => {
          const deadline =
            getDeadlineInfo(
              task
            );

          items.push({
            id: `overdue-${task._id}-${task.dueDate}`,
            type: "overdue",
            task,
            title:
              "Task Overdue",
            message: `${getSafeName(
              task.assignedToName ||
                task.assignedTo
            )} has not completed "${task.title || "Untitled Task"}".`,
            label:
              deadline.label,
          });
        }
      );

      deadlineSummary.dueSoon.forEach(
        (task) => {
          const deadline =
            getDeadlineInfo(
              task
            );

          items.push({
            id: `due-soon-${task._id}-${task.dueDate}`,
            type: "due-soon",
            task,
            title:
              "Task Due Soon",
            message: `${getSafeName(
              task.assignedToName ||
                task.assignedTo
            )} — "${task.title || "Untitled Task"}".`,
            label:
              deadline.label,
          });
        }
      );

      return items.filter(
        (item) =>
          !dismissedNotificationIds.includes(
            item.id
          )
      );
    }, [
      deadlineSummary,
      dismissedNotificationIds,
      currentTime,
    ]);

  const visibleSubmissionNotifications =
    useMemo(
      () =>
        submissionNotifications.filter(
          (item) =>
            !dismissedSubmissionNotificationIds.includes(
              item.id
            )
        ),
      [
        submissionNotifications,
        dismissedSubmissionNotificationIds,
      ]
    );

  const allNotifications =
    useMemo(
      () => [
        ...visibleSubmissionNotifications,
        ...deadlineNotifications,
      ],
      [
        visibleSubmissionNotifications,
        deadlineNotifications,
      ]
    );

  /* =====================================================
     ADD NOTIFICATION
  ===================================================== */

  const addNotification =
    ({
      type,
      task,
    }) => {
      if (!task?._id) {
        return;
      }

      const key = `${type}-${task._id}-${task.dueDate}`;

      if (
        notificationKeysRef.current.has(
          key
        )
      ) {
        return;
      }

      notificationKeysRef.current.add(
        key
      );

      saveNotificationKeys();

      setUnreadCount(
        (count) =>
          count + 1
      );
    };

  /* =====================================================
     DESKTOP NOTIFICATION
  ===================================================== */

  const sendDesktopNotification =
    (
      title,
      body
    ) => {
      try {
        if (
          typeof Notification ===
            "undefined" ||
          Notification.permission !==
            "granted"
        ) {
          return;
        }

        new Notification(
          title,
          {
            body,
            icon: "/favicon.ico",
          }
        );
      } catch (error) {
        console.warn(
          "DESKTOP NOTIFICATION ERROR:",
          error
        );
      }
    };

  /* =====================================================
     SAFE ALARM
  ===================================================== */

  const playAlarm =
    async () => {
      try {
        const AudioContext =
          window.AudioContext ||
          window.webkitAudioContext;

        if (!AudioContext) {
          return;
        }

        let ctx =
          audioContextRef.current;

        if (!ctx) {
          ctx =
            new AudioContext();

          audioContextRef.current =
            ctx;
        }

        if (
          ctx.state ===
          "suspended"
        ) {
          await ctx.resume();
        }

        const now =
          ctx.currentTime;

        const frequencies =
          [
            880,
            660,
            880,
          ];

        frequencies.forEach(
          (
            frequency,
            index
          ) => {
            const oscillator =
              ctx.createOscillator();

            const gain =
              ctx.createGain();

            const start =
              now +
              index * 0.22;

            oscillator.type =
              "sine";

            oscillator.frequency.setValueAtTime(
              frequency,
              start
            );

            gain.gain.setValueAtTime(
              0.0001,
              start
            );

            gain.gain.exponentialRampToValueAtTime(
              0.18,
              start + 0.02
            );

            gain.gain.exponentialRampToValueAtTime(
              0.0001,
              start + 0.16
            );

            oscillator.connect(
              gain
            );

            gain.connect(
              ctx.destination
            );

            oscillator.start(
              start
            );

            oscillator.stop(
              start + 0.18
            );
          }
        );
      } catch (error) {
        console.warn(
          "ALARM SOUND ERROR:",
          error
        );
      }
    };

  /* =====================================================
     ENABLE ALERTS
  ===================================================== */

  const enableAlerts =
    async () => {
      try {
        const AudioContext =
          window.AudioContext ||
          window.webkitAudioContext;

        if (
          AudioContext
        ) {
          if (
            !audioContextRef.current
          ) {
            audioContextRef.current =
              new AudioContext();
          }

          if (
            audioContextRef.current
              .state ===
            "suspended"
          ) {
            await audioContextRef.current.resume();
          }

          await playAlarm();
        }

        setAlertsEnabled(
          true
        );

        if (
          typeof Notification !==
            "undefined"
        ) {
          if (
            Notification.permission ===
            "default"
          ) {
            const permission =
              await Notification.requestPermission();

            setDesktopNotificationsEnabled(
              permission ===
                "granted"
            );
          } else {
            setDesktopNotificationsEnabled(
              Notification.permission ===
                "granted"
            );
          }
        }
      } catch (error) {
        console.warn(
          "ENABLE ALERT ERROR:",
          error
        );

        setAlertsEnabled(
          true
        );
      }
    };

  const disableAlerts =
    () => {
      setAlertsEnabled(
        false
      );
    };

  /* =====================================================
     MONITOR DEADLINES
  ===================================================== */

  useEffect(() => {
    if (
      taskList.length ===
      0
    ) {
      return;
    }

    let newlyOverdue =
      false;

    deadlineSummary.overdue.forEach(
      (task) => {
        const key = `overdue-${task._id}-${task.dueDate}`;

        if (
          !notificationKeysRef.current.has(
            key
          )
        ) {
          addNotification({
            type: "overdue",
            task,
          });

          newlyOverdue =
            true;

          if (
            desktopNotificationsEnabled
          ) {
            sendDesktopNotification(
              "🚨 Task Overdue",
              `${getSafeName(
                task.assignedToName ||
                  task.assignedTo
              )} — ${
                task.title ||
                "Untitled Task"
              }`
            );
          }
        }
      }
    );

    deadlineSummary.dueSoon.forEach(
      (task) => {
        const key = `due-soon-${task._id}-${task.dueDate}`;

        if (
          !notificationKeysRef.current.has(
            key
          )
        ) {
          addNotification({
            type: "due-soon",
            task,
          });

          if (
            desktopNotificationsEnabled
          ) {
            sendDesktopNotification(
              "⚠️ Task Due Soon",
              `${getSafeName(
                task.assignedToName ||
                  task.assignedTo
              )} — ${
                task.title ||
                "Untitled Task"
              }`
            );
          }
        }
      }
    );

    if (
      newlyOverdue &&
      alertsEnabled
    ) {
      const now =
        Date.now();

      if (
        now -
          lastAlarmRef.current >
        30000
      ) {
        playAlarm();

        lastAlarmRef.current =
          now;
      }
    }

    if (
      !monitorInitialized
    ) {
      setMonitorInitialized(
        true
      );
    }
  }, [
    taskList,
    currentTime,
    alertsEnabled,
    desktopNotificationsEnabled,
    deadlineSummary,
    monitorInitialized,
  ]);

  /* =====================================================
     MARK NOTIFICATIONS READ
  ===================================================== */

  const markNotificationsRead =
    () => {
      setUnreadCount(0);
      setUnreadSubmissionCount(0);
    };

  const dismissNotification =
    (id) => {
      setDismissedNotificationIds(
        (current) => [
          ...current,
          id,
        ]
      );
    };

  const dismissSubmissionNotification =
    (id) => {
      setDismissedSubmissionNotificationIds(
        (current) => [
          ...current,
          id,
        ]
      );
    };

  const clearAllNotifications =
    () => {
      setDismissedNotificationIds(
        deadlineNotifications.map(
          (item) =>
            item.id
        )
      );

      setDismissedSubmissionNotificationIds(
        visibleSubmissionNotifications.map(
          (item) =>
            item.id
        )
      );

      setUnreadCount(0);
      setUnreadSubmissionCount(0);
    };

  /* =====================================================
     ANALYTICS
  ===================================================== */

  const analyticsBars =
    [
      {
        label:
          "Pending",
        value:
          taskCounts.pending,
        className:
          "bg-slate-600",
        hex: "#475569",
      },
      {
        label:
          "In Progress",
        value:
          taskCounts.progress,
        className:
          "bg-amber-500",
        hex: "#f59e0b",
      },
      {
        label:
          "Completed",
        value:
          taskCounts.completed,
        className:
          "bg-emerald-500",
        hex: "#10b981",
      },
      {
        label:
          "Due Soon",
        value:
          taskCounts.dueSoon,
        className:
          "bg-sky-500",
        hex: "#0ea5e9",
      },
      {
        label:
          "Overdue",
        value:
          taskCounts.overdue,
        className:
          "bg-blue-800",
        hex: "#1e40af",
      },
    ];

  const analyticsMax =
    Math.max(
      ...analyticsBars.map(
        (item) =>
          item.value
      ),
      1
    );

  /* Data shaped for the recharts bar chart on the Analytics tab */

  const taskStatusChartData =
    useMemo(
      () =>
        analyticsBars.map(
          (bar) => ({
            name: bar.label,
            tasks: bar.value,
            fill: bar.hex,
          })
        ),
      [
        taskCounts,
      ]
    );

  const employeeChartData =
    useMemo(
      () =>
        employeeStatusData.map(
          (employee) => ({
            name: employee.name,
            Completed:
              employee.completed,
            "In Progress":
              employee.progress,
            Pending:
              employee.pending,
            Overdue:
              employee.overdue,
          })
        ),
      [employeeStatusData]
    );

  /* =====================================================
     COMPLETION PERCENTAGE
  ===================================================== */

  const completionPercentage =
    taskCounts.total >
    0
      ? Math.round(
          (taskCounts.completed /
            taskCounts.total) *
            100
        )
      : 0;

  /* =====================================================
     RENDER
  ===================================================== */

  return (
    <div className="flex min-h-screen bg-sky-50/40 text-slate-900">

      {/* =================================================
          SIDEBAR
      ================================================= */}

      {/* Dims the page behind the menu on small screens */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        id="admin-sidebar"
        onClick={(event) => {
          // choosing anything in the menu closes it on a small screen
          if (mobileMenuOpen && event.target.closest("button")) {
            setMobileMenuOpen(false);
          }
        }}
        className={`${
          mobileMenuOpen
            ? "flex fixed inset-y-0 left-0 z-50 h-[100dvh] overflow-hidden shadow-2xl"
            : "hidden"
        } lg:flex lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:min-h-screen lg:overflow-hidden lg:shadow-none w-[260px] bg-white border-r border-blue-100 flex-col justify-between`}
      >

  <button
    type="button"
    onClick={() => setMobileMenuOpen(false)}
    className="lg:hidden absolute top-4 right-4 p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition"
    aria-label="Close menu"
  >
    <X size={18} />
  </button>

  <div className="flex min-h-0 flex-1 flex-col">

    {/* Company Logo */}
    <div className="shrink-0 px-6 pt-7 pb-5">

      <div className="flex items-center gap-3">

        <div className="w-11 h-11 rounded-2xl bg-white border border-blue-100 flex items-center justify-center shadow-md overflow-hidden">

          <img
            src="https://www.profenaatechrmpcbe.com/images/profenaa.webp"
            alt="Profenaa Infotech Logo"
            className="w-full h-full object-contain p-1"
          />

        </div>

        <div>

          <h1 className="font-black text-base text-slate-900">
            PROFENAA
          </h1>

          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-semibold">
            Infotech CRM
          </p>

        </div>

      </div>

    </div>

    <SidebarScroll theme="light">
    {/* Workspace */}
    <div className="px-6 mb-3">

      <p className="text-[9px] uppercase tracking-[0.18em] font-bold text-slate-400">
        Workspace
      </p>

    </div>

    <nav className="px-3 pb-3 space-y-1">

      <NavItem
        icon={<LayoutDashboard size={18} />}
        label="Dashboard"
        active={activeTab === "Dashboard"}
        onClick={() => setActiveTab("Dashboard")}
      />

      <NavItem
        icon={<BarChart3 size={18} />}
        label="Analytics"
        active={activeTab === "Analytics"}
        onClick={() => setActiveTab("Analytics")}
      />

<NavItem
  icon={<FolderKanban size={18} />}
  label="Projects"
  active={activeTab === "Projects"}
  onClick={() => setActiveTab("Projects")}
/>

      <NavItem
        icon={<CheckSquare size={18} />}
        label="Tasks"
        active={activeTab === "Tasks"}
        onClick={() => setActiveTab("Tasks")}
      />

      {/* <NavItem
        icon={<ClipboardCheck size={18} />}
        label="Work Submissions"
        active={activeTab === "Work Submissions"}
        onClick={() => setActiveTab("Work Submissions")}
      /> */}
     <div className="relative">
  <NavItem
    icon={<ClipboardCheck size={18} />}
    label="Work Submissions"
    active={activeTab === "Work Submissions"}
    onClick={() => setActiveTab("Work Submissions")}
  />

  {unreadSubmissionCount > 0 && (
    <span
      className="
        absolute
        right-3
        top-1/2
        -translate-y-1/2
        min-w-[22px]
        h-[22px]
        px-1.5
        rounded-full
        bg-red-600
        text-white
        text-[10px]
        font-extrabold
        flex
        items-center
        justify-center
        shadow-sm
        animate-pulse
      "
    >
      {unreadSubmissionCount > 99
        ? "99+"
        : unreadSubmissionCount}
    </span>
  )}
</div>

<NavItem
  icon={<StaffNavIcon size={18} />}
  label="Staff Directory"
  active={activeTab === "Staff Directory"}
  onClick={() => setActiveTab("Staff Directory")}
/>

      <NavItem
        icon={<Users size={18} />}
        label="Users & Team"
        active={activeTab === "Users & Team"}
        onClick={() => setActiveTab("Users & Team")}
      />

     



      

<NavItem
  icon={<CalendarDays size={18} />}
  label="Attendance"
  active={activeTab === "AdminAttendance"}
  onClick={() => setActiveTab("AdminAttendance")}
/>

<NavItem
  icon={<WifiNavIcon size={18} />}
  label="Wi-Fi Setup"
  active={activeTab === "Wi-Fi Setup"}
  onClick={() => setActiveTab("Wi-Fi Setup")}
/>

<NavItem
  icon={<LeavesNavIcon size={18} />}
  label="Leaves"
  active={activeTab === "Leaves"}
  onClick={() => setActiveTab("Leaves")}
/>

<NavItem
  icon={<ReportsNavIcon size={18} />}
  label="Daily Reports"
  active={activeTab === "Daily Reports"}
  onClick={() => setActiveTab("Daily Reports")}
/>

      <NavItem
        icon={<Activity size={18} />}
        label="Performance"
        active={activeTab === "Monitor"}
        onClick={() => setActiveTab("Monitor")}
      />

      <NavItem
        icon={<Bell size={18} />}
        label="Notifications"
        active={activeTab === "Notifications"}
        onClick={() => {
          setActiveTab("Notifications");
          markNotificationsRead();
        }}
      />

      
      <div className="my-4 border-t border-blue-50" />


   


      <NavItem
        icon={<Settings size={18} />}
        label="Settings"
        active={activeTab === "Settings"}
        onClick={() => setActiveTab("Settings")}
      />

     

    </nav>
    </SidebarScroll>

  </div>

  {/* Bottom Section: always visible */}
  <div className="shrink-0 p-3">

    <div className="border-t border-blue-50 pt-3">

      <NavItem
        icon={<HelpCircle size={18} />}
        label="Help & Support"
        onClick={() => {}}
      />

      <button
        onClick={handleLogout}
        className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm text-blue-700 hover:bg-blue-50 transition"
      >

        <LogOut size={18} />

        <span>
          Log Out
        </span>

      </button>

    </div>

  </div>

</aside>
      {/* =================================================
          MAIN
      ================================================= */}

      <main className="flex-1 min-w-0">

        {/* HEADER */}

        <header className="bg-white border-b border-blue-100 sticky top-0 z-30">

          <div className="px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-4">

            <div className="flex items-center gap-3 min-w-0">

              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden shrink-0 p-2.5 rounded-xl border border-blue-100 bg-white text-blue-900 hover:bg-blue-50 transition"
                aria-label="Open menu"
                aria-expanded={mobileMenuOpen}
                aria-controls="admin-sidebar"
              >
                <Menu size={20} />
              </button>

              <div className="min-w-0">

              <p className="text-[10px] uppercase tracking-[0.18em] text-blue-600 font-bold">
                Admin Workspace
              </p>

              <h2 className="text-xl sm:text-2xl font-black mt-1">
                {activeTab}
              </h2>

              <p className="text-[10px] text-slate-400 mt-1 hidden sm:block">
                {currentTime.toLocaleString(
                  "en-IN",
                  {
                    dateStyle:
                      "medium",
                    timeStyle:
                      "medium",
                  }
                )}
              </p>

              </div>

            </div>

            <div className="flex items-center gap-2">

              {/* REFRESH */}

              <button
                onClick={
                  refreshAll
                }
                className="hidden sm:flex items-center gap-2 px-3 py-2.5 bg-white border border-blue-100 rounded-xl text-xs font-semibold hover:bg-sky-50 transition"
              >

                <RefreshCw
                  size={15}
                  className={
                    loading ||
                    taskLoading ||
                    submissionLoading
                      ? "animate-spin"
                      : ""
                  }
                />

                Refresh

              </button>

              {/* ALARM */}

              <button
                onClick={
                  alertsEnabled
                    ? disableAlerts
                    : enableAlerts
                }
                className={`hidden md:flex items-center gap-2 px-3 py-2.5 border rounded-xl text-xs font-bold transition ${
                  alertsEnabled
                    ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                    : "bg-white border-blue-100 text-slate-600 hover:bg-sky-50"
                }`}
                title="Enable or disable overdue alarm"
              >

                {alertsEnabled ? (
                  <Volume2
                    size={15}
                  />
                ) : (
                  <VolumeX
                    size={15}
                  />
                )}

                {alertsEnabled
                  ? "Alerts On"
                  : "Enable Alerts"}

              </button>

              {/* ACTIVITY (attendance, devices, leave, announcements) */}

              <NotificationCenter
                role="admin"
                onNavigate={setActiveTab}
              />

              {/* NOTIFICATION BELL */}

              <div className="relative">

                <button
                  onClick={() => {
                    setShowNotifications(
                      (value) =>
                        !value
                    );
                    markNotificationsRead();
                  }}
                  className={`relative w-10 h-10 rounded-xl border bg-white hover:bg-sky-50 flex items-center justify-center transition ${
                    deadlineSummary.overdue.length >
                      0 ||
                    visibleSubmissionNotifications.length >
                      0
                      ? "border-blue-300 text-blue-700"
                      : "border-blue-100 text-slate-700"
                  }`}
                  title="Notifications"
                >

                  {deadlineSummary.overdue.length >
                    0 ||
                  visibleSubmissionNotifications.length >
                    0 ? (
                    <BellRing
                      size={17}
                    />
                  ) : (
                    <Bell
                      size={17}
                    />
                  )}

                  {allNotifications.length >
                    0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-blue-700 text-white text-[9px] font-black flex items-center justify-center">
                      {allNotifications.length >
                      99
                        ? "99+"
                        : allNotifications.length}
                    </span>
                  )}

                </button>

                {showNotifications && (
                  <div className="absolute right-0 top-12 w-[340px] sm:w-[420px] max-h-[520px] overflow-y-auto bg-white border border-blue-100 rounded-2xl shadow-2xl z-50">

                    <div className="sticky top-0 bg-white border-b border-blue-50 p-4 flex items-center justify-between gap-3">

                      <div>

                        <p className="text-sm font-black">
                          Notifications
                        </p>

                        <p className="text-[10px] text-slate-400">
                          Deadline alerts and new work submissions
                        </p>

                      </div>

                      <div className="flex items-center gap-2">

                        {allNotifications.length >
                          0 && (
                          <button
                            onClick={
                              clearAllNotifications
                            }
                            className="text-[9px] font-bold text-blue-700 hover:underline"
                          >
                            Clear all
                          </button>
                        )}

                        <button
                          onClick={() =>
                            setShowNotifications(
                              false
                            )
                          }
                          className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center"
                        >
                          <X
                            size={13}
                          />
                        </button>

                      </div>

                    </div>

                    {allNotifications.length ===
                    0 ? (
                      <div className="p-10 text-center">

                        <CheckCircle2
                          size={32}
                          className="mx-auto text-emerald-500"
                        />

                        <p className="text-xs font-bold mt-3">
                          You're all caught up
                        </p>

                        <p className="text-[10px] text-slate-400 mt-1">
                          No active alerts or new work submissions.
                        </p>

                      </div>
                    ) : (
                      <div className="divide-y divide-blue-50">

                        {allNotifications.map(
                          (
                            notice
                          ) =>
                            notice.type ===
                            "submission" ? (
                              <div
                                key={
                                  notice.id
                                }
                                className="p-4 bg-emerald-50/70"
                              >

                                <div className="flex gap-3">

                                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-emerald-100 text-emerald-700">
                                    <ClipboardCheck
                                      size={16}
                                    />
                                  </div>

                                  <div className="min-w-0 flex-1">

                                    <div className="flex items-start justify-between gap-2">

                                      <p className="text-xs font-black">
                                        {
                                          notice.title
                                        }
                                      </p>

                                      <button
                                        onClick={() =>
                                          dismissSubmissionNotification(
                                            notice.id
                                          )
                                        }
                                        className="text-slate-400 hover:text-slate-700"
                                      >
                                        <X
                                          size={13}
                                        />
                                      </button>

                                    </div>

                                    <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                                      {
                                        notice.message
                                      }
                                    </p>

                                    <div className="flex items-center justify-between gap-2 mt-2">

                                      <p className="text-[9px] text-slate-400">
                                        Submitted:{" "}
                                        {formatDateTime(
                                          getSubmissionDate(
                                            notice.submission
                                          )
                                        )}
                                      </p>

                                      <button
                                        onClick={() => {
                                          setSelectedSubmission(
                                            notice.submission
                                          );
                                          setShowSubmissionModal(
                                            true
                                          );
                                          setShowNotifications(
                                            false
                                          );
                                        }}
                                        className="text-[10px] font-black text-emerald-700 hover:underline"
                                      >
                                        View
                                      </button>

                                    </div>

                                  </div>

                                </div>

                              </div>
                            ) : (
                              <div
                                key={
                                  notice.id
                                }
                                className={`p-4 ${
                                  notice.type ===
                                  "overdue"
                                    ? "bg-blue-50/70"
                                    : "bg-sky-50/70"
                                }`}
                              >

                                <div className="flex gap-3">

                                  <div
                                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                                      notice.type ===
                                      "overdue"
                                        ? "bg-blue-100 text-blue-700"
                                        : "bg-sky-100 text-sky-700"
                                    }`}
                                  >
                                    {notice.type ===
                                    "overdue" ? (
                                      <AlertTriangle
                                        size={16}
                                      />
                                    ) : (
                                      <CalendarClock
                                        size={16}
                                      />
                                    )}
                                  </div>

                                  <div className="min-w-0 flex-1">

                                    <div className="flex items-start justify-between gap-2">

                                      <p className="text-xs font-black">
                                        {
                                          notice.title
                                        }
                                      </p>

                                      <button
                                        onClick={() =>
                                          dismissNotification(
                                            notice.id
                                          )
                                        }
                                        className="text-slate-400 hover:text-slate-700"
                                      >
                                        <X
                                          size={13}
                                        />
                                      </button>

                                    </div>

                                    <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                                      {
                                        notice.message
                                      }
                                    </p>

                                    <p
                                      className={`text-[10px] font-bold mt-2 ${
                                        notice.type ===
                                        "overdue"
                                          ? "text-blue-700"
                                          : "text-sky-700"
                                      }`}
                                    >
                                      {
                                        notice.label
                                      }
                                    </p>

                                    <p className="text-[9px] text-slate-400 mt-1">
                                      Due:{" "}
                                      {formatDateTime(
                                        notice.task
                                          .dueDate
                                      )}
                                    </p>

                                  </div>

                                </div>

                              </div>
                            )
                        )}

                      </div>
                    )}

                  </div>
                )}

              </div>

              {/* CREATE USER */}

              <button
                onClick={() => {
                  setActiveTab("Staff Directory");
                  setStaffAddSignal((n) => n + 1);
                }}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-900 text-white rounded-xl text-xs font-bold hover:bg-blue-800 transition"
              >

                <UserPlus
                  size={15}
                />

                <span className="hidden sm:inline">
                  Create Staff
                </span>

              </button>

              {/* ASSIGN */}

              <button
                onClick={() =>
                  openAssignTaskModal()
                }
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition"
              >

                <PlusCircle
                  size={15}
                />

                <span className="hidden sm:inline">
                  Assign Task
                </span>

              </button>

            </div>

          </div>

        </header>

        {/* =================================================
            PAGE
        ================================================= */}

{activeTab === "AdminAttendance" && (
  <AdminAttendanceHub ClassicView={AdminAttendance} />
)}

{activeTab === "Wi-Fi Setup" && <WifiSetup />}

{activeTab === "Staff Directory" && <StaffDirectory addSignal={staffAddSignal} />}

{activeTab === "Leaves" && <AdminLeaves />}

{activeTab === "Daily Reports" && <AdminDailyReports />}


{activeTab === "Projects" && (
  <ProjectManagement />
)}
        <div className="p-4 sm:p-6 lg:p-8">

          {/* =================================================
              DASHBOARD
          ================================================= */}

          {activeTab ===
            "Dashboard" && (
            <div className="space-y-6">

              {/* WELCOME */}

              <div className="relative overflow-hidden bg-gradient-to-br from-blue-400 to-blue-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl">

                <div className="relative z-10">

                  <p className="text-sky-300 text-xs font-bold uppercase tracking-widest">
                    Profenaa Infotech
                  </p>

                  <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black mt-2">
                    Welcome back, Admin 👋
                  </h1>

                  <p className="text-blue-100 text-sm mt-3 max-w-2xl">
                    Manage users, assign tasks, monitor employee activity, track deadlines, receive overdue alerts, and review employee work submissions.
                  </p>

                  <div className="flex flex-wrap gap-3 mt-6">

                    <button
                      onClick={() =>
                        openAssignTaskModal()
                      }
                      className="flex items-center gap-2 bg-sky-400 hover:bg-sky-300 text-blue-950 px-4 py-2.5 rounded-xl text-xs font-bold transition"
                    >
                      <PlusCircle
                        size={15}
                      />
                      Assign New Task
                    </button>

                    <button
                      onClick={() =>
                        setActiveTab(
                          "Tasks"
                        )
                      }
                      className="flex items-center gap-2 bg-white/10 hover:bg-white/20 px-4 py-2.5 rounded-xl text-xs font-bold transition"
                    >
                      <ListChecks
                        size={15}
                      />
                      View Tasks
                    </button>

                  </div>

                </div>

              </div>

              {/* STAT CARDS */}

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8 gap-4">

                <StatCard
                  title="Total Users"
                  value={
                    userList.length
                  }
                  description="Team members"
                  icon={
                    <Users
                      size={20}
                    />
                  }
                  iconBg="bg-blue-50"
                  iconColor="text-blue-700"
                />

                <StatCard
                  title="Active Now"
                  value={
                    activeUsers
                  }
                  description="Currently online"
                  icon={
                    <UserCheck
                      size={20}
                    />
                  }
                  iconBg="bg-emerald-50"
                  iconColor="text-emerald-600"
                />

                <StatCard
                  title="Inactive"
                  value={
                    inactiveUsers
                  }
                  description="Currently offline"
                  icon={
                    <UserX
                      size={20}
                    />
                  }
                  iconBg="bg-slate-100"
                  iconColor="text-slate-600"
                />

                <StatCard
                  title="Total Tasks"
                  value={
                    taskCounts.total
                  }
                  description="Assigned tasks"
                  icon={
                    <CheckSquare
                      size={20}
                    />
                  }
                  iconBg="bg-sky-50"
                  iconColor="text-sky-700"
                />

                <StatCard
                  title="Pending"
                  value={
                    taskCounts.pending
                  }
                  description="Waiting to start"
                  icon={
                    <Clock
                      size={20}
                    />
                  }
                  iconBg="bg-slate-100"
                  iconColor="text-slate-600"
                />

                <StatCard
                  title="In Progress"
                  value={
                    taskCounts.progress
                  }
                  description="Currently working"
                  icon={
                    <Activity
                      size={20}
                    />
                  }
                  iconBg="bg-amber-50"
                  iconColor="text-amber-600"
                />

                <StatCard
                  title="Due Soon"
                  value={
                    taskCounts.dueSoon
                  }
                  description="Next 24 hours"
                  icon={
                    <CalendarClock
                      size={20}
                    />
                  }
                  iconBg="bg-sky-50"
                  iconColor="text-sky-700"
                />

                <StatCard
                  title="Overdue"
                  value={
                    taskCounts.overdue
                  }
                  description="Needs attention"
                  icon={
                    <AlertTriangle
                      size={20}
                    />
                  }
                  iconBg="bg-blue-50"
                  iconColor="text-blue-800"
                />

              </div>

              {/* ALERT AREA */}

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

                {/* OVERDUE */}

                <div className="xl:col-span-2 bg-white border border-blue-200 rounded-3xl overflow-hidden shadow-sm">

                  <div className="p-5 bg-blue-50 border-b border-blue-100 flex items-center justify-between gap-4">

                    <div className="flex items-center gap-3">

                      <div className="w-10 h-10 rounded-xl bg-blue-800 text-white flex items-center justify-center">
                        <ShieldAlert
                          size={20}
                        />
                      </div>

                      <div>

                        <h3 className="font-black text-sm text-blue-900">
                          Overdue Task Monitor
                        </h3>

                        <p className="text-[10px] text-blue-700 mt-1">
                          {deadlineSummary.overdue.length} task
                          {deadlineSummary.overdue.length !==
                          1
                            ? "s"
                            : ""}{" "}
                          need immediate attention
                        </p>

                      </div>

                    </div>

                    <button
                      onClick={
                        alertsEnabled
                          ? playAlarm
                          : enableAlerts
                      }
                      className="px-3 py-2 bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-blue-800"
                    >
                      <Volume2
                        size={14}
                      />

                      {alertsEnabled
                        ? "Test Alarm"
                        : "Enable Alarm"}
                    </button>

                  </div>

                  {deadlineSummary.overdue.length ===
                  0 ? (
                    <div className="p-10 text-center">

                      <CheckCircle2
                        size={34}
                        className="mx-auto text-emerald-500"
                      />

                      <p className="text-xs font-bold mt-3">
                        No overdue tasks
                      </p>

                      <p className="text-[10px] text-slate-400 mt-1">
                        Your task deadlines are currently under control.
                      </p>

                    </div>
                  ) : (
                    <div className="divide-y divide-blue-50 max-h-[360px] overflow-y-auto">

                      {deadlineSummary.overdue.map(
                        (task) => (
                          <div
                            key={
                              task._id ||
                              `${task.title}-${task.dueDate}`
                            }
                            className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:bg-blue-50/40"
                          >

                            <div className="min-w-0">

                              <div className="flex items-center gap-2">

                                <AlertTriangle
                                  size={14}
                                  className="text-blue-700 shrink-0"
                                />

                                <p className="text-xs font-black truncate">
                                  {task.title ||
                                    "Untitled Task"}
                                </p>

                              </div>

                              <p className="text-[10px] text-slate-500 mt-1">
                                {getSafeName(
                                  task.assignedToName ||
                                    task.assignedTo
                                )}
                              </p>

                              <p className="text-[9px] text-slate-400 mt-1">
                                Due:{" "}
                                {formatDateTime(
                                  task.dueDate
                                )}
                              </p>

                            </div>

                            <div className="flex items-center gap-2 shrink-0">

                              <span className="px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 text-[10px] font-black">
                                {
                                  getDeadlineInfo(
                                    task
                                  ).label
                                }
                              </span>

                              <button
                                onClick={() =>
                                  openEditTaskModal(
                                    task
                                  )
                                }
                                className="px-3 py-1.5 rounded-xl bg-blue-900 text-white text-[10px] font-bold"
                              >
                                Update Date
                              </button>

                            </div>

                          </div>
                        )
                      )}

                    </div>
                  )}

                </div>

                {/* DUE SOON */}

                <div className="bg-white border border-sky-200 rounded-3xl p-5 shadow-sm">

                  <div className="flex items-center gap-3 mb-4">

                    <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center">
                      <CalendarClock
                        size={20}
                      />
                    </div>

                    <div>

                      <h3 className="font-black text-sm">
                        Due Soon
                      </h3>

                      <p className="text-[10px] text-slate-400">
                        Next 24 hours
                      </p>

                    </div>

                  </div>

                  {deadlineSummary.dueSoon.length ===
                  0 ? (
                    <div className="py-10 text-center">

                      <CheckCircle2
                        size={28}
                        className="mx-auto text-emerald-500"
                      />

                      <p className="text-xs font-bold mt-3">
                        No upcoming deadline
                      </p>

                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[340px] overflow-y-auto">

                      {deadlineSummary.dueSoon.map(
                        (task) => (
                          <div
                            key={
                              task._id ||
                              `${task.title}-${task.dueDate}`
                            }
                            className="bg-sky-50/70 border border-sky-100 rounded-2xl p-3"
                          >

                            <div className="flex items-start justify-between gap-2">

                              <p className="text-xs font-black truncate">
                                {task.title ||
                                  "Untitled Task"}
                              </p>

                              <Timer
                                size={14}
                                className="text-sky-600 shrink-0"
                              />

                            </div>

                            <p className="text-[10px] text-slate-500 mt-2">
                              {getSafeName(
                                task.assignedToName ||
                                  task.assignedTo
                              )}
                            </p>

                            <div className="flex items-center justify-between gap-2 mt-2">

                              <span className="text-[9px] text-slate-400">
                                {formatDateTime(
                                  task.dueDate
                                )}
                              </span>

                              <button
                                onClick={() =>
                                  openEditTaskModal(
                                    task
                                  )
                                }
                                className="text-[10px] text-sky-700 font-black hover:underline"
                              >
                                {
                                  getDeadlineInfo(
                                    task
                                  ).label
                                }
                              </button>

                            </div>

                          </div>
                        )
                      )}

                    </div>
                  )}

                </div>

              </div>

              {/* DEADLINE HEALTH */}

              <div className="bg-white border border-blue-100 rounded-3xl p-6 shadow-sm">

                <div className="flex items-center gap-3 mb-6">

                  <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center">
                    <CalendarClock
                      size={20}
                    />
                  </div>

                  <div>

                    <h3 className="font-black text-base">
                      Task Deadline Health
                    </h3>

                    <p className="text-xs text-slate-400">
                      Live deadline distribution
                    </p>

                  </div>

                </div>

                <div className="grid grid-cols-1 md:grid-cols-5 gap-3">

                  {[
                    [
                      "Overdue",
                      deadlineSummary
                        .overdue
                        .length,
                      "bg-blue-800",
                    ],
                    [
                      "Due Soon",
                      deadlineSummary
                        .dueSoon
                        .length,
                      "bg-sky-500",
                    ],
                    [
                      "On Time",
                      deadlineSummary
                        .onTime
                        .length,
                      "bg-blue-500",
                    ],
                    [
                      "Completed",
                      deadlineSummary
                        .completed
                        .length,
                      "bg-emerald-500",
                    ],
                    [
                      "No Deadline",
                      deadlineSummary
                        .noDeadline
                        .length,
                      "bg-slate-400",
                    ],
                  ].map(
                    ([
                      label,
                      value,
                      bg,
                    ]) => {
                      const percentage =
                        taskList.length >
                        0
                          ? Math.round(
                              (value /
                                taskList.length) *
                                100
                            )
                          : 0;

                      return (
                        <div
                          key={
                            label
                          }
                          className="border border-blue-50 bg-sky-50/50 rounded-2xl p-4"
                        >

                          <div className="flex items-center justify-between">

                            <span className="text-[11px] font-bold text-slate-600">
                              {
                                label
                              }
                            </span>

                            <span className="text-xs font-black">
                              {
                                value
                              }
                            </span>

                          </div>

                          <div className="w-full h-2 bg-blue-100 rounded-full overflow-hidden mt-3">

                            <div
                              className={`${bg} h-full rounded-full transition-all duration-500`}
                              style={{
                                width: `${percentage}%`,
                              }}
                            />

                          </div>

                          <p className="text-[10px] text-slate-400 mt-2">
                            {
                              percentage
                            }
                            % of tasks
                          </p>

                        </div>
                      );
                    }
                  )}

                </div>

              </div>

              {/* EMPLOYEE MONITORING */}

              <div className="bg-white border border-blue-100 rounded-3xl p-6 shadow-sm">

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">

                  <div className="flex items-center gap-3">

                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
                      <Users
                        size={20}
                      />
                    </div>

                    <div>

                      <h3 className="font-black text-base">
                        Employee Task Monitoring
                      </h3>

                      <p className="text-xs text-slate-400">
                        Individual task performance
                      </p>

                    </div>

                  </div>

                  <button
                    onClick={() =>
                      setActiveTab(
                        "Monitor"
                      )
                    }
                    className="text-xs font-bold text-blue-700 hover:underline"
                  >
                    Full Monitor →
                  </button>

                </div>

                {employeeStatusData.length ===
                0 ? (
                  <EmptyState
                    icon={
                      <Users
                        size={20}
                      />
                    }
                    text="No employees available"
                  />
                ) : (
                  <div className="space-y-4">

                    {employeeStatusData.map(
                      (
                        employee
                      ) => (
                        <div
                          key={
                            employee
                              .user
                              ?._id ||
                            employee.name
                          }
                          className="border border-blue-50 rounded-2xl p-4 bg-sky-50/40"
                        >

                          <div className="flex flex-col sm:flex-row sm:items-center gap-4">

                            <div className="flex items-center gap-3 min-w-[190px]">

                              <Avatar
                                name={
                                  employee.name
                                }
                                size="sm"
                              />

                              <div>

                                <p className="text-xs font-black">
                                  {
                                    employee.name
                                  }
                                </p>

                                <p className="text-[9px] text-slate-400">
                                  {
                                    employee.total
                                  }{" "}
                                  total tasks
                                </p>

                              </div>

                            </div>

                            <div className="flex-1">

                              <div className="flex h-3 bg-blue-100 rounded-full overflow-hidden">

                                {employee.completed >
                                  0 && (
                                  <div
                                    className="bg-emerald-500"
                                    style={{
                                      width: `${(employee.completed /
                                        employee.total) *
                                        100}%`,
                                    }}
                                  />
                                )}

                                {employee.progress >
                                  0 && (
                                  <div
                                    className="bg-amber-500"
                                    style={{
                                      width: `${(employee.progress /
                                        employee.total) *
                                        100}%`,
                                    }}
                                  />
                                )}

                                {employee.pending >
                                  0 && (
                                  <div
                                    className="bg-slate-400"
                                    style={{
                                      width: `${(employee.pending /
                                        employee.total) *
                                        100}%`,
                                    }}
                                  />
                                )}

                              </div>

                            </div>

                            <div className="flex flex-wrap gap-1.5">

                              <span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-[9px] font-bold">
                                Done{" "}
                                {
                                  employee.completed
                                }
                              </span>

                              <span className="px-2 py-1 bg-amber-50 text-amber-700 rounded-lg text-[9px] font-bold">
                                Progress{" "}
                                {
                                  employee.progress
                                }
                              </span>

                              <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-lg text-[9px] font-bold">
                                Pending{" "}
                                {
                                  employee.pending
                                }
                              </span>

                              {employee.overdue >
                                0 && (
                                <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-lg text-[9px] font-black">
                                  Overdue{" "}
                                  {
                                    employee.overdue
                                  }
                                </span>
                              )}

                            </div>

                            <div className="px-3 py-1.5 bg-white rounded-xl border border-blue-100 text-xs font-black">
                              {
                                employee.percentage
                              }
                              %
                            </div>

                          </div>

                        </div>
                      )
                    )}

                  </div>
                )}

              </div>

              {/* RECENT SUBMISSIONS */}

              <div className="bg-white border border-blue-100 rounded-3xl p-5 shadow-sm">

                <div className="flex items-center justify-between mb-5">

                  <div className="flex items-center gap-2">

                    <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center">
                      <ClipboardCheck
                        size={18}
                      />
                    </div>

                    <div>

                      <h3 className="font-black text-sm">
                        Recent Work Submissions
                      </h3>

                      <p className="text-[11px] text-slate-400">
                        Employee submitted work and Drive links
                      </p>

                    </div>

                  </div>

                  {/* <button
                    onClick={() =>
                      setActiveTab(
                        "Work Submissions"
                      )
                    }
                    className="text-xs font-bold text-blue-700 hover:underline"
                  >
                    View all →
                  </button> */}
                  <button
  onClick={() =>
    setActiveTab("Work Submissions")
  }
  className="text-xs font-bold text-blue-700 hover:underline flex items-center gap-2"
>
  View all →

  {unreadSubmissionCount > 0 && (
    <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
      {unreadSubmissionCount > 99
        ? "99+"
        : unreadSubmissionCount}
    </span>
  )}
</button>

                </div>

                {submissionList.length ===
                0 ? (
                  <EmptyState
                    icon={
                      <ClipboardCheck
                        size={20}
                      />
                    }
                    text="No work submissions yet"
                  />
                ) : (
                  <div className="space-y-3">

                    {submissionList
                      .slice(
                        0,
                        5
                      )
                      .map(
                        (
                          submission
                        ) => (
                          <SubmissionRow
                            key={
                              submission._id
                            }
                            submission={
                              submission
                            }
                            // onView={() => {
                            //   setSelectedSubmission(
                            //     submission
                            //   );
                            //   setShowSubmissionModal(
                            //     true
                            //   );
                            // }}

                            onView={() => {
  setSelectedSubmission(submission);
  setShowSubmissionModal(true);

  setUnreadSubmissionCount((count) =>
    Math.max(0, count - 1)
  );
}}
                          />
                        )
                      )}

                  </div>
                )}

              </div>

            </div>
          )}






          {/* =================================================
              TASKS
          ================================================= */}

          {activeTab ===
            "Tasks" && (
            <div className="space-y-5">

              <div className="bg-white border border-blue-100 rounded-3xl p-5 shadow-sm">

                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">

                  <div>

                    <h3 className="font-black text-lg">
                      Task Management
                    </h3>

                    <p className="text-xs text-slate-400 mt-1">
                      Monitor task status, deadlines, overdue work and countdowns. Use "Edit" to update a task's due date after it has been assigned.
                    </p>

                  </div>

                  <div className="flex flex-wrap items-center gap-2">

                    <div className="relative">

                      <Search
                        size={15}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                      />

                      <input
                        value={
                          taskSearch
                        }
                        onChange={(
                          e
                        ) =>
                          setTaskSearch(
                            e.target
                              .value
                          )
                        }
                        placeholder="Search tasks..."
                        className="pl-9 pr-3 py-2.5 bg-sky-50/60 border border-blue-100 rounded-xl text-xs outline-none w-full sm:w-64"
                      />

                    </div>

                    <button
                      onClick={() =>
                        openAssignTaskModal()
                      }
                      className="px-4 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold flex items-center gap-2"
                    >
                      <PlusCircle
                        size={14}
                      />
                      Assign
                    </button>

                  </div>

                </div>

              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">

                <MiniMetric
                  label="Total"
                  value={
                    taskCounts.total
                  }
                  icon={
                    <ListChecks
                      size={16}
                    />
                  }
                />

                <MiniMetric
                  label="Pending"
                  value={
                    taskCounts.pending
                  }
                  icon={
                    <Clock
                      size={16}
                    />
                  }
                />

                <MiniMetric
                  label="Progress"
                  value={
                    taskCounts.progress
                  }
                  icon={
                    <Activity
                      size={16}
                    />
                  }
                />

                <MiniMetric
                  label="Due Soon"
                  value={
                    taskCounts.dueSoon
                  }
                  icon={
                    <CalendarClock
                      size={16}
                    />
                  }
                />

                <MiniMetric
                  label="Overdue"
                  value={
                    taskCounts.overdue
                  }
                  icon={
                    <AlertTriangle
                      size={16}
                    />
                  }
                  danger={
                    taskCounts.overdue >
                    0
                  }
                />

              </div>

              <div className="bg-white border border-blue-100 rounded-3xl overflow-hidden shadow-sm">

                {taskLoading ? (
                  <LoadingState text="Loading tasks..." />
                ) : filteredTasks.length ===
                  0 ? (
                  <EmptyState
                    icon={
                      <CheckSquare
                        size={20}
                      />
                    }
                    text="No tasks found"
                  />
                ) : (
                  <div className="overflow-x-auto">

                    <table className="w-full min-w-[1280px]">

                      <thead className="bg-sky-50/60 border-b border-blue-100">

                        <tr>

                          <th className="text-left px-5 py-4 text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                            Task
                          </th>

                          <th className="text-left px-5 py-4 text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                            Employee
                          </th>

                          <th className="text-left px-5 py-4 text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                            Status
                          </th>

                          <th className="text-left px-5 py-4 text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                            Due Date
                          </th>

                          <th className="text-left px-5 py-4 text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                            Countdown
                          </th>

                          <th className="text-right px-5 py-4 text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                            Action
                          </th>

                        </tr>

                      </thead>

                      <tbody>

                        {filteredTasks.map(
                          (
                            task
                          ) => {
                            const info =
                              getDeadlineInfo(
                                task
                              );

                            const status =
                              normalizeStatus(
                                task.status
                              );

                            const overdue =
                              info.state ===
                              "overdue";

                            const dueSoon =
                              info.state ===
                              "due-soon";

                            return (
                              <tr
                                key={
                                  task._id ||
                                  `${task.title}-${task.dueDate}`
                                }
                                className={`border-b border-blue-50 transition ${
                                  overdue
                                    ? "bg-blue-50/70 hover:bg-blue-50"
                                    : dueSoon
                                      ? "bg-sky-50/50 hover:bg-sky-50"
                                      : "hover:bg-sky-50/40"
                                }`}
                              >

                                <td className="px-5 py-4">

                                  <div className="flex items-start gap-2">

                                    {overdue && (
                                      <AlertTriangle
                                        size={
                                          15
                                        }
                                        className="text-blue-700 mt-0.5 shrink-0"
                                      />
                                    )}

                                    <div>

                                      <p className="text-xs font-bold">
                                        {task.title ||
                                          "Untitled Task"}
                                      </p>

                                      <p className="text-[10px] text-slate-400 truncate max-w-xs mt-1">
                                        {task.description ||
                                          "No description"}
                                      </p>

                                    </div>

                                  </div>

                                </td>

                                <td className="px-5 py-4">

                                  <div className="flex items-center gap-2">

                                    <Avatar
                                      name={getSafeName(
                                        task.assignedToName ||
                                          task.assignedTo
                                      )}
                                      size="sm"
                                    />

                                    <span className="text-xs font-semibold">
                                      {getSafeName(
                                        task.assignedToName ||
                                          task.assignedTo
                                      )}
                                    </span>

                                  </div>

                                </td>

                                <td className="px-5 py-4">

                                  <div className="flex flex-wrap gap-1.5">

                                    <span
                                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                                        status ===
                                        "completed"
                                          ? "bg-emerald-50 text-emerald-700"
                                          : status ===
                                              "in progress"
                                            ? "bg-amber-50 text-amber-700"
                                            : "bg-slate-100 text-slate-600"
                                      }`}
                                    >
                                      {task.status ||
                                        "Pending"}
                                    </span>

                                    {overdue && (
                                      <span className="px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 text-[10px] font-black animate-pulse">
                                        OVERDUE
                                      </span>
                                    )}

                                    {dueSoon && (
                                      <span className="px-2.5 py-1 rounded-full bg-sky-100 text-sky-700 text-[10px] font-black">
                                        DUE SOON
                                      </span>
                                    )}

                                  </div>

                                </td>

                                <td className="px-5 py-4">

                                  <p
                                    className={`text-xs font-semibold ${
                                      overdue
                                        ? "text-blue-700"
                                        : dueSoon
                                          ? "text-sky-700"
                                          : "text-slate-600"
                                    }`}
                                  >
                                    {formatDateTime(
                                      task.dueDate
                                    )}
                                  </p>

                                </td>

                                <td className="px-5 py-4">

                                  <div
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[10px] font-black ${
                                      overdue
                                        ? "bg-blue-100 text-blue-800"
                                        : dueSoon
                                          ? "bg-sky-100 text-sky-700"
                                          : "bg-slate-100 text-slate-600"
                                    }`}
                                  >

                                    <Timer
                                      size={
                                        13
                                      }
                                    />

                                    {
                                      info.label
                                    }

                                  </div>

                                </td>

                                <td className="px-5 py-4 text-right">

                                  <div className="flex justify-end gap-2">

                                    <button
                                      onClick={() =>
                                        openEditTaskModal(
                                          task
                                        )
                                      }
                                      className="px-3 py-1.5 bg-sky-50 text-sky-700 rounded-lg text-xs font-bold hover:bg-sky-100 flex items-center gap-1.5"
                                    >
                                      <CalendarDays
                                        size={13}
                                      />
                                      Edit Date
                                    </button>

                                    <button
                                      onClick={() =>
                                        toggleTaskStatus(
                                          task
                                        )
                                      }
                                      className="px-3 py-1.5 bg-blue-900 text-white rounded-lg text-xs font-bold hover:bg-blue-800"
                                    >
                                      Cycle Status
                                    </button>

                                  </div>

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

            </div>
          )}

          {/* =================================================
    WORK SUBMISSIONS
================================================= */}

{activeTab === "Work Submissions" && (
  <div className="space-y-5">

    {/* HEADER */}
    <div className="bg-white border border-blue-100 rounded-3xl p-5 shadow-sm">

      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">

        <div className="flex items-center gap-3">

          <div className="w-11 h-11 rounded-2xl bg-sky-50 text-sky-700 flex items-center justify-center">
            <ClipboardCheck size={21} />
          </div>

          <div>
            <h3 className="font-black text-lg">
              Employee Work Submissions
            </h3>

            <p className="text-xs text-slate-400 mt-1">
              Review submitted content, commands, work links and Drive links.
            </p>
          </div>

        </div>

        <div className="relative">

          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />

          <input
            value={submissionSearch}
            onChange={(e) =>
              setSubmissionSearch(e.target.value)
            }
            placeholder="Search submissions..."
            className="pl-9 pr-3 py-2.5 bg-sky-50/60 border border-blue-100 rounded-xl text-xs outline-none w-full sm:w-72"
          />

        </div>

      </div>

    </div>


    {/* METRICS */}
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

      <MiniMetric
        label="Total Submissions"
        value={submissionList.length}
        icon={<ClipboardCheck size={16} />}
      />

      <MiniMetric
        label="With Drive Links"
        value={
          submissionList.filter((item) =>
            Boolean(
              getSubmissionDriveLink(item)
            )
          ).length
        }
        icon={<LinkIcon size={16} />}
      />

      <MiniMetric
        label="Latest"
        value={
          submissionList.length > 0
            ? "Available"
            : "None"
        }
        icon={<Clock size={16} />}
      />

    </div>


    {/* SUBMISSIONS TABLE */}
    <div className="bg-white border border-blue-100 rounded-3xl overflow-hidden shadow-sm">

      {/* 
        IMPORTANT:
        Only show the loading screen when there is
        NO existing submission data.

        During background refresh, keep the existing
        table visible so the page does not blink.
      */}
      {submissionLoading && submissionList.length === 0 ? (

        <LoadingState text="Loading work submissions..." />

      ) : filteredSubmissions.length === 0 ? (

        <EmptyState
          icon={<ClipboardCheck size={20} />}
          text="No work submissions found"
        />

      ) : (

        <div className="overflow-x-auto">

          <table className="w-full min-w-[1250px]">

            <thead className="bg-sky-50/60 border-b border-blue-100">

              <tr>

                <th className="text-left px-5 py-4 text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                  Employee
                </th>

                <th className="text-left px-5 py-4 text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                  Task
                </th>

                <th className="text-left px-5 py-4 text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                  Submission
                </th>

                <th className="text-left px-5 py-4 text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                  Drive / Link
                </th>

                <th className="text-left px-5 py-4 text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                  Command / Remarks
                </th>

                <th className="text-left px-5 py-4 text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                  Submitted
                </th>

                <th className="text-right px-5 py-4 text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                  Action
                </th>

              </tr>

            </thead>

            <tbody>

              {filteredSubmissions.map((submission) => {

                const employee =
                  getSafeName(
                    submission.userName ||
                    submission.assignedToName ||
                    submission.assignedTo
                  );

                const driveLink =
                  getSubmissionDriveLink(
                    submission
                  );

                const safeUrl =
                  getSafeExternalUrl(
                    driveLink
                  );

                return (
                  <tr
                    key={submission._id}
                    className="border-b border-blue-50 hover:bg-sky-50/40 transition"
                  >

                    {/* EMPLOYEE */}
                    <td className="px-5 py-4">

                      <div className="flex items-center gap-3">

                        <Avatar
                          name={employee}
                        />

                        <div>

                          <p className="text-xs font-bold">
                            {employee}
                          </p>

                          <p className="text-[9px] text-slate-400">
                            ID:{" "}
                            {getUserId(
                              submission.userId ||
                              submission.assignedTo
                            ) || "-"}
                          </p>

                        </div>

                      </div>

                    </td>


                    {/* TASK */}
                    <td className="px-5 py-4">

                      <p className="text-xs font-bold">
                        {submission.taskTitle ||
                          submission.title ||
                          "Task"}
                      </p>

                      <p className="text-[9px] text-slate-400 mt-1">
                        {submission.submissionType}
                      </p>

                    </td>


                    {/* SUBMISSION */}
                    <td className="px-5 py-4">

                      <p className="text-xs text-slate-600 max-w-[220px] line-clamp-3 whitespace-pre-wrap">
                        {getSubmissionContent(
                          submission
                        ) || "-"}
                      </p>

                    </td>


                    {/* DRIVE / LINK */}
                    <td className="px-5 py-4">

                      {safeUrl ? (

                        <a
                          href={safeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-xl text-[10px] font-bold hover:bg-blue-100 max-w-[190px]"
                        >

                          <LinkIcon size={13} />

                          <span className="truncate">
                            Open Link
                          </span>

                          <ExternalLink size={12} />

                        </a>

                      ) : (

                        <span className="text-[10px] text-slate-400">
                          No link
                        </span>

                      )}

                    </td>


                    {/* COMMAND */}
                    <td className="px-5 py-4">

                      <p className="text-xs text-slate-600 max-w-[220px] line-clamp-3 whitespace-pre-wrap">
                        {getSubmissionCommand(
                          submission
                        ) || "-"}
                      </p>

                    </td>


                    {/* SUBMITTED */}
                    <td className="px-5 py-4">

                      <span className="text-xs font-semibold">
                        {formatDateTime(
                          getSubmissionDate(
                            submission
                          )
                        )}
                      </span>

                    </td>


                    {/* ACTION */}
                    <td className="px-5 py-4 text-right">

                      <button
                        onClick={() => {
                          setSelectedSubmission(
                            submission
                          );

                          setShowSubmissionModal(
                            true
                          );
                        }}
                        className="w-9 h-9 rounded-xl bg-sky-50 hover:bg-sky-100 flex items-center justify-center"
                      >

                        <Eye size={14} />

                      </button>

                    </td>

                  </tr>
                );
              })}

            </tbody>

          </table>

        </div>

      )}

    </div>

  </div>
)}

          {/* =================================================
              USERS
          ================================================= */}

          {activeTab ===
            "Users & Team" && (
            <div className="space-y-5">

              <div className="bg-white border border-blue-100 rounded-3xl p-5 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">

                <div>

                  <h3 className="font-black text-lg">
                    Users & Team Management
                  </h3>

                  <p className="text-xs text-slate-400 mt-1">
                    Manage employee accounts and monitor active status.
                  </p>

                </div>

                <div className="relative">

                  <Search
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />

                  <input
                    value={
                      userSearch
                    }
                    onChange={(
                      e
                    ) =>
                      setUserSearch(
                        e.target
                          .value
                      )
                    }
                    placeholder="Search users..."
                    className="pl-9 pr-3 py-2.5 bg-sky-50/60 border border-blue-100 rounded-xl text-xs outline-none w-full sm:w-64"
                  />

                </div>

              </div>

              <div className="bg-white border border-blue-100 rounded-3xl overflow-hidden shadow-sm">

                {loading ? (
                  <LoadingState text="Loading users..." />
                ) : filteredUsers.length ===
                  0 ? (
                  <EmptyState
                    icon={
                      <Users
                        size={20}
                      />
                    }
                    text="No users found"
                  />
                ) : (
                  <div className="overflow-x-auto">

                    <table className="w-full min-w-[1100px]">

                      <thead className="bg-sky-50/60 border-b border-blue-100">

                        <tr>

                          <th className="text-left px-5 py-4 text-[10px] uppercase text-slate-400 font-bold">
                            User
                          </th>

                          <th className="text-left px-5 py-4 text-[10px] uppercase text-slate-400 font-bold">
                            Mobile Number
                          </th>

                          <th className="text-left px-5 py-4 text-[10px] uppercase text-slate-400 font-bold">
                            Status
                          </th>

                          <th className="text-left px-5 py-4 text-[10px] uppercase text-slate-400 font-bold">
                            Working Time
                          </th>

                          <th className="text-left px-5 py-4 text-[10px] uppercase text-slate-400 font-bold">
                            Tasks
                          </th>

                          <th className="text-right px-5 py-4 text-[10px] uppercase text-slate-400 font-bold">
                            Actions
                          </th>

                        </tr>

                      </thead>

                      <tbody>

                        {filteredUsers.map(
                          (user) => {
                            const employee =
                              employeeStatusData.find(
                                (
                                  item
                                ) =>
                                  String(
                                    item
                                      .user
                                      ?._id
                                  ) ===
                                  String(
                                    user._id
                                  )
                              );

                            const mobileNumber =
                              getSafeMobile(
                                user
                              );

                            return (
                              <tr
                                key={
                                  user._id
                                }
                                className="border-b border-blue-50 hover:bg-sky-50/40"
                              >

                                <td className="px-5 py-4">

                                  <div className="flex items-center gap-3">

                                    <Avatar
                                      name={
                                        user.name
                                      }
                                    />

                                    <div>

                                      <p className="text-xs font-bold">
                                        {
                                          user.name
                                        }
                                      </p>

                                      <p className="text-[9px] text-slate-400">
                                        ID:{" "}
                                        {
                                          user._id
                                        }
                                      </p>

                                    </div>

                                  </div>

                                </td>

                                <td className="px-5 py-4">

                                  {mobileNumber ? (
                                    <div className="flex items-center gap-1.5">

                                      <Phone
                                        size={13}
                                        className="text-slate-400"
                                      />

                                      <span className="text-xs font-semibold">
                                        {
                                          mobileNumber
                                        }
                                      </span>

                                    </div>
                                  ) : (
                                    <span className="text-[10px] text-slate-400">
                                      Not provided
                                    </span>
                                  )}

                                </td>

                                <td className="px-5 py-4">

                                  <span
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                                      user.isOnline ===
                                      true
                                        ? "bg-emerald-50 text-emerald-700"
                                        : "bg-slate-100 text-slate-500"
                                    }`}
                                  >

                                    <span
                                      className={`w-1.5 h-1.5 rounded-full ${
                                        user.isOnline ===
                                        true
                                          ? "bg-emerald-500 animate-pulse"
                                          : "bg-slate-400"
                                      }`}
                                    />

                                    {user.isOnline ===
                                    true
                                      ? "Online"
                                      : "Offline"}

                                  </span>

                                </td>

                                <td className="px-5 py-4">

                                  <span className="text-xs font-semibold">
                                    {formatWorkingTime(
                                      user
                                    )}
                                  </span>

                                </td>

                                <td className="px-5 py-4">

                                  <div className="flex flex-wrap gap-1">

                                    <span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-[9px] font-bold">
                                      Done{" "}
                                      {
                                        employee?.completed ||
                                        0
                                      }
                                    </span>

                                    <span className="px-2 py-1 bg-amber-50 text-amber-700 rounded-lg text-[9px] font-bold">
                                      Progress{" "}
                                      {
                                        employee?.progress ||
                                        0
                                      }
                                    </span>

                                    <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-lg text-[9px] font-bold">
                                      Pending{" "}
                                      {
                                        employee?.pending ||
                                        0
                                      }
                                    </span>

                                    {(
                                      employee?.overdue ||
                                      0
                                    ) >
                                      0 && (
                                      <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-lg text-[9px] font-black">
                                        Overdue{" "}
                                        {
                                          employee.overdue
                                        }
                                      </span>
                                    )}

                                  </div>

                                </td>

                                <td className="px-5 py-4 text-right">

                                  <div className="flex justify-end gap-2">

                                    <button
                                      onClick={() =>
                                        openAssignTaskModal(
                                          user
                                        )
                                      }
                                      className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-bold hover:bg-blue-100"
                                    >
                                      Assign
                                    </button>

                                    <button
                                      onClick={() =>
                                        handleEditUser(
                                          user
                                        )
                                      }
                                      className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-200"
                                    >
                                      Edit
                                    </button>

                                    <button
                                      onClick={() =>
                                        handleDeleteUser(
                                          user._id
                                        )
                                      }
                                      className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-bold hover:bg-red-100"
                                    >
                                      Delete
                                    </button>

                                  </div>

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

            </div>
          )}

          {/* =================================================
              MONITOR
          ================================================= */}

          {activeTab ===
            "Monitor" && (
            <div className="space-y-5">

              {/* Overtime and Sunday / day-off work, kept apart and highlighted */}
              <OvertimePanel compact />
              <ProjectLeaderboard role="admin" compact />

              <div className="bg-white border border-blue-100 rounded-3xl p-5 shadow-sm">

                <div className="flex items-center gap-3">

                  <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <Activity
                      size={21}
                    />
                  </div>

                  <div>

                    <h3 className="font-black text-lg">
                      Monitor Employees
                    </h3>

                    <p className="text-xs text-slate-400 mt-1">
                      Live employee presence, working time and task status.
                    </p>

                  </div>

                </div>

              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">

                {employeeStatusData.map(
                  (
                    employee
                  ) => (
                    <div
                      key={
                        employee
                          .user
                          ?._id ||
                        employee.name
                      }
                      className={`bg-white border rounded-3xl p-5 shadow-sm ${
                        employee.overdue >
                        0
                          ? "border-blue-200"
                          : "border-blue-100"
                      }`}
                    >

                      <div className="flex items-center justify-between">

                        <div className="flex items-center gap-3">

                          <Avatar
                            name={
                              employee.name
                            }
                          />

                          <div>

                            <p className="text-xs font-black">
                              {
                                employee.name
                              }
                            </p>

                            <p className="text-[9px] text-slate-400">
                              {
                                employee
                                  .user
                                  ?._id
                              }
                            </p>

                            {employee.mobile && (
                              <p className="text-[9px] text-slate-400 flex items-center gap-1 mt-0.5">

                                <Phone
                                  size={10}
                                />

                                {
                                  employee.mobile
                                }

                              </p>
                            )}

                          </div>

                        </div>

                        <span
                          className={`w-3 h-3 rounded-full ${
                            employee
                              .user
                              ?.isOnline ===
                            true
                              ? "bg-emerald-500 animate-pulse"
                              : "bg-slate-300"
                          }`}
                        />

                      </div>

                      <div className="bg-sky-50/60 rounded-2xl p-3 mt-4">

                        <div className="flex items-center justify-between">

                          <span className="text-[10px] text-slate-400 font-bold">
                            Working Time
                          </span>

                          <Clock
                            size={14}
                            className="text-slate-400"
                          />

                        </div>

                        <p className="text-sm font-black mt-1">
                          {formatWorkingTime(
                            employee.user
                          )}
                        </p>

                      </div>

                      <div className="grid grid-cols-2 gap-2 mt-3">

                        <MonitorMetric
                          label="Total"
                          value={
                            employee.total
                          }
                        />

                        <MonitorMetric
                          label="Completed"
                          value={
                            employee.completed
                          }
                          success
                        />

                        <MonitorMetric
                          label="Progress"
                          value={
                            employee.progress
                          }
                          warning
                        />

                        <MonitorMetric
                          label="Pending"
                          value={
                            employee.pending
                          }
                        />

                        <MonitorMetric
                          label="Due Soon"
                          value={
                            employee.dueSoon
                          }
                          warning
                        />

                        <MonitorMetric
                          label="Overdue"
                          value={
                            employee.overdue
                          }
                          danger
                        />

                      </div>

                      <div className="mt-4">

                        <div className="flex items-center justify-between mb-2">

                          <span className="text-[10px] text-slate-400 font-bold">
                            Completion
                          </span>

                          <span className="text-xs font-black">
                            {
                              employee.percentage
                            }
                            %
                          </span>

                        </div>

                        <div className="h-2.5 bg-blue-100 rounded-full overflow-hidden">

                          <div
                            className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                            style={{
                              width: `${employee.percentage}%`,
                            }}
                          />

                        </div>

                      </div>

                    </div>
                  )
                )}

              </div>

            </div>
          )}

          {/* =================================================
              ANALYTICS
          ================================================= */}

          {activeTab ===
            "Analytics" && (
            <div className="space-y-5">

              <div className="bg-white border border-blue-100 rounded-3xl p-5 shadow-sm">

                <h3 className="font-black text-lg">
                  CRM Analytics & Performance
                </h3>

                <p className="text-xs text-slate-400 mt-1">
                  Live task status, deadline and team productivity analytics.
                </p>

              </div>

              {/* Staff project competition: who completes the most projects, on time */}
              <ProjectLeaderboard role="admin" />

              {/* BAR CHART: TASK STATUS DISTRIBUTION */}

              <div className="bg-white border border-blue-100 rounded-3xl p-6 shadow-sm">

                <div className="flex items-center gap-3 mb-6">

                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
                    <BarChart3
                      size={20}
                    />
                  </div>

                  <div>

                    <h4 className="text-sm font-black">
                      Task Status Bar Chart
                    </h4>

                    <p className="text-[10px] text-slate-400">
                      Live count of tasks by status and deadline state
                    </p>

                  </div>

                </div>

                <div className="w-full h-[300px]">

                  <ResponsiveContainer
                    width="100%"
                    height="100%"
                  >

                    <BarChart
                      data={
                        taskStatusChartData
                      }
                      margin={{
                        top: 10,
                        right: 10,
                        left: -10,
                        bottom: 0,
                      }}
                    >

                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#dbeafe"
                        vertical={
                          false
                        }
                      />

                      <XAxis
                        dataKey="name"
                        tick={{
                          fontSize: 11,
                          fill: "#475569",
                        }}
                        axisLine={{
                          stroke:
                            "#bfdbfe",
                        }}
                        tickLine={
                          false
                        }
                      />

                      <YAxis
                        allowDecimals={
                          false
                        }
                        tick={{
                          fontSize: 11,
                          fill: "#475569",
                        }}
                        axisLine={{
                          stroke:
                            "#bfdbfe",
                        }}
                        tickLine={
                          false
                        }
                      />

                      <Tooltip
                        cursor={{
                          fill: "#eff6ff",
                        }}
                        contentStyle={{
                          borderRadius: 12,
                          border:
                            "1px solid #bfdbfe",
                          fontSize: 12,
                        }}
                      />

                      <Bar
                        dataKey="tasks"
                        radius={[
                          8,
                          8,
                          0,
                          0,
                        ]}
                      >

                        {taskStatusChartData.map(
                          (
                            entry,
                            index
                          ) => (
                            <Cell
                              key={`bar-cell-${index}`}
                              fill={
                                entry.fill
                              }
                            />
                          )
                        )}

                      </Bar>

                    </BarChart>

                  </ResponsiveContainer>

                </div>

              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

                {/* STATUS CHART (LIVE PROGRESS BARS) */}

                <div className="bg-white border border-blue-100 rounded-3xl p-6 shadow-sm">

                  <div className="flex items-center gap-3 mb-6">

                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
                      <BarChart3
                        size={20}
                      />
                    </div>

                    <div>

                      <h4 className="text-sm font-black">
                        Task Status Distribution
                      </h4>

                      <p className="text-[10px] text-slate-400">
                        Current workspace status
                      </p>

                    </div>

                  </div>

                  <div className="space-y-4">

                    {analyticsBars.map(
                      (
                        bar
                      ) => (
                        <div
                          key={
                            bar.label
                          }
                        >

                          <div className="flex items-center justify-between text-xs font-bold mb-1.5">

                            <span>
                              {
                                bar.label
                              }
                            </span>

                            <span>
                              {
                                bar.value
                              }
                            </span>

                          </div>

                          <div className="h-3 bg-blue-100 rounded-full overflow-hidden">

                            <div
                              className={`${bar.className} h-full rounded-full transition-all duration-700`}
                              style={{
                                width: `${(bar.value /
                                  analyticsMax) *
                                  100}%`,
                              }}
                            />

                          </div>

                        </div>
                      )
                    )}

                  </div>

                </div>

                {/* PRODUCTIVITY */}

                <div className="bg-white border border-blue-100 rounded-3xl p-6 shadow-sm">

                  <h4 className="text-sm font-black">
                    Team Productivity
                  </h4>

                  <p className="text-xs text-slate-400 mt-1">
                    Current team performance overview.
                  </p>

                  <div className="grid grid-cols-2 gap-3 mt-6">

                    <AnalyticsMetric
                      label="Working Hours"
                      value={`${totalWorkingHours.toFixed(
                        1
                      )}h`}
                      icon={
                        <Clock
                          size={17}
                        />
                      }
                    />

                    <AnalyticsMetric
                      label="Completion"
                      value={`${completionPercentage}%`}
                      icon={
                        <TrendingUp
                          size={17}
                        />
                      }
                    />

                    <AnalyticsMetric
                      label="Completed"
                      value={
                        taskCounts.completed
                      }
                      icon={
                        <CheckCircle2
                          size={17}
                        />
                      }
                    />

                    <AnalyticsMetric
                      label="Overdue"
                      value={
                        taskCounts.overdue
                      }
                      icon={
                        <AlertTriangle
                          size={17}
                        />
                      }
                      danger
                    />

                  </div>

                  <div className="mt-6">

                    <div className="flex justify-between text-xs font-bold mb-2">

                      <span>
                        Overall Completion
                      </span>

                      <span>
                        {
                          completionPercentage
                        }
                        %
                      </span>

                    </div>

                    <div className="h-4 bg-blue-100 rounded-full overflow-hidden">

                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all duration-700"
                        style={{
                          width: `${completionPercentage}%`,
                        }}
                      />

                    </div>

                  </div>

                </div>

              </div>

              {/* EMPLOYEE ANALYTICS BAR CHART */}

              {employeeChartData.length >
                0 && (
                <div className="bg-white border border-blue-100 rounded-3xl p-6 shadow-sm">

                  <div className="flex items-center gap-3 mb-6">

                    <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center">
                      <Users
                        size={20}
                      />
                    </div>

                    <div>

                      <h4 className="text-sm font-black">
                        Employee Task Bar Chart
                      </h4>

                      <p className="text-xs text-slate-400">
                        Completed vs. in-progress vs. pending vs. overdue, per employee
                      </p>

                    </div>

                  </div>

                  <div className="w-full h-[320px]">

                    <ResponsiveContainer
                      width="100%"
                      height="100%"
                    >

                      <BarChart
                        data={
                          employeeChartData
                        }
                        margin={{
                          top: 10,
                          right: 10,
                          left: -10,
                          bottom: 0,
                        }}
                      >

                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#dbeafe"
                          vertical={
                            false
                          }
                        />

                        <XAxis
                          dataKey="name"
                          tick={{
                            fontSize: 11,
                            fill: "#475569",
                          }}
                          axisLine={{
                            stroke:
                              "#bfdbfe",
                          }}
                          tickLine={
                            false
                          }
                        />

                        <YAxis
                          allowDecimals={
                            false
                          }
                          tick={{
                            fontSize: 11,
                            fill: "#475569",
                          }}
                          axisLine={{
                            stroke:
                              "#bfdbfe",
                          }}
                          tickLine={
                            false
                          }
                        />

                        <Tooltip
                          cursor={{
                            fill: "#eff6ff",
                          }}
                          contentStyle={{
                            borderRadius: 12,
                            border:
                              "1px solid #bfdbfe",
                            fontSize: 12,
                          }}
                        />

                        <Legend
                          wrapperStyle={{
                            fontSize: 11,
                          }}
                        />

                        <Bar
                          dataKey="Completed"
                          stackId="a"
                          fill="#0ea5e9"
                          radius={[
                            0,
                            0,
                            0,
                            0,
                          ]}
                        />

                        <Bar
                          dataKey="In Progress"
                          stackId="a"
                          fill="#38bdf8"
                        />

                        <Bar
                          dataKey="Pending"
                          stackId="a"
                          fill="#93c5fd"
                        />

                        <Bar
                          dataKey="Overdue"
                          stackId="a"
                          fill="#1e40af"
                          radius={[
                            8,
                            8,
                            0,
                            0,
                          ]}
                        />

                      </BarChart>

                    </ResponsiveContainer>

                  </div>

                </div>
              )}

              {/* EMPLOYEE ANALYTICS */}

              <div className="bg-white border border-blue-100 rounded-3xl p-6 shadow-sm">

                <div className="flex items-center gap-3 mb-6">

                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
                    <Users
                      size={20}
                    />
                  </div>

                  <div>

                    <h4 className="text-sm font-black">
                      Employee Work Status Analysis
                    </h4>

                    <p className="text-xs text-slate-400">
                      Employee-wise task performance
                    </p>

                  </div>

                </div>

                <div className="space-y-5">

                  {employeeStatusData.map(
                    (
                      employee
                    ) => (
                      <div
                        key={
                          employee
                            .user
                            ?._id ||
                          employee.name
                        }
                        className="border border-blue-50 rounded-2xl p-4"
                      >

                        <div className="flex flex-col md:flex-row md:items-center gap-4">

                          <div className="flex items-center gap-3 min-w-[200px]">

                            <Avatar
                              name={
                                employee.name
                              }
                              size="sm"
                            />

                            <div>

                              <p className="text-xs font-black">
                                {
                                  employee.name
                                }
                              </p>

                              <p className="text-[9px] text-slate-400">
                                {
                                  employee.total
                                }{" "}
                                tasks
                              </p>

                            </div>

                          </div>

                          <div className="flex-1">

                            <div className="flex h-4 rounded-full overflow-hidden bg-blue-100">

                              {employee.completed >
                                0 && (
                                <div
                                  className="bg-emerald-500"
                                  style={{
                                    width: `${(employee.completed /
                                      Math.max(
                                        employee.total,
                                        1
                                      )) *
                                      100}%`,
                                  }}
                                />
                              )}

                              {employee.progress >
                                0 && (
                                <div
                                  className="bg-amber-500"
                                  style={{
                                    width: `${(employee.progress /
                                      Math.max(
                                        employee.total,
                                        1
                                      )) *
                                      100}%`,
                                  }}
                                />
                              )}

                              {employee.pending >
                                0 && (
                                <div
                                  className="bg-slate-400"
                                  style={{
                                    width: `${(employee.pending /
                                      Math.max(
                                        employee.total,
                                        1
                                      )) *
                                      100}%`,
                                  }}
                                />
                              )}

                            </div>

                            <div className="flex flex-wrap gap-2 mt-2">

                              <span className="text-[9px] text-emerald-700 font-bold">
                                Completed:{" "}
                                {
                                  employee.completed
                                }
                              </span>

                              <span className="text-[9px] text-amber-700 font-bold">
                                Progress:{" "}
                                {
                                  employee.progress
                                }
                              </span>

                              <span className="text-[9px] text-slate-500 font-bold">
                                Pending:{" "}
                                {
                                  employee.pending
                                }
                              </span>

                              <span className="text-[9px] text-blue-800 font-bold">
                                Overdue:{" "}
                                {
                                  employee.overdue
                                }
                              </span>

                            </div>

                          </div>

                          <div className="text-center">

                            <p className="text-xl font-black">
                              {
                                employee.percentage
                              }
                              %
                            </p>

                            <p className="text-[9px] text-slate-400">
                              completion
                            </p>

                          </div>

                        </div>

                      </div>
                    )
                  )}

                </div>

              </div>

            </div>
          )}

          {/* =================================================
              NOTIFICATIONS
          ================================================= */}

          {activeTab ===
            "Notifications" && (
            <div className="space-y-5">

              <div className="bg-white border border-blue-100 rounded-3xl p-5 shadow-sm">

                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">

                  <div className="flex items-center gap-3">

                    <div className="w-11 h-11 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center">
                      <BellRing
                        size={21}
                      />
                    </div>

                    <div>

                      <h3 className="font-black text-lg">
                        Deadline Notification Center
                      </h3>

                      <p className="text-xs text-slate-400 mt-1">
                        Automatic overdue and due-soon monitoring.
                      </p>

                    </div>

                  </div>

                  <div className="flex flex-wrap gap-2">

                    <button
                      onClick={
                        alertsEnabled
                          ? disableAlerts
                          : enableAlerts
                      }
                      className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 ${
                        alertsEnabled
                          ? "bg-emerald-600 text-white"
                          : "bg-blue-900 text-white"
                      }`}
                    >

                      {alertsEnabled ? (
                        <Volume2
                          size={14}
                        />
                      ) : (
                        <VolumeX
                          size={14}
                        />
                      )}

                      {alertsEnabled
                        ? "Alarm Enabled"
                        : "Enable Alarm"}

                    </button>

                    {desktopNotificationsEnabled ? (
                      <span className="px-4 py-2.5 bg-blue-50 text-blue-700 rounded-xl text-xs font-bold flex items-center gap-2">
                        <Bell
                          size={14}
                        />
                        Desktop On
                      </span>
                    ) : (
                      <span className="px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold">
                        Desktop Off
                      </span>
                    )}

                  </div>

                </div>

              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">

                <StatCard
                  title="Overdue"
                  value={
                    taskCounts.overdue
                  }
                  description="Past due and incomplete"
                  icon={
                    <AlertTriangle
                      size={20}
                    />
                  }
                  iconBg="bg-blue-50"
                  iconColor="text-blue-800"
                />

                <StatCard
                  title="Due Soon"
                  value={
                    taskCounts.dueSoon
                  }
                  description="Within 24 hours"
                  icon={
                    <CalendarClock
                      size={20}
                    />
                  }
                  iconBg="bg-sky-50"
                  iconColor="text-sky-700"
                />

                <StatCard
                  title="New Submissions"
                  value={
                    visibleSubmissionNotifications.length
                  }
                  description="Awaiting review"
                  icon={
                    <ClipboardCheck
                      size={20}
                    />
                  }
                  iconBg="bg-emerald-50"
                  iconColor="text-emerald-600"
                />

                <StatCard
                  title="Active Alerts"
                  value={
                    allNotifications.length
                  }
                  description="Currently visible"
                  icon={
                    <Bell
                      size={20}
                    />
                  }
                  iconBg="bg-blue-50"
                  iconColor="text-blue-700"
                />

                <StatCard
                  title="Unread"
                  value={
                    unreadCount +
                    unreadSubmissionCount
                  }
                  description="New monitoring events"
                  icon={
                    <Zap
                      size={20}
                    />
                  }
                  iconBg="bg-sky-50"
                  iconColor="text-sky-700"
                />

              </div>

              <div className="bg-white border border-blue-100 rounded-3xl overflow-hidden shadow-sm">

                {allNotifications.length ===
                0 ? (
                  <EmptyState
                    icon={
                      <CheckCircle2
                        size={20}
                      />
                    }
                    text="No active notifications"
                  />
                ) : (
                  <div className="divide-y divide-blue-50">

                    {allNotifications.map(
                      (
                        notice
                      ) =>
                        notice.type ===
                        "submission" ? (
                          <div
                            key={
                              notice.id
                            }
                            className="p-5 flex items-start justify-between gap-4 bg-emerald-50/40"
                          >

                            <div className="flex gap-3 min-w-0">

                              <div className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center bg-emerald-100 text-emerald-700">
                                <ClipboardCheck
                                  size={18}
                                />
                              </div>

                              <div>

                                <p className="text-xs font-black">
                                  {
                                    notice.title
                                  }
                                </p>

                                <p className="text-[11px] text-slate-600 mt-1">
                                  {
                                    notice.message
                                  }
                                </p>

                                <div className="flex flex-wrap gap-2 mt-2">

                                  <span className="text-[10px] text-slate-400">
                                    Submitted:{" "}
                                    {formatDateTime(
                                      getSubmissionDate(
                                        notice.submission
                                      )
                                    )}
                                  </span>

                                </div>

                              </div>

                            </div>

                            <div className="flex items-center gap-2">

                              <button
                                onClick={() => {
                                  setSelectedSubmission(
                                    notice.submission
                                  );
                                  setShowSubmissionModal(
                                    true
                                  );
                                }}
                                className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-[10px] font-bold"
                              >
                                View
                              </button>

                              <button
                                onClick={() =>
                                  dismissSubmissionNotification(
                                    notice.id
                                  )
                                }
                                className="px-3 py-1.5 bg-white border border-blue-100 rounded-lg text-[10px] font-bold text-slate-600"
                              >
                                Dismiss
                              </button>

                            </div>

                          </div>
                        ) : (
                          <div
                            key={
                              notice.id
                            }
                            className={`p-5 flex items-start justify-between gap-4 ${
                              notice.type ===
                              "overdue"
                                ? "bg-blue-50/40"
                                : "bg-sky-50/40"
                            }`}
                          >

                            <div className="flex gap-3 min-w-0">

                              <div
                                className={`w-10 h-10 rounded-xl shrink-0 flex items-center justify-center ${
                                  notice.type ===
                                  "overdue"
                                    ? "bg-blue-100 text-blue-700"
                                    : "bg-sky-100 text-sky-700"
                                }`}
                              >
                                {notice.type ===
                                "overdue" ? (
                                  <AlertTriangle
                                    size={18}
                                  />
                                ) : (
                                  <CalendarClock
                                    size={18}
                                  />
                                )}
                              </div>

                              <div>

                                <p className="text-xs font-black">
                                  {
                                    notice.title
                                  }
                                </p>

                                <p className="text-[11px] text-slate-600 mt-1">
                                  {
                                    notice.message
                                  }
                                </p>

                                <div className="flex flex-wrap gap-2 mt-2">

                                  <span
                                    className={`text-[10px] font-black ${
                                      notice.type ===
                                      "overdue"
                                        ? "text-blue-700"
                                        : "text-sky-700"
                                    }`}
                                  >
                                    {
                                      notice.label
                                    }
                                  </span>

                                  <span className="text-[10px] text-slate-400">
                                    Due:{" "}
                                    {formatDateTime(
                                      notice.task
                                        .dueDate
                                    )}
                                  </span>

                                </div>

                              </div>

                            </div>

                            <div className="flex items-center gap-2">

                              <button
                                onClick={() =>
                                  openEditTaskModal(
                                    notice.task
                                  )
                                }
                                className="px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-100 rounded-lg text-[10px] font-bold"
                              >
                                Update Date
                              </button>

                              <button
                                onClick={() =>
                                  dismissNotification(
                                    notice.id
                                  )
                                }
                                className="px-3 py-1.5 bg-white border border-blue-100 rounded-lg text-[10px] font-bold text-slate-600"
                              >
                                Dismiss
                              </button>

                            </div>

                          </div>
                        )
                    )}

                  </div>
                )}

              </div>

            </div>
          )}

          {/* =================================================
              OTHER MODULES
          ================================================= */}

          {[
                "Settings",
            "Trash",
          ].includes(
            activeTab
          ) && (
            <div className="bg-white border border-blue-100 rounded-3xl p-10 text-center shadow-sm">

              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center mx-auto">

                <FileText
                  size={22}
                />

              </div>

              <h3 className="font-black text-xl mt-4">
                {activeTab}
              </h3>

              <p className="text-xs text-slate-400 mt-2">
                This module is part of your Profenaa Infotech CRM workspace.
              </p>

            </div>
          )}

        </div>

      </main>

      {/* =================================================
          CREATE USER MODAL
      ================================================= */}

      {showCreateModal && (
        <Modal
          title="Create New User Account"
          subtitle="Add a new employee account."
          onClose={() => {
            setShowCreateModal(
              false
            );
            setName("");
            setMobile("");
            setPassword("");
          }}
        >

          <form
            onSubmit={
              handleCreateUser
            }
            className="space-y-4"
          >

            <Field label="Username">

              <input
                type="text"
                value={
                  name
                }
                onChange={(
                  e
                ) =>
                  setName(
                    e.target
                      .value
                  )
                }
                placeholder="Enter username"
                className="input"
                required
              />

            </Field>

            <Field label="Mobile Number">

              <div className="relative">

                <Phone
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />

                <input
                  type="tel"
                  value={
                    mobile
                  }
                  onChange={(
                    e
                  ) =>
                    setMobile(
                      e.target
                        .value
                    )
                  }
                  placeholder="Enter mobile number"
                  className="input pl-9"
                  required
                />

              </div>

            </Field>

            <Field label="Password">

              <input
                type="password"
                value={
                  password
                }
                onChange={(
                  e
                ) =>
                  setPassword(
                    e.target
                      .value
                  )
                }
                placeholder="Enter password"
                className="input"
                required
              />

            </Field>

            <button
              type="submit"
              className="primary-btn"
            >

              <UserPlus
                size={15}
              />

              Create Account

            </button>

          </form>

        </Modal>
      )}

      {/* =================================================
          EDIT USER MODAL
      ================================================= */}

      {showEditModal &&
        selectedUser && (
          <Modal
            title="Update User Credentials"
            subtitle={`Editing ${getSafeName(
              selectedUser.name
            )}`}
            onClose={() => {
              setShowEditModal(
                false
              );
              setSelectedUser(
                null
              );
              setName("");
              setMobile("");
              setPassword("");
            }}
          >

            <form
              onSubmit={
                handleUpdateUser
              }
              className="space-y-4"
            >

              <Field label="Username">

                <input
                  type="text"
                  value={
                    name
                  }
                  onChange={(
                    e
                  ) =>
                    setName(
                      e.target
                        .value
                    )
                  }
                  className="input"
                  required
                />

              </Field>

              <Field label="Mobile Number">

                <div className="relative">

                  <Phone
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />

                  <input
                    type="tel"
                    value={
                      mobile
                    }
                    onChange={(
                      e
                    ) =>
                      setMobile(
                        e.target
                          .value
                      )
                    }
                    placeholder="Enter mobile number"
                    className="input pl-9"
                  />

                </div>

              </Field>

              <Field label="New Password">

                <input
                  type="password"
                  value={
                    password
                  }
                  onChange={(
                    e
                  ) =>
                    setPassword(
                      e.target
                        .value
                    )
                  }
                  placeholder="Leave blank to keep current password"
                  className="input"
                />

              </Field>

              <button
                type="submit"
                className="primary-btn"
              >

                <Edit
                  size={15}
                />

                Update User

              </button>

            </form>

          </Modal>
        )}

      {/* =================================================
          ASSIGN TASK MODAL
      ================================================= */}

      {/* Assigning a task now opens the same Internal / External project form used on the
          Projects screen - one form, one path, whether it becomes a pool project or is
          handed straight to someone. Self-assigning or being assigned always lands in Tasks. */}
      {taskFormPreset !== null && (
        <ProjectFormModal
          mode="create"
          defaultType="Internal"
          defaultAssignedTo={taskFormPreset}
          users={userList}
          onClose={() => setTaskFormPreset(null)}
          onSaved={(project, message) => {
            setTaskFormPreset(null);
            alert(message || "Successfully added to tasks.");
            fetchTasks();
          }}
        />
      )}

      {showAssignTaskModal && (
        <Modal
          title="Assign Task to Users"
          subtitle="The same task can be assigned to multiple employees."
          wide
          onClose={() =>
            setShowAssignTaskModal(
              false
            )
          }
        >

          <form
            onSubmit={
              handleAssignTask
            }
            className="space-y-5"
          >

            <div>

              <div className="flex items-center justify-between mb-2">

                <label className="text-[10px] uppercase font-bold text-slate-400">
                  Assign To Users
                </label>

                <span className="text-[10px] font-black text-blue-700">
                  {
                    taskAssignees.length
                  }{" "}
                  selected
                </span>

              </div>

              <div className="flex justify-between bg-sky-50/60 border border-blue-100 rounded-xl p-3 mb-2">

                <button
                  type="button"
                  onClick={
                    toggleAllAssignees
                  }
                  className="text-xs font-bold text-blue-700"
                >
                  {taskAssignees.length ===
                    userList.filter(
                      (
                        user
                      ) =>
                        Boolean(
                          user?._id
                        )
                    ).length &&
                  userList.length >
                    0
                    ? "Clear All"
                    : "Select All"}
                </button>

                {taskAssignees.length >
                  0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setTaskAssignees(
                        []
                      )
                    }
                    className="text-xs font-bold text-blue-500"
                  >
                    Clear Selection
                  </button>
                )}

              </div>

              <div className="border border-blue-100 rounded-2xl max-h-[280px] overflow-y-auto">

                {userList.length ===
                0 ? (
                  <EmptyState
                    icon={
                      <Users
                        size={20}
                      />
                    }
                    text="No users available"
                  />
                ) : (
                  userList.map(
                    (
                      user
                    ) => {
                      const checked =
                        taskAssignees.includes(
                          user._id
                        );

                      return (
                        <label
                          key={
                            user._id
                          }
                          className={`flex items-center gap-3 p-3 cursor-pointer border-b border-blue-50 ${
                            checked
                              ? "bg-blue-50"
                              : "hover:bg-sky-50/50"
                          }`}
                        >

                          <input
                            type="checkbox"
                            checked={
                              checked
                            }
                            onChange={() =>
                              toggleAssignee(
                                user._id
                              )
                            }
                            className="w-4 h-4 accent-blue-600"
                          />

                          <Avatar
                            name={
                              user.name
                            }
                            size="sm"
                          />

                          <div className="flex-1">

                            <p className="text-xs font-bold">
                              {
                                user.name
                              }
                            </p>

                            <p className="text-[9px] text-slate-400">
                              {getSafeMobile(
                                user
                              ) ||
                                (user.isOnline ===
                                true
                                  ? "Online"
                                  : "Offline")}
                            </p>

                          </div>

                          {checked && (
                            <CheckCircle
                              size={18}
                              className="text-blue-700"
                            />
                          )}

                        </label>
                      );
                    }
                  )
                )}

              </div>

            </div>

            <Field label="Task Title">

              <input
                type="text"
                value={
                  taskTitle
                }
                onChange={(
                  e
                ) =>
                  setTaskTitle(
                    e.target
                      .value
                  )
                }
                placeholder="Enter task title"
                className="input"
                required
              />

            </Field>

            <Field label="Description">

              <textarea
                value={
                  taskDescription
                }
                onChange={(
                  e
                ) =>
                  setTaskDescription(
                    e.target
                      .value
                  )
                }
                placeholder="Task details..."
                className="input h-24 resize-none"
              />

            </Field>

            <Field label="Due Date & Time">

              <div className="relative">

                <CalendarDays
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />

                <input
                  type="datetime-local"
                  value={
                    taskDueDate
                  }
                  onChange={(
                    e
                  ) =>
                    setTaskDueDate(
                      e.target
                        .value
                    )
                  }
                  className="input pl-9"
                />

              </div>

              <p className="text-[10px] text-slate-400 mt-1">
                After this date/time, incomplete tasks automatically appear as overdue.
              </p>

            </Field>

            <button
              type="submit"
              disabled={
                taskAssignees.length ===
                0
              }
              className={`w-full py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 ${
                taskAssignees.length ===
                0
                  ? "bg-slate-200 text-slate-400"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
            >

              <CheckSquare
                size={15}
              />

              {taskAssignees.length >
              0
                ? `Assign Same Task to ${taskAssignees.length} User${
                    taskAssignees.length !==
                    1
                      ? "s"
                      : ""
                  }`
                : "Select Users First"}

            </button>

          </form>

        </Modal>
      )}

      {/* =================================================
          EDIT TASK MODAL (update due date after assignment)
      ================================================= */}

      {showEditTaskModal &&
        selectedTask && (
          <Modal
            title="Update Task"
            subtitle={`Editing "${
              selectedTask.title ||
              "Untitled Task"
            }" for ${getSafeName(
              selectedTask.assignedToName ||
                selectedTask.assignedTo
            )}`}
            onClose={() => {
              setShowEditTaskModal(
                false
              );

              setSelectedTask(
                null
              );
            }}
          >

            <form
              onSubmit={
                handleUpdateTask
              }
              className="space-y-4"
            >

              <Field label="Task Title">

                <input
                  type="text"
                  value={
                    editTaskTitle
                  }
                  onChange={(
                    e
                  ) =>
                    setEditTaskTitle(
                      e.target
                        .value
                    )
                  }
                  className="input"
                  required
                />

              </Field>

              <Field label="Description">

                <textarea
                  value={
                    editTaskDescription
                  }
                  onChange={(
                    e
                  ) =>
                    setEditTaskDescription(
                      e.target
                        .value
                    )
                  }
                  placeholder="Task details..."
                  className="input h-24 resize-none"
                />

              </Field>

              <Field label="Due Date & Time">

                <div className="relative">

                  <CalendarDays
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />

                  <input
                    type="datetime-local"
                    value={
                      editTaskDueDate
                    }
                    onChange={(
                      e
                    ) =>
                      setEditTaskDueDate(
                        e.target
                          .value
                      )
                    }
                    className="input pl-9"
                  />

                </div>

                <p className="text-[10px] text-slate-400 mt-1">
                  Updating the due date recalculates whether this task shows as overdue, due soon, or on time.
                </p>

              </Field>

              <button
                type="submit"
                disabled={
                  editTaskSaving
                }
                className={`w-full py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 ${
                  editTaskSaving
                    ? "bg-slate-200 text-slate-400"
                    : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
              >

                <CalendarDays
                  size={15}
                />

                {editTaskSaving
                  ? "Saving..."
                  : "Save Due Date"}

              </button>

            </form>

          </Modal>
        )}

      {/* =================================================
          SUBMISSION MODAL
      ================================================= */}

      {showSubmissionModal &&
        selectedSubmission && (
          <Modal
            title="Work Submission Details"
            subtitle="Complete employee submission information."
            wide
            onClose={() => {
              setShowSubmissionModal(
                false
              );

              setSelectedSubmission(
                null
              );
            }}
          >

            <div className="space-y-4">

              <ProfileRow
                label="Employee"
                value={getSafeName(
                  selectedSubmission.userName ||
                    selectedSubmission.assignedToName ||
                    selectedSubmission.assignedTo
                )}
              />

              <ProfileRow
                label="Employee ID"
                value={
                  getUserId(
                    selectedSubmission.userId ||
                      selectedSubmission.assignedTo
                  ) ||
                  "-"
                }
              />

              <ProfileRow
                label="Task"
                value={
                  selectedSubmission.taskTitle ||
                    selectedSubmission.title ||
                    "Task"
                }
              />

              <ProfileRow
                label="Submission Type"
                value={getSubmissionType(
                  selectedSubmission
                )}
              />

              <ProfileRow
                label="Content / Description"
                value={
                  getSubmissionContent(
                    selectedSubmission
                  ) ||
                  "No content submitted"
                }
              />

              <ProfileRow
                label="Command / Remarks"
                value={
                  getSubmissionCommand(
                    selectedSubmission
                  ) ||
                  "No command or remarks"
                }
              />

              <ProfileRow
                label="Submitted At"
                value={formatDateTime(
                  getSubmissionDate(
                    selectedSubmission
                  )
                )}
              />

              {getSubmissionDriveLink(
                selectedSubmission
              ) && (
                <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">

                  <p className="text-[10px] uppercase font-bold text-blue-500 mb-2">
                    Drive / Work Link
                  </p>

                  <a
                    href={getSafeExternalUrl(
                      getSubmissionDriveLink(
                        selectedSubmission
                      )
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-xs font-bold text-blue-700 hover:underline break-all"
                  >

                    <LinkIcon
                      size={15}
                    />

                    Open Submitted Drive Link

                    <ExternalLink
                      size={13}
                    />

                  </a>

                </div>
              )}

            </div>

          </Modal>
        )}

    </div>
  );
}

/* =========================================================
   NAV ITEM
========================================================= */

function NavItem({
  icon,
  label,
  active,
  onClick,
}) {
  return (
    <button
      onClick={
        onClick
      }
      className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-medium transition sbs-item ${
        active
          ? "bg-blue-900 text-white shadow-sm"
          : "text-slate-600 hover:bg-sky-50"
      }`}
    >
      {icon}
      <span>
        {label}
      </span>
    </button>
  );
}

/* =========================================================
   STAT CARD
========================================================= */

function StatCard({
  title,
  value,
  description,
  icon,
  iconBg,
  iconColor,
}) {
  return (
    <div className="bg-white border border-blue-100 rounded-2xl p-5 shadow-sm">

      <div
        className={`w-10 h-10 rounded-xl ${iconBg} ${iconColor} flex items-center justify-center`}
      >
        {icon}
      </div>

      <p className="text-[11px] text-slate-400 font-semibold mt-5">
        {title}
      </p>

      <p className="text-2xl font-black mt-1">
        {toSafeText(
          value
        )}
      </p>

      <p className="text-[10px] text-slate-400 mt-1">
        {description}
      </p>

    </div>
  );
}

/* =========================================================
   MINI METRIC
========================================================= */

function MiniMetric({
  label,
  value,
  icon,
  danger = false,
}) {
  return (
    <div
      className={`bg-white border rounded-2xl p-4 ${
        danger
          ? "border-blue-200"
          : "border-blue-100"
      }`}
    >

      <div className="flex items-center justify-between">

        <span className="text-[10px] font-bold text-slate-400">
          {label}
        </span>

        <span
          className={
            danger
              ? "text-blue-700"
              : "text-slate-500"
          }
        >
          {icon}
        </span>

      </div>

      <p
        className={`text-xl font-black mt-2 ${
          danger
            ? "text-blue-800"
            : "text-slate-900"
        }`}
      >
        {toSafeText(
          value
        )}
      </p>

    </div>
  );
}

/* =========================================================
   MONITOR METRIC
========================================================= */

function MonitorMetric({
  label,
  value,
  success,
  warning,
  danger,
}) {
  let classes =
    "bg-sky-50/60 border-blue-50 text-slate-700";

  if (success) {
    classes =
      "bg-emerald-50 border-emerald-100 text-emerald-700";
  }

  if (warning) {
    classes =
      "bg-sky-50 border-sky-100 text-sky-700";
  }

  if (danger) {
    classes =
      "bg-blue-50 border-blue-100 text-blue-800";
  }

  return (
    <div
      className={`rounded-xl border p-3 ${classes}`}
    >

      <p className="text-sm font-black">
        {value}
      </p>

      <p className="text-[9px] font-bold mt-0.5 opacity-70">
        {label}
      </p>

    </div>
  );
}

/* =========================================================
   ANALYTICS METRIC
========================================================= */

function AnalyticsMetric({
  label,
  value,
  icon,
  danger = false,
}) {
  return (
    <div
      className={`rounded-2xl p-4 border ${
        danger
          ? "bg-blue-50 border-blue-100 text-blue-800"
          : "bg-sky-50/60 border-blue-50"
      }`}
    >

      <div className="flex items-center justify-between">

        <span className="text-[10px] font-bold opacity-60">
          {label}
        </span>

        {icon}

      </div>

      <p className="text-xl font-black mt-2">
        {value}
      </p>

    </div>
  );
}

/* =========================================================
   SUBMISSION ROW
========================================================= */

function SubmissionRow({
  submission,
  onView,
}) {
  const employee =
    getSafeName(
      submission.userName ||
        submission.assignedToName ||
        submission.assignedTo
    );

  const task =
    submission.taskTitle ||
    submission.title ||
    "Task";

  const driveLink =
    getSubmissionDriveLink(
      submission
    );

  const content =
    getSubmissionContent(
      submission
    );

  return (
    <div className="border border-blue-50 bg-sky-50/50 rounded-2xl p-4">

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">

        <div className="flex items-center gap-3 min-w-0">

          <Avatar
            name={
              employee
            }
          />

          <div className="min-w-0">

            <p className="text-xs font-black">
              {employee}
            </p>

            <p className="text-[10px] text-slate-400 truncate">
              {task}
            </p>

            {content && (
              <p className="text-[10px] text-slate-500 mt-1 line-clamp-1 whitespace-pre-wrap">
                {content}
              </p>
            )}

            <p className="text-[9px] text-slate-400 mt-1">
              {formatSubmissionDate(
                getSubmissionDate(
                  submission
                )
              )}
            </p>

          </div>

        </div>

        <div className="flex items-center gap-2">

          {driveLink && (
            <a
              href={getSafeExternalUrl(
                driveLink
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-xl text-xs font-bold flex items-center gap-1.5"
            >
              <ExternalLink
                size={13}
              />
              Link
            </a>
          )}

          <button
            onClick={
              onView
            }
            className="px-3 py-1.5 bg-white border border-blue-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-sky-50 flex items-center gap-1.5"
          >
            <Eye
              size={13}
            />
            View
          </button>

        </div>

      </div>

    </div>
  );
}

/* =========================================================
   SUBMISSION DATE
========================================================= */

function formatSubmissionDate(
  value
) {
  if (!value) {
    return "";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "";
  }

  return date.toLocaleString(
    "en-IN",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }
  );
}

/* =========================================================
   AVATAR
========================================================= */

function Avatar({
  name,
  size = "md",
}) {
  const safe =
    getSafeName(
      name
    );

  const initials =
    safe
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map(
        (part) =>
          part[0]
      )
      .join("")
      .toUpperCase();

  const dimensions =
    size === "sm"
      ? "w-7 h-7 text-[10px]"
      : "w-9 h-9 text-xs";

  return (
    <div
      className={`${dimensions} rounded-xl bg-blue-900 text-white font-bold flex items-center justify-center flex-shrink-0`}
    >
      {initials ||
        "U"}
    </div>
  );
}

/* =========================================================
   LOADING
========================================================= */

function LoadingState({
  text,
}) {
  return (
    <div className="py-16 text-center">

      <RefreshCw
        size={25}
        className="animate-spin mx-auto text-blue-600"
      />

      <p className="text-xs text-slate-400 font-medium mt-3">
        {text}
      </p>

    </div>
  );
}

/* =========================================================
   EMPTY
========================================================= */

function EmptyState({
  icon,
  text,
}) {
  return (
    <div className="py-16 text-center text-slate-400">

      <div className="w-11 h-11 rounded-xl bg-sky-50 flex items-center justify-center mx-auto">
        {icon}
      </div>

      <p className="text-xs font-medium mt-3">
        {text}
      </p>

    </div>
  );
}

/* =========================================================
   FIELD
========================================================= */

function Field({
  label,
  children,
}) {
  return (
    <div>

      <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5">
        {label}
      </label>

      {children}

    </div>
  );
}

/* =========================================================
   MODAL
========================================================= */

function Modal({
  title,
  subtitle,
  onClose,
  children,
  wide = false,
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-blue-950/50 backdrop-blur-sm p-4">

      <div
        className={`bg-white rounded-3xl ${
          wide
            ? "max-w-5xl"
            : "max-w-md"
        } w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto`}
      >

        <div className="flex items-start justify-between gap-4 mb-5">

          <div>

            <h3 className="font-black text-base">
              {title}
            </h3>

            {subtitle && (
              <p className="text-xs text-slate-400 mt-1">
                {subtitle}
              </p>
            )}

          </div>

          <button
            onClick={
              onClose
            }
            className="w-8 h-8 rounded-xl bg-sky-50 hover:bg-sky-100 flex items-center justify-center"
          >

            <X
              size={16}
            />

          </button>

        </div>

        {children}

      </div>

    </div>
  );
}

/* =========================================================
   PROFILE ROW
========================================================= */

function ProfileRow({
  label,
  value,
}) {
  const safeValue =
    toSafeText(
      value
    );

  return (
    <div className="bg-sky-50/60 rounded-2xl p-4 border border-blue-50">

      <p className="text-[10px] uppercase font-bold text-slate-400">
        {label}
      </p>

      <p className="text-xs font-semibold text-slate-800 mt-1 whitespace-pre-wrap break-words">
        {safeValue ||
          "-"}
      </p>

    </div>
  );
}