import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  FolderKanban,
  Plus,
  RefreshCw,
  Search,
  Users,
  Clock3,
  CheckCircle2,
  Circle,
  PlayCircle,
  X,
  CalendarDays,
  UserRound,
  Layers,
  Image as ImageIcon,
  AlertCircle,
  Eye,
  ChevronDown,
  Filter,
  UserPlus,
  ClipboardList,
  TrendingUp,
  PackageOpen,
  ArrowUpDown,
  RotateCcw,
  Copy,
  ExternalLink,
  Check,
  CalendarCheck,
  CalendarClock,
  BarChart3,
  Sparkles,
  SlidersHorizontal,
  UserCheck,
  CircleDot,
  Zap,
  Pencil,
  Trash2,
  Send,
} from "lucide-react";
import ProjectFormModal from "./projects/ProjectFormModal";
import {
  TYPE_STYLE,
  fmtMinutes,
  imageUrl,
  projectImages,
  projectRequest,
} from "./projects/projectApi";
import { API_ORIGIN } from "../lib/api";

/* =========================================================
   API CONFIGURATION
========================================================= */

const PROJECT_API_URL = `${API_ORIGIN}/api/Project`;

const USER_API_URL = `${API_ORIGIN}/api/UserAccounts`;

const SERVER_URL = API_ORIGIN;

/* =========================================================
   HELPERS FOR THE INTERNAL / EXTERNAL HEADINGS AND LOGIN
========================================================= */

// Projects created before the "type" existed count as Internal
const typeOf = (project) => project?.projectType || "Internal";

// The project API needs the admin's login token on every call
const adminHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("adminToken") || ""}`,
});

/* =========================================================
   HELPERS
========================================================= */

const getProjectId = (project) =>
  project?._id || project?.id || "";

const getProjectName = (project) =>
  project?.title ||
  project?.name ||
  "Untitled Project";

const getProjectDescription = (project) =>
  project?.description ||
  "No description available.";

const getProjectStatus = (project) =>
  project?.status || "Pending";

const getProjectImage = (project) => {
  const image =
    project?.cardImage ||
    project?.image ||
    (Array.isArray(project?.images) &&
    project.images.length > 0
      ? project.images[0]
      : "");

  if (!image) return "";

  if (
    image.startsWith("http://") ||
    image.startsWith("https://") ||
    image.startsWith("data:")
  ) {
    return image;
  }

  if (image.startsWith("/")) {
    return `${SERVER_URL}${image}`;
  }

  return `${SERVER_URL}/${image}`;
};

const getAssignedUserName = (project) => {
  if (project?.assignedToName) {
    return project.assignedToName;
  }

  if (
    project?.assignedTo &&
    typeof project.assignedTo === "object"
  ) {
    return (
      project.assignedTo.name ||
      project.assignedTo.email ||
      "Assigned User"
    );
  }

  return "Project Pool";
};

const getAssignedUserId = (project) => {
  if (
    project?.assignedTo &&
    typeof project.assignedTo === "object"
  ) {
    return (
      project.assignedTo._id ||
      project.assignedTo.id ||
      ""
    );
  }

  return project?.assignedTo || "";
};

const formatDate = (date) => {
  if (!date) return "No due date";

  const parsed = new Date(date);

  if (Number.isNaN(parsed.getTime())) {
    return "Invalid date";
  }

  return parsed.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatDateTime = (date) => {
  if (!date) return "Not available";

  const parsed = new Date(date);

  if (Number.isNaN(parsed.getTime())) {
    return "Invalid date";
  }

  return parsed.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const startOfDay = (date = new Date()) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfDay = (date = new Date()) => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const isSameDay = (date1, date2) => {
  if (!date1 || !date2) return false;

  const a = startOfDay(date1);
  const b = startOfDay(date2);

  return a.getTime() === b.getTime();
};

const isOverdue = (project) => {
  if (!project?.dueDate) return false;

  if (getProjectStatus(project) === "Completed" || getProjectStatus(project) === "Submitted") {
    return false;
  }

  const due = new Date(project.dueDate);

  if (Number.isNaN(due.getTime())) {
    return false;
  }

  return due < startOfDay();
};

const isDueToday = (project) => {
  if (!project?.dueDate) return false;

  return isSameDay(project.dueDate, new Date());
};

const isDueTomorrow = (project) => {
  if (!project?.dueDate) return false;

  return isSameDay(
    project.dueDate,
    addDays(new Date(), 1)
  );
};

const isDueWithinNext7Days = (project) => {
  if (!project?.dueDate) return false;

  const due = startOfDay(project.dueDate);
  const today = startOfDay();
  const next7 = endOfDay(addDays(new Date(), 7));

  return due >= today && due <= next7;
};

const isDueThisWeek = (project) => {
  if (!project?.dueDate) return false;

  const today = startOfDay();
  const day = today.getDay();

  const mondayOffset =
    day === 0 ? -6 : 1 - day;

  const weekStart = startOfDay(
    addDays(today, mondayOffset)
  );

  const weekEnd = endOfDay(
    addDays(weekStart, 6)
  );

  const due = new Date(project.dueDate);

  return due >= weekStart && due <= weekEnd;
};

const isDueSoon = (project) => {
  if (!project?.dueDate) return false;

  if (
    getProjectStatus(project) ===
      "Completed" ||
    getProjectStatus(project) === "Submitted"
  ) {
    return false;
  }

  const due = startOfDay(project.dueDate);
  const today = startOfDay();
  const threeDays = endOfDay(
    addDays(new Date(), 3)
  );

  return due >= today && due <= threeDays;
};

const isCreatedToday = (project) => {
  if (!project?.createdAt) return false;

  return isSameDay(
    project.createdAt,
    new Date()
  );
};

const isCreatedWithinDays = (
  project,
  days
) => {
  if (!project?.createdAt) return false;

  const created = new Date(project.createdAt);
  const today = new Date();
  const fromDate = addDays(today, -days);

  return created >= startOfDay(fromDate);
};

const getStatusClasses = (status) => {
  switch (status) {
    case "Completed":
      return "bg-emerald-100 text-emerald-700 border-emerald-200";

    case "Submitted":
      return "bg-indigo-100 text-indigo-700 border-indigo-200";

    case "In Progress":
      return "bg-blue-100 text-blue-700 border-blue-200";

    case "Pending":
    default:
      return "bg-amber-100 text-amber-700 border-amber-200";
  }
};

const getStatusIcon = (status) => {
  switch (status) {
    case "Completed":
      return <CheckCircle2 size={14} />;

    case "Submitted":
      return <Send size={14} />;

    case "In Progress":
      return <PlayCircle size={14} />;

    default:
      return <Circle size={14} />;
  }
};

const getProgress = (project) => {
  switch (getProjectStatus(project)) {
    case "Completed":
      return 100;

    case "Submitted":
      return 80;

    case "In Progress":
      return 50;

    case "Pending":
    default:
      return 0;
  }
};

const getProgressClasses = (project) => {
  switch (getProjectStatus(project)) {
    case "Completed":
      return "bg-emerald-500";

    case "Submitted":
      return "bg-indigo-500";

    case "In Progress":
      return "bg-blue-500";

    default:
      return "bg-amber-500";
  }
};

/* =========================================================
   MAIN COMPONENT
========================================================= */

export default function ProjectManagement() {
  /* =======================================================
     STATE
  ======================================================= */

  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);

  const [loadingProjects, setLoadingProjects] =
    useState(false);

  const [loadingUsers, setLoadingUsers] =
    useState(false);

  const [typeTab, setTypeTab] = useState("Internal");
  const [formModal, setFormModal] = useState(null); // { mode: "create" | "edit", type?, project? }
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const errorTimer = useRef(null);
  const successTimer = useRef(null);

  const [updatingStatus, setUpdatingStatus] =
    useState("");

  const [showDetailsModal, setShowDetailsModal] =
    useState(false);

  const [showFilters, setShowFilters] =
    useState(false);

  const [selectedProject, setSelectedProject] =
    useState(null);

  /* Search */

  const [searchTerm, setSearchTerm] =
    useState("");

  /* Basic filters */

  const [statusFilter, setStatusFilter] =
    useState("All");

  const [assignmentFilter, setAssignmentFilter] =
    useState("All");

  const [userFilter, setUserFilter] =
    useState("All");

  /* Date filters */

  const [dueDateFilter, setDueDateFilter] =
    useState("All");

  const [createdDateFilter, setCreatedDateFilter] =
    useState("All");

  /* Sorting */

  const [sortBy, setSortBy] =
    useState("newest");

  /* Notifications */

  const [errorMessage, setErrorMessage] =
    useState("");

  const [successMessage, setSuccessMessage] =
    useState("");

  /* Copy */

  const [copiedValue, setCopiedValue] =
    useState("");

  /* =======================================================
     NOTIFICATIONS
  ======================================================= */

  const showError = (message) => {
    clearTimeout(errorTimer.current);
    clearTimeout(successTimer.current);
    setSuccessMessage("");
    setErrorMessage(message);
    errorTimer.current = setTimeout(() => setErrorMessage(""), 3000);
  };

  const showSuccess = (message) => {
    clearTimeout(errorTimer.current);
    clearTimeout(successTimer.current);
    setErrorMessage("");
    setSuccessMessage(message);
    successTimer.current = setTimeout(() => setSuccessMessage(""), 3000);
  };

  /* =======================================================
     FETCH USERS
  ======================================================= */

  const fetchUsers = async () => {
    try {
      setLoadingUsers(true);

      const response = await fetch(`${USER_API_URL}/get-All-Profiles`, { headers: adminHeaders() });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.message ||
            data?.error ||
            "Failed to load users."
        );
      }

      const userData =
        data?.getprofile ||
        data?.users ||
        data?.userList ||
        data?.profiles ||
        [];

      setUsers(
        Array.isArray(userData)
          ? userData
          : []
      );
    } catch (error) {
      console.error(
        "FETCH USERS ERROR:",
        error
      );

      showError(
        error.message ||
          "Unable to load users."
      );
    } finally {
      setLoadingUsers(false);
    }
  };

  /* =======================================================
     FETCH PROJECTS
  ======================================================= */

  const fetchProjects = async () => {
    try {
      setLoadingProjects(true);

      const response = await fetch(`${PROJECT_API_URL}/get-all-projects`, { headers: adminHeaders() });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.message ||
            data?.error ||
            "Failed to load projects."
        );
      }

      const projectData =
        data?.projects ||
        data?.data ||
        data?.projectList ||
        [];

      setProjects(
        Array.isArray(projectData)
          ? projectData
          : []
      );
    } catch (error) {
      console.error(
        "FETCH PROJECTS ERROR:",
        error
      );

      showError(
        error.message ||
          "Unable to load projects."
      );
    } finally {
      setLoadingProjects(false);
    }
  };

  /* =======================================================
     INITIAL LOAD
  ======================================================= */

  useEffect(() => {
    fetchProjects();
    fetchUsers();
  }, []);

  /* =======================================================
     CREATE / EDIT / DELETE
     (the form itself lives in ./projects/ProjectFormModal)
  ======================================================= */

  const openCreateModal = (category = "Internal") => {
    setTypeTab(category); // the new card shows up under this heading
    setFormModal({ mode: "create", type: category });
  };

  const openEditModal = (project) => {
    setShowDetailsModal(false);
    setFormModal({ mode: "edit", project });
  };

  const handleProjectSaved = async (project, message) => {
    setFormModal(null);
    if (project?.projectType) setTypeTab(project.projectType);
    showSuccess(message || "Project saved.");
    await fetchProjects();
  };

  const askDelete = (project) => {
    setShowDetailsModal(false);
    setDeleteTarget(project);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      const data = await projectRequest(
        "admin",
        "DELETE",
        `/${getProjectId(deleteTarget)}`
      );
      setDeleteTarget(null);
      showSuccess(data?.message || "Project deleted.");
      await fetchProjects();
    } catch (error) {
      setDeleteTarget(null);
      showError(error.message || "Unable to delete the project.");
    } finally {
      setDeleting(false);
    }
  };

  /* =======================================================
     UPDATE PROJECT STATUS
  ======================================================= */

  const updateProjectStatus = async (
    projectId,
    newStatus
  ) => {
    if (!projectId) return;

    try {
      setUpdatingStatus(projectId);

      const response =
        await fetch(
          `${PROJECT_API_URL}/update-status/${projectId}`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              ...adminHeaders(),
            },
            body: JSON.stringify({
              status: newStatus,
            }),
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.message ||
            data?.error ||
            "Failed to update project status."
        );
      }

      setProjects((prev) =>
        prev.map((project) =>
          getProjectId(project) ===
          projectId
            ? {
                ...project,
                status: newStatus,
              }
            : project
        )
      );

      if (
        selectedProject &&
        getProjectId(selectedProject) ===
          projectId
      ) {
        setSelectedProject(
          (prev) => ({
            ...prev,
            status: newStatus,
          })
        );
      }

      showSuccess(
        `Project status changed to ${newStatus}.`
      );
    } catch (error) {
      console.error(
        "UPDATE STATUS ERROR:",
        error
      );

      showError(
        error.message ||
          "Unable to update project status."
      );
    } finally {
      setUpdatingStatus("");
    }
  };

  /* =======================================================
     FILTER RESET
  ======================================================= */

  const resetFilters = () => {
    setSearchTerm("");
    setStatusFilter("All");
    setAssignmentFilter("All");
    setUserFilter("All");
    setDueDateFilter("All");
    setCreatedDateFilter("All");
    setSortBy("newest");
  };

  /* =======================================================
     ACTIVE FILTER COUNT
  ======================================================= */

  const activeFilterCount = useMemo(() => {
    let count = 0;

    if (searchTerm.trim()) count++;
    if (statusFilter !== "All") count++;
    if (assignmentFilter !== "All") count++;
    if (userFilter !== "All") count++;
    if (dueDateFilter !== "All") count++;
    if (createdDateFilter !== "All") count++;

    return count;
  }, [
    searchTerm,
    statusFilter,
    assignmentFilter,
    userFilter,
    dueDateFilter,
    createdDateFilter,
  ]);

  /* =======================================================
     FILTER + SORT PROJECTS
  ======================================================= */

  const projectsOfType = useMemo(
    () => projects.filter((project) => typeOf(project) === typeTab),
    [projects, typeTab]
  );

  const filteredProjects = useMemo(() => {
    const search =
      searchTerm
        .trim()
        .toLowerCase();

    const result =
      projectsOfType.filter(
        (project) => {
          const title =
            getProjectName(
              project
            ).toLowerCase();

          const description =
            getProjectDescription(
              project
            ).toLowerCase();

          const assignedUser =
            getAssignedUserName(
              project
            ).toLowerCase();

          const projectId =
            String(
              getProjectId(
                project
              )
            ).toLowerCase();

          const matchesSearch =
            !search ||
            title.includes(search) ||
            description.includes(search) ||
            assignedUser.includes(search) ||
            projectId.includes(search);

          const matchesStatus =
            statusFilter === "All" ||
            getProjectStatus(
              project
            ) === statusFilter;

          let matchesAssignment =
            true;

          if (
            assignmentFilter ===
            "Pool"
          ) {
            matchesAssignment =
              project?.assignmentType ===
                "Pool" ||
              !project?.assignedTo;
          }

          if (
            assignmentFilter ===
            "Assigned"
          ) {
            matchesAssignment =
              !!project?.assignedTo ||
              project?.assignmentType ===
                "Admin";
          }

          const matchesUser =
            userFilter === "All" ||
            String(
              getAssignedUserId(
                project
              )
            ) === String(userFilter);

          let matchesDueDate =
            true;

          switch (dueDateFilter) {
            case "Today":
              matchesDueDate =
                isDueToday(project);
              break;

            case "Tomorrow":
              matchesDueDate =
                isDueTomorrow(project);
              break;

            case "This Week":
              matchesDueDate =
                isDueThisWeek(project);
              break;

            case "Next 7 Days":
              matchesDueDate =
                isDueWithinNext7Days(
                  project
                );
              break;

            case "Overdue":
              matchesDueDate =
                isOverdue(project);
              break;

            case "No Due Date":
              matchesDueDate =
                !project?.dueDate;
              break;

            default:
              matchesDueDate = true;
          }

          let matchesCreatedDate =
            true;

          switch (
            createdDateFilter
          ) {
            case "Today":
              matchesCreatedDate =
                isCreatedToday(project);
              break;

            case "Last 7 Days":
              matchesCreatedDate =
                isCreatedWithinDays(
                  project,
                  7
                );
              break;

            case "Last 30 Days":
              matchesCreatedDate =
                isCreatedWithinDays(
                  project,
                  30
                );
              break;

            default:
              matchesCreatedDate =
                true;
          }

          return (
            matchesSearch &&
            matchesStatus &&
            matchesAssignment &&
            matchesUser &&
            matchesDueDate &&
            matchesCreatedDate
          );
        }
      );

    return [...result].sort(
      (a, b) => {
        switch (sortBy) {
          case "oldest":
            return (
              new Date(
                a.createdAt || 0
              ) -
              new Date(
                b.createdAt || 0
              )
            );

          case "dueSoon":
            if (!a.dueDate) return 1;
            if (!b.dueDate) return -1;

            return (
              new Date(a.dueDate) -
              new Date(b.dueDate)
            );

          case "dueLatest":
            if (!a.dueDate) return 1;
            if (!b.dueDate) return -1;

            return (
              new Date(b.dueDate) -
              new Date(a.dueDate)
            );

          case "title":
            return getProjectName(
              a
            ).localeCompare(
              getProjectName(b)
            );

          case "status":
            return getProjectStatus(
              a
            ).localeCompare(
              getProjectStatus(b)
            );

          case "newest":
          default:
            return (
              new Date(
                b.createdAt || 0
              ) -
              new Date(
                a.createdAt || 0
              )
            );
        }
      }
    );
  }, [
    projectsOfType,
    searchTerm,
    statusFilter,
    assignmentFilter,
    userFilter,
    dueDateFilter,
    createdDateFilter,
    sortBy,
  ]);

  /* =======================================================
     STATISTICS
  ======================================================= */

  const stats = useMemo(() => {
    const total =
      projectsOfType.length;

    const pending =
      projectsOfType.filter(
        (project) =>
          getProjectStatus(
            project
          ) === "Pending"
      ).length;

    const inProgress =
      projectsOfType.filter(
        (project) =>
          getProjectStatus(
            project
          ) === "In Progress"
      ).length;

    const completed =
      projectsOfType.filter(
        (project) =>
          getProjectStatus(
            project
          ) === "Completed"
      ).length;

    const pool =
      projectsOfType.filter(
        (project) =>
          project?.assignmentType ===
            "Pool" ||
          !project?.assignedTo
      ).length;

    const assigned =
      projectsOfType.filter(
        (project) =>
          !!project?.assignedTo ||
          project?.assignmentType ===
            "Admin"
      ).length;

    const overdue =
      projectsOfType.filter(
        (project) =>
          isOverdue(project)
      ).length;

    const dueToday =
      projectsOfType.filter(
        (project) =>
          isDueToday(project)
      ).length;

    const dueSoon =
      projectsOfType.filter(
        (project) =>
          isDueSoon(project)
      ).length;

    const completionRate =
      total > 0
        ? Math.round(
            (completed / total) *
              100
          )
        : 0;

    return {
      total,
      pending,
      inProgress,
      completed,
      pool,
      assigned,
      overdue,
      dueToday,
      dueSoon,
      completionRate,
    };
  }, [projectsOfType]);

  /* =======================================================
     OPEN DETAILS
  ======================================================= */

  const openDetails = (
    project
  ) => {
    setSelectedProject(
      project
    );

    setShowDetailsModal(true);
  };

  /* =======================================================
     CLOSE DETAILS
  ======================================================= */

  const closeDetails = () => {
    setSelectedProject(null);
    setShowDetailsModal(false);
  };

  /* =======================================================
     COPY TO CLIPBOARD
  ======================================================= */

  const copyToClipboard = async (
    value,
    label
  ) => {
    try {
      await navigator.clipboard.writeText(
        value
      );

      setCopiedValue(value);

      showSuccess(
        `${label} copied to clipboard.`
      );

      setTimeout(() => {
        setCopiedValue("");
      }, 2000);
    } catch (error) {
      console.error(
        "COPY ERROR:",
        error
      );

      showError(
        "Unable to copy."
      );
    }
  };

  /* =======================================================
     REFRESH
  ======================================================= */

  const handleRefresh = async () => {
    await Promise.all([
      fetchProjects(),
      fetchUsers(),
    ]);

    showSuccess(
      "Project data refreshed."
    );
  };

  /* =======================================================
     PROJECT STATUS QUICK ACTION
  ======================================================= */

  const handleQuickStatusChange = (
    project,
    event
  ) => {
    const newStatus =
      event.target.value;

    updateProjectStatus(
      getProjectId(project),
      newStatus
    );
  };

  /* =======================================================
     RENDER STATUS DROPDOWN
  ======================================================= */

  const renderStatusDropdown = (
    project
  ) => {
    const projectId =
      getProjectId(project);

    return (
      <div className="relative">
        <select
          value={getProjectStatus(
            project
          )}
          onChange={(event) =>
            handleQuickStatusChange(
              project,
              event
            )
          }
          disabled={
            updatingStatus ===
            projectId
          }
          className="appearance-none pl-3 pr-8 py-2 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        >
          <option value="Pending">
            Pending
          </option>

          <option value="In Progress">
            In Progress
          </option>

          <option value="Submitted">
            Submitted (awaiting review)
          </option>

          <option value="Completed">
            Completed
          </option>
        </select>

        <ChevronDown
          size={13}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
        />
      </div>
    );
  };

  const renderSubmissionLink = (project, className = "") => {
    if (!project?.submissionLink) return null;
    return (
      <a
        href={project.submissionLink}
        target="_blank"
        rel="noreferrer"
        title="Open the staff member's submitted link to check their work"
        className={`inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100 ${className}`}
      >
        <ExternalLink size={12} /> Open submission
      </a>
    );
  };

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6 lg:p-8">

      {/* ===================================================
          HEADER
      =================================================== */}

      <div className="mb-6">

        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-5">

          <div className="flex items-center gap-3">

            <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-200">
              <FolderKanban
                className="text-white"
                size={25}
              />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl md:text-3xl font-black text-slate-800">
                  Project Management
                </h1>

                <span className="hidden md:inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-50 text-blue-600 text-[10px] font-black">
                  <Sparkles size={11} />
                  Enhanced
                </span>
              </div>

              <p className="text-sm text-slate-500 mt-1">
                Create, assign, monitor and
                manage all projects
              </p>
            </div>

          </div>

          <div className="flex flex-wrap items-center gap-3">

            <button
              type="button"
              onClick={handleRefresh}
              disabled={
                loadingProjects ||
                loadingUsers
              }
              className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-100 transition disabled:opacity-50"
            >
              <RefreshCw
                size={17}
                className={
                  loadingProjects
                    ? "animate-spin"
                    : ""
                }
              />

              Refresh
            </button>

            
            <button
              type="button"
              onClick={() => openCreateModal("Internal")}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-blue-600 text-white font-black text-sm hover:bg-blue-700 shadow-lg shadow-blue-200 transition"
            >
              <Plus size={18} />

              Internal Projects
            </button>

            <button
              type="button"
              onClick={() => openCreateModal("External")}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-violet-600 text-white font-black text-sm hover:bg-violet-700 shadow-lg shadow-violet-200 transition"
            >
              <Plus size={18} />

              External Projects
            </button>

          </div>

        </div>

      </div>

      {/* ===================================================
          ALERTS
      =================================================== */}

      {successMessage && (
        <div className="fixed top-4 right-4 z-[120] w-[calc(100%-2rem)] max-w-md shadow-xl flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-700">

          <CheckCircle2 size={18} />

          <span className="font-semibold text-sm">
            {successMessage}
          </span>

          <button
            type="button"
            aria-label="Close message"
            onClick={() => setSuccessMessage("")}
            className="ml-auto"
          >
            <X size={17} />
          </button>

        </div>
      )}

      {errorMessage && (
        <div className="fixed top-4 right-4 z-[120] w-[calc(100%-2rem)] max-w-md shadow-xl flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">

          <AlertCircle size={18} />

          <span className="font-semibold text-sm">
            {errorMessage}
          </span>

          <button
            type="button"
            aria-label="Close message"
            onClick={() => setErrorMessage("")}
            className="ml-auto"
          >
            <X size={17} />
          </button>

        </div>
      )}

      {/* ===================================================
          MAIN STATISTICS
      =================================================== */}

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4 mb-5">

        {/* Total */}

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <ClipboardList
                size={19}
                className="text-blue-600"
              />
            </div>

            <span className="text-2xl font-black text-slate-800">
              {stats.total}
            </span>
          </div>

          <p className="text-xs font-bold text-slate-500 mt-3">
            Total Projects
          </p>
        </div>

        {/* Pending */}

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
              <Clock3
                size={19}
                className="text-amber-600"
              />
            </div>

            <span className="text-2xl font-black text-slate-800">
              {stats.pending}
            </span>
          </div>

          <p className="text-xs font-bold text-slate-500 mt-3">
            Pending
          </p>
        </div>

        {/* Progress */}

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <PlayCircle
                size={19}
                className="text-blue-600"
              />
            </div>

            <span className="text-2xl font-black text-slate-800">
              {stats.inProgress}
            </span>
          </div>

          <p className="text-xs font-bold text-slate-500 mt-3">
            In Progress
          </p>
        </div>

        {/* Completed */}

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
              <CheckCircle2
                size={19}
                className="text-emerald-600"
              />
            </div>

            <span className="text-2xl font-black text-slate-800">
              {stats.completed}
            </span>
          </div>

          <p className="text-xs font-bold text-slate-500 mt-3">
            Completed
          </p>
        </div>

        {/* Overdue */}

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
              <AlertCircle
                size={19}
                className="text-red-600"
              />
            </div>

            <span className="text-2xl font-black text-slate-800">
              {stats.overdue}
            </span>
          </div>

          <p className="text-xs font-bold text-slate-500 mt-3">
            Overdue
          </p>
        </div>

        {/* Completion */}

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
              <TrendingUp
                size={19}
                className="text-indigo-600"
              />
            </div>

            <span className="text-2xl font-black text-slate-800">
              {stats.completionRate}%
            </span>
          </div>

          <p className="text-xs font-bold text-slate-500 mt-3">
            Completion Rate
          </p>
        </div>

      </div>

      {/* ===================================================
          SECONDARY STATS
      =================================================== */}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">

        <button
          type="button"
          onClick={() => {
            setDueDateFilter("Today");
            setStatusFilter("All");
          }}
          className="text-left bg-white border border-slate-200 rounded-2xl p-4 hover:border-blue-300 hover:shadow-md transition"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
              <CalendarCheck
                size={19}
                className="text-orange-600"
              />
            </div>

            <div>
              <p className="text-xl font-black text-slate-800">
                {stats.dueToday}
              </p>

              <p className="text-xs font-bold text-slate-500">
                Due Today
              </p>
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() =>
            setDueDateFilter("Next 7 Days")
          }
          className="text-left bg-white border border-slate-200 rounded-2xl p-4 hover:border-blue-300 hover:shadow-md transition"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <CalendarClock
                size={19}
                className="text-blue-600"
              />
            </div>

            <div>
              <p className="text-xl font-black text-slate-800">
                {stats.dueSoon}
              </p>

              <p className="text-xs font-bold text-slate-500">
                Due Soon
              </p>
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() =>
            setAssignmentFilter("Pool")
          }
          className="text-left bg-white border border-slate-200 rounded-2xl p-4 hover:border-blue-300 hover:shadow-md transition"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
              <PackageOpen
                size={19}
                className="text-purple-600"
              />
            </div>

            <div>
              <p className="text-xl font-black text-slate-800">
                {stats.pool}
              </p>

              <p className="text-xs font-bold text-slate-500">
                Project Pool
              </p>
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() =>
            setAssignmentFilter("Assigned")
          }
          className="text-left bg-white border border-slate-200 rounded-2xl p-4 hover:border-blue-300 hover:shadow-md transition"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
              <UserCheck
                size={19}
                className="text-indigo-600"
              />
            </div>

            <div>
              <p className="text-xl font-black text-slate-800">
                {stats.assigned}
              </p>

              <p className="text-xs font-bold text-slate-500">
                Assigned
              </p>
            </div>
          </div>
        </button>

      </div>

      {/* ===================================================
          INTERNAL / EXTERNAL HEADINGS
      =================================================== */}

      <div
        className="mb-5 flex flex-wrap items-center gap-3"
        role="tablist"
        aria-label="Project type"
      >
        {["Internal", "External"].map((t) => {
          const active = typeTab === t;
          const count = projects.filter((p) => typeOf(p) === t).length;
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTypeTab(t)}
              className={`inline-flex items-center gap-2 rounded-2xl border px-5 py-3 text-sm font-black transition ${
                active
                  ? t === "Internal"
                    ? "border-blue-600 bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                    : "border-violet-600 bg-violet-600 text-white shadow-lg shadow-violet-600/20"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              }`}
            >
              {t} Projects
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  active ? "bg-white/25 text-white" : "bg-slate-100 text-slate-500"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ===================================================
          SEARCH + FILTER TOOLBAR
      =================================================== */}

      <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-6 shadow-sm">

        <div className="flex flex-col xl:flex-row gap-3">

          {/* Search */}

          <div className="relative flex-1">

            <Search
              size={18}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
            />

            <input
              type="text"
              value={searchTerm}
              onChange={(e) =>
                setSearchTerm(
                  e.target.value
                )
              }
              placeholder="Search project, description, user or ID..."
              className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
            />

          </div>

          {/* Status */}

          <div className="relative">

            <CircleDot
              size={17}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />

            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(
                  e.target.value
                )
              }
              className="appearance-none pl-10 pr-10 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="All">
                All Status
              </option>

              <option value="Pending">
                Pending
              </option>

              <option value="In Progress">
                In Progress
              </option>

              <option value="Completed">
                Completed
              </option>
            </select>

            <ChevronDown
              size={15}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />

          </div>

          {/* Filter button */}

          <button
            type="button"
            onClick={() =>
              setShowFilters(
                (prev) => !prev
              )
            }
            className={`inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border font-bold text-sm transition ${
              showFilters ||
              activeFilterCount > 0
                ? "border-blue-300 bg-blue-50 text-blue-700"
                : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
            }`}
          >
            <SlidersHorizontal
              size={17}
            />

            More Filters

            {activeFilterCount >
              0 && (
              <span className="min-w-5 h-5 px-1 rounded-full bg-blue-600 text-white text-[10px] flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* Sort */}

          <div className="relative">

            <ArrowUpDown
              size={17}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />

            <select
              value={sortBy}
              onChange={(e) =>
                setSortBy(
                  e.target.value
                )
              }
              className="appearance-none pl-10 pr-10 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="newest">
                Newest First
              </option>

              <option value="oldest">
                Oldest First
              </option>

              <option value="dueSoon">
                Due Date: Soonest
              </option>

              <option value="dueLatest">
                Due Date: Latest
              </option>

              <option value="title">
                Project Name
              </option>

              <option value="status">
                Status
              </option>
            </select>

            <ChevronDown
              size={15}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />

          </div>

        </div>

        {/* =================================================
            ADVANCED FILTERS
        ================================================= */}

        {showFilters && (
          <div className="mt-4 pt-4 border-t border-slate-200">

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">

              {/* Assignment */}

              <div>
                <label className="block text-xs font-black text-slate-500 mb-2">
                  Assignment
                </label>

                <select
                  value={assignmentFilter}
                  onChange={(e) =>
                    setAssignmentFilter(
                      e.target.value
                    )
                  }
                  className="w-full px-3 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="All">
                    All Assignments
                  </option>

                  <option value="Assigned">
                    Assigned
                  </option>

                  <option value="Pool">
                    Project Pool
                  </option>
                </select>
              </div>

              {/* User */}

              <div>
                <label className="block text-xs font-black text-slate-500 mb-2">
                  Assigned User
                </label>

                <select
                  value={userFilter}
                  onChange={(e) =>
                    setUserFilter(
                      e.target.value
                    )
                  }
                  className="w-full px-3 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="All">
                    All Users
                  </option>

                  {users.map(
                    (user) => (
                      <option
                        key={
                          user._id ||
                          user.id
                        }
                        value={
                          user._id ||
                          user.id
                        }
                      >
                        {user.name ||
                          user.username ||
                          user.email ||
                          "Unnamed User"}
                      </option>
                    )
                  )}
                </select>
              </div>

              {/* Due Date */}

              <div>
                <label className="block text-xs font-black text-slate-500 mb-2">
                  Due Date
                </label>

                <select
                  value={dueDateFilter}
                  onChange={(e) =>
                    setDueDateFilter(
                      e.target.value
                    )
                  }
                  className="w-full px-3 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="All">
                    All Due Dates
                  </option>

                  <option value="Today">
                    Due Today
                  </option>

                  <option value="Tomorrow">
                    Due Tomorrow
                  </option>

                  <option value="This Week">
                    Due This Week
                  </option>

                  <option value="Next 7 Days">
                    Next 7 Days
                  </option>

                  <option value="Overdue">
                    Overdue
                  </option>

                  <option value="No Due Date">
                    No Due Date
                  </option>
                </select>
              </div>

              {/* Created */}

              <div>
                <label className="block text-xs font-black text-slate-500 mb-2">
                  Created Date
                </label>

                <select
                  value={
                    createdDateFilter
                  }
                  onChange={(e) =>
                    setCreatedDateFilter(
                      e.target.value
                    )
                  }
                  className="w-full px-3 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="All">
                    Any Created Date
                  </option>

                  <option value="Today">
                    Created Today
                  </option>

                  <option value="Last 7 Days">
                    Last 7 Days
                  </option>

                  <option value="Last 30 Days">
                    Last 30 Days
                  </option>
                </select>
              </div>

            </div>

            {/* Reset */}

            {activeFilterCount >
              0 && (
              <div className="mt-4 flex justify-end">

                <button
                  type="button"
                  onClick={
                    resetFilters
                  }
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50"
                >
                  <RotateCcw
                    size={15}
                  />

                  Reset Filters
                </button>

              </div>
            )}

          </div>
        )}

        {/* Result summary */}

        <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs font-semibold text-slate-500">

          <span>
            Showing{" "}
            <strong className="text-slate-800">
              {
                filteredProjects.length
              }
            </strong>{" "}
            of{" "}
            <strong className="text-slate-800">
              {projectsOfType.length}
            </strong>{" "}
            projects
          </span>

          {activeFilterCount >
            0 && (
            <span className="inline-flex items-center gap-1.5 text-blue-600">
              <Filter
                size={13}
              />

              {activeFilterCount} active filter
              {activeFilterCount >
              1
                ? "s"
                : ""}
            </span>
          )}

        </div>

      </div>

      {/* ===================================================
          PROJECTS
      =================================================== */}

      {loadingProjects ? (
        <div className="flex flex-col items-center justify-center py-24">

          <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center">
            <RefreshCw
              size={32}
              className="animate-spin text-blue-600"
            />
          </div>

          <p className="mt-4 text-sm font-bold text-slate-500">
            Loading projects...
          </p>

        </div>
      ) : filteredProjects.length ===
        0 ? (

        <div className="bg-white border border-slate-200 rounded-2xl py-20 text-center">

          <div className="mx-auto w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center">
            <FolderKanban
              size={30}
              className="text-slate-400"
            />
          </div>

          <h3 className="mt-5 text-lg font-black text-slate-700">
            No projects found
          </h3>

          <p className="mt-2 text-sm text-slate-500 max-w-md mx-auto px-4">
            No projects match your current search
            and filter settings.
          </p>

          <div className="mt-5 flex justify-center gap-3">

            {activeFilterCount >
              0 && (
              <button
                type="button"
                onClick={
                  resetFilters
                }
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-50"
              >
                <RotateCcw
                  size={17}
                />

                Reset Filters
              </button>
            )}

            <button
              type="button"
              onClick={() => openCreateModal(typeTab)}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700"
            >
              <Plus size={17} />

              Create Project
            </button>

          </div>

        </div>
      ) : (

        /* =================================================
           LIST VIEW
        ================================================= */

        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">

          <div className="overflow-x-auto">

            <table className="w-full min-w-[1050px]">

              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">

                  <th className="text-left px-5 py-4 text-[10px] uppercase tracking-wider font-black text-slate-400">
                    Project
                  </th>

                  <th className="text-left px-5 py-4 text-[10px] uppercase tracking-wider font-black text-slate-400">
                    Assigned To
                  </th>

                  <th className="text-left px-5 py-4 text-[10px] uppercase tracking-wider font-black text-slate-400">
                    Status
                  </th>

                  <th className="text-left px-5 py-4 text-[10px] uppercase tracking-wider font-black text-slate-400">
                    Due Date
                  </th>

                  <th className="text-left px-5 py-4 text-[10px] uppercase tracking-wider font-black text-slate-400">
                    Progress
                  </th>

                  <th className="text-right px-5 py-4 text-[10px] uppercase tracking-wider font-black text-slate-400">
                    Action
                  </th>

                </tr>
              </thead>

              <tbody>

                {filteredProjects.map(
                  (project) => {
                    const image =
                      getProjectImage(
                        project
                      );

                    const overdue =
                      isOverdue(
                        project
                      );

                    const dueSoon =
                      isDueSoon(
                        project
                      );

                    const progress =
                      getProgress(
                        project
                      );

                    const projectId =
                      getProjectId(
                        project
                      );

                    return (
                      <tr
                        key={
                          projectId
                        }
                        className="border-b border-slate-100 hover:bg-slate-50 transition"
                      >

                        {/* Project */}

                        <td className="px-5 py-4">

                          <div className="flex items-center gap-3">

                            <div className="w-14 h-14 rounded-xl overflow-hidden bg-slate-100 shrink-0">

                              {image ? (
                                <img
                                  src={
                                    image
                                  }
                                  alt={getProjectName(
                                    project
                                  )}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-slate-400">
                                  <ImageIcon
                                    size={
                                      22
                                    }
                                  />
                                </div>
                              )}

                            </div>

                            <div className="min-w-0">

                              <p className="font-black text-sm text-slate-800 truncate max-w-[250px]">
                                {getProjectName(
                                  project
                                )}
                              </p>
                              <span
                                className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black ${TYPE_STYLE[typeOf(project)]}`}
                              >
                                {typeOf(project)}
                              </span>

                              <p className="text-xs text-slate-400 mt-1 truncate max-w-[250px]">
                                {getProjectDescription(
                                  project
                                )}
                              </p>

                              <p className="text-[10px] text-slate-400 mt-1">
                                #{String(
                                  projectId
                                ).slice(-8)}
                              </p>

                            </div>

                          </div>

                        </td>

                        {/* User */}

                        <td className="px-5 py-4">

                          <div className="flex items-center gap-2">

                            {project?.assignedTo ? (
                              <UserRound
                                size={16}
                                className="text-blue-600"
                              />
                            ) : (
                              <Layers
                                size={16}
                                className="text-purple-600"
                              />
                            )}

                            <span className="text-sm font-bold text-slate-700">
                              {getAssignedUserName(
                                project
                              )}
                            </span>

                          </div>

                        </td>

                        {/* Status */}

                        <td className="px-5 py-4">
                          {renderStatusDropdown(
                            project
                          )}
                          {renderSubmissionLink(project, "mt-2")}
                        </td>

                        {/* Due */}

                        <td className="px-5 py-4">

                          <div
                            className={`flex items-center gap-2 text-xs font-bold ${
                              overdue
                                ? "text-red-600"
                                : dueSoon
                                ? "text-orange-600"
                                : "text-slate-600"
                            }`}
                          >

                            {overdue ? (
                              <AlertCircle
                                size={15}
                              />
                            ) : (
                              <CalendarDays
                                size={15}
                              />
                            )}

                            {formatDate(
                              project?.dueDate
                            )}

                          </div>

                        </td>

                        {/* Progress */}

                        <td className="px-5 py-4">

                          <div className="w-32">

                            <div className="flex items-center justify-between mb-1">

                              <span className="text-[10px] font-black text-slate-400">
                                Progress
                              </span>

                              <span className="text-xs font-black text-slate-600">
                                {progress}%
                              </span>

                            </div>

                            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">

                              <div
                                className={`h-full rounded-full ${getProgressClasses(
                                  project
                                )}`}
                                style={{
                                  width: `${progress}%`,
                                }}
                              />

                            </div>

                          </div>

                        </td>

                        {/* Action */}

                        <td className="px-5 py-4 text-right">
                          <div className="inline-flex items-center gap-2">

                          <button
                            type="button"
                            onClick={() =>
                              openDetails(
                                project
                              )
                            }
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50"
                          >
                            <Eye
                              size={15}
                            />

                            View
                          </button>
                            <button
                              type="button"
                              onClick={() => openEditModal(project)}
                              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
                              aria-label={`Edit ${getProjectName(project)}`}
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              type="button"
                              onClick={() => askDelete(project)}
                              className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-3 py-2.5 text-sm font-bold text-red-600 hover:bg-red-50"
                              aria-label={`Delete ${getProjectName(project)}`}
                            >
                              <Trash2 size={15} />
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

        </div>
      )}

      {/* ===================================================
          CREATE / EDIT PROJECT
          (fields: title, error/change, description, images,
           assign to, validity time + a summary preview)
      =================================================== */}

      {formModal && (
        <ProjectFormModal
          key={
            formModal.project
              ? getProjectId(formModal.project)
              : `new-${formModal.type}`
          }
          mode={formModal.mode}
          project={formModal.project || null}
          defaultType={formModal.type || "Internal"}
          users={users}
          onClose={() => setFormModal(null)}
          onSaved={handleProjectSaved}
        />
      )}

      {/* ===================================================
          DELETE CONFIRMATION
      =================================================== */}

      {deleteTarget && (
        <div
          className="fixed inset-0 z-[115] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
          role="alertdialog"
          aria-modal="true"
          aria-label="Delete project"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !deleting) setDeleteTarget(null);
          }}
        >
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
              <Trash2 size={22} />
            </div>
            <h3 className="text-lg font-black text-slate-900">
              Delete this project?
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              <strong>{getProjectName(deleteTarget)}</strong> will be removed
              for everyone, together with its images. This cannot be undone.
            </p>
            {deleteTarget.assignedTo && getProjectStatus(deleteTarget) !== "Completed" && (
              <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                It is currently assigned to {getAssignedUserName(deleteTarget)}.
                They will be told it was removed.
              </p>
            )}
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {deleting ? (
                  <RefreshCw size={16} className="animate-spin" />
                ) : (
                  <Trash2 size={16} />
                )}
                {deleting ? "Deleting..." : "Delete project"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================
          PROJECT DETAILS MODAL
      =================================================== */}

      {showDetailsModal &&
        selectedProject && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">

            <div
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={
                closeDetails
              }
            />

            <div className="relative w-full max-w-4xl max-h-[92vh] overflow-y-auto bg-white rounded-3xl shadow-2xl">

              {/* Header */}

              <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-5 flex items-center justify-between">

                <div>

                  <h2 className="text-xl font-black text-slate-800">
                    Project Details
                  </h2>

                  <p className="text-xs text-slate-500 mt-1">
                    Complete project information
                  </p>

                </div>

                <div className="ml-auto mr-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openEditModal(selectedProject)}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
                  >
                    <Pencil size={15} /> Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => askDelete(selectedProject)}
                    className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-bold text-red-600 hover:bg-red-50"
                  >
                    <Trash2 size={15} /> Delete
                  </button>
                </div>
                <button
                  type="button"
                  onClick={
                    closeDetails
                  }
                  className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200"
                >
                  <X size={20} />
                </button>

              </div>

              <div className="p-6">

                {/* Image */}

                <div className="relative h-64 md:h-96 rounded-2xl overflow-hidden bg-slate-100 mb-6">

                  {getProjectImage(
                    selectedProject
                  ) ? (
                    <img
                      src={getProjectImage(
                        selectedProject
                      )}
                      alt={getProjectName(
                        selectedProject
                      )}
                      className="w-full h-full object-cover"
                      onError={(
                        e
                      ) => {
                        e.currentTarget.style.display =
                          "none";
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
                      <ImageIcon
                        size={48}
                      />

                      <p className="mt-3 text-sm font-semibold">
                        No project image
                      </p>
                    </div>
                  )}

                  {getProjectImage(
                    selectedProject
                  ) && (
                    <a
                      href={getProjectImage(
                        selectedProject
                      )}
                      target="_blank"
                      rel="noreferrer"
                      className="absolute bottom-4 right-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-black/70 text-white text-xs font-bold hover:bg-black/80"
                    >
                      <ExternalLink
                        size={15}
                      />

                      Open Image
                    </a>
                  )}

                </div>

                {projectImages(selectedProject).length > 1 && (
                  <div className="-mt-3 mb-6 flex gap-2 overflow-x-auto pb-1">
                    {projectImages(selectedProject).map((img, i) => (
                      <a
                        key={img}
                        href={imageUrl(img)}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Open image ${i + 1}`}
                        className="h-16 w-20 shrink-0 overflow-hidden rounded-lg border border-slate-200 hover:border-blue-400"
                      >
                        <img src={imageUrl(img)} alt="" className="h-full w-full object-cover" />
                      </a>
                    ))}
                  </div>
                )}
                {/* Title */}

                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">

                  <div className="min-w-0">

                    <h2 className="text-2xl font-black text-slate-800 break-words">
                      {getProjectName(
                        selectedProject
                      )}
                    </h2>

                    <div className="flex flex-wrap items-center gap-2 mt-2">

                      <p className="text-xs text-slate-400">
                        Project ID:{" "}
                        {getProjectId(
                          selectedProject
                        )}
                      </p>

                      <button
                        type="button"
                        onClick={() =>
                          copyToClipboard(
                            String(
                              getProjectId(
                                selectedProject
                              )
                            ),
                            "Project ID"
                          )
                        }
                        className="inline-flex items-center gap-1 text-xs text-blue-600 font-bold hover:text-blue-700"
                      >
                        {copiedValue ===
                        String(
                          getProjectId(
                            selectedProject
                          )
                        ) ? (
                          <Check
                            size={13}
                          />
                        ) : (
                          <Copy
                            size={13}
                          />
                        )}

                        Copy
                      </button>

                    </div>

                  </div>

                  <div className="flex flex-wrap items-center gap-2">

                    <span
                      className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border text-xs font-black ${getStatusClasses(
                        getProjectStatus(
                          selectedProject
                        )
                      )}`}
                    >
                      {getStatusIcon(
                        getProjectStatus(
                          selectedProject
                        )
                      )}

                      {getProjectStatus(
                        selectedProject
                      )}
                    </span>

                    {isOverdue(
                      selectedProject
                    ) && (
                      <span className="inline-flex items-center gap-1 px-3 py-2 rounded-full bg-red-100 text-red-700 text-xs font-black">
                        <AlertCircle
                          size={14}
                        />

                        Overdue
                      </span>
                    )}

                  </div>

                </div>

                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${TYPE_STYLE[typeOf(selectedProject)]}`}
                  >
                    {typeOf(selectedProject)} project
                  </span>
                  {selectedProject?.status === "Completed" && (
                    <span
                      className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${
                        selectedProject.completedOnTime === false
                          ? "border-amber-200 bg-amber-50 text-amber-700"
                          : "border-emerald-200 bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {selectedProject.completedOnTime === false ? "Completed late" : "Completed on time"} ·{" "}
                      {fmtMinutes(selectedProject.completionMinutes)}
                    </span>
                  )}
                </div>
                {selectedProject?.issueDetails && (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <p className="mb-1 flex items-center gap-2 text-xs font-black uppercase tracking-wide text-amber-700">
                      <AlertCircle size={14} /> Error / change required
                    </p>
                    <p className="whitespace-pre-wrap text-sm font-semibold text-amber-900">
                      {selectedProject.issueDetails}
                    </p>
                  </div>
                )}
                {/* Description */}

                <div className="mt-6">

                  <h3 className="text-sm font-black text-slate-700 mb-2">
                    Description
                  </h3>

                  <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">

                    <p className="text-sm leading-6 text-slate-600 whitespace-pre-wrap">
                      {getProjectDescription(
                        selectedProject
                      )}
                    </p>

                  </div>

                </div>

                {/* Progress */}

                <div className="mt-5 rounded-2xl border border-slate-200 p-5">

                  <div className="flex items-center justify-between mb-3">

                    <div className="flex items-center gap-2">

                      <BarChart3
                        size={18}
                        className="text-blue-600"
                      />

                      <h3 className="text-sm font-black text-slate-700">
                        Project Progress
                      </h3>

                    </div>

                    <span className="text-lg font-black text-slate-800">
                      {getProgress(
                        selectedProject
                      )}
                      %
                    </span>

                  </div>

                  <div className="h-3 rounded-full bg-slate-100 overflow-hidden">

                    <div
                      className={`h-full rounded-full transition-all ${getProgressClasses(
                        selectedProject
                      )}`}
                      style={{
                        width: `${getProgress(
                          selectedProject
                        )}%`,
                      }}
                    />

                  </div>

                </div>

                {/* Information grid */}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">

                  {/* Assigned */}

                  <div className="rounded-2xl border border-slate-200 p-4">

                    <div className="flex items-center gap-3">

                      <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                        <UserRound
                          size={18}
                          className="text-blue-600"
                        />
                      </div>

                      <div>

                        <p className="text-[10px] uppercase tracking-wide font-black text-slate-400">
                          Assigned To
                        </p>

                        <p className="text-sm font-bold text-slate-700">
                          {getAssignedUserName(
                            selectedProject
                          )}
                        </p>

                      </div>

                    </div>

                  </div>

                  {/* Assignment type */}

                  <div className="rounded-2xl border border-slate-200 p-4">

                    <div className="flex items-center gap-3">

                      <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
                        <Layers
                          size={18}
                          className="text-purple-600"
                        />
                      </div>

                      <div>

                        <p className="text-[10px] uppercase tracking-wide font-black text-slate-400">
                          Assignment Type
                        </p>

                        <p className="text-sm font-bold text-slate-700">
                          {selectedProject?.assignmentType ||
                            "Pool"}
                        </p>

                      </div>

                    </div>

                  </div>

                  {/* Due */}

                  <div className="rounded-2xl border border-slate-200 p-4">

                    <div className="flex items-center gap-3">

                      <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                        <CalendarDays
                          size={18}
                          className="text-amber-600"
                        />
                      </div>

                      <div>

                        <p className="text-[10px] uppercase tracking-wide font-black text-slate-400">
                          Due Date
                        </p>

                        <p
                          className={`text-sm font-bold ${
                            isOverdue(
                              selectedProject
                            )
                              ? "text-red-600"
                              : "text-slate-700"
                          }`}
                        >
                          {formatDate(
                            selectedProject?.dueDate
                          )}
                        </p>

                      </div>

                    </div>

                  </div>

                  {/* Created */}

                  <div className="rounded-2xl border border-slate-200 p-4">

                    <div className="flex items-center gap-3">

                      <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                        <CalendarCheck
                          size={18}
                          className="text-emerald-600"
                        />
                      </div>

                      <div>

                        <p className="text-[10px] uppercase tracking-wide font-black text-slate-400">
                          Created
                        </p>

                        <p className="text-sm font-bold text-slate-700">
                          {formatDate(
                            selectedProject?.createdAt
                          )}
                        </p>

                      </div>

                    </div>

                  </div>

                </div>

                {/* Timestamps */}

                <div className="mt-5 rounded-2xl bg-slate-50 border border-slate-200 p-4">

                  <h3 className="text-sm font-black text-slate-700 mb-3">
                    Project Timeline
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                    <div>
                      <p className="text-[10px] uppercase font-black text-slate-400">
                        Created At
                      </p>

                      <p className="text-xs font-semibold text-slate-600 mt-1">
                        {formatDateTime(
                          selectedProject?.createdAt
                        )}
                      </p>
                    </div>

                    <div>
                      <p className="text-[10px] uppercase font-black text-slate-400">
                        Assigned At
                      </p>

                      <p className="text-xs font-semibold text-slate-600 mt-1">
                        {formatDateTime(
                          selectedProject?.assignedAt
                        )}
                      </p>
                    </div>

                    <div>
                      <p className="text-[10px] uppercase font-black text-slate-400">
                        Completed At
                      </p>

                      <p className="text-xs font-semibold text-slate-600 mt-1">
                        {formatDateTime(
                          selectedProject?.completedAt
                        )}
                      </p>
                    </div>

                  </div>

                </div>

                {/* Image URL */}

                {getProjectImage(
                  selectedProject
                ) && (
                  <div className="mt-5">

                    <div className="flex items-center justify-between gap-3 mb-2">

                      <h3 className="text-sm font-black text-slate-700">
                        Image URL
                      </h3>

                      <button
                        type="button"
                        onClick={() =>
                          copyToClipboard(
                            getProjectImage(
                              selectedProject
                            ),
                            "Image URL"
                          )
                        }
                        className="inline-flex items-center gap-2 text-xs text-blue-600 font-bold hover:text-blue-700"
                      >
                        {copiedValue ===
                        getProjectImage(
                          selectedProject
                        ) ? (
                          <Check
                            size={14}
                          />
                        ) : (
                          <Copy
                            size={14}
                          />
                        )}

                        Copy URL
                      </button>

                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">

                      <p className="text-xs text-slate-500 break-all">
                        {getProjectImage(
                          selectedProject
                        )}
                      </p>

                    </div>

                  </div>
                )}

                {/* Submission for review */}

                {selectedProject?.submissionLink && (
                  <div className="mt-5 rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="flex items-center gap-2 text-sm font-black text-indigo-800">
                          <Send size={15} />
                          {selectedProject.status === "Submitted" ? "Submitted for review" : "Submission"}
                        </h3>
                        <p className="mt-1 text-xs text-indigo-600">
                          {selectedProject.submittedAt ? `Sent in ${formatDateTime(selectedProject.submittedAt)}. ` : ""}
                          Open the link to check the staff member's work before marking it Completed.
                        </p>
                      </div>
                      {renderSubmissionLink(selectedProject)}
                    </div>
                  </div>
                )}

                {/* Status action */}

                <div className="mt-5 rounded-2xl border border-slate-200 p-4">

                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">

                    <div>

                      <h3 className="text-sm font-black text-slate-700">
                        Update Project Status
                      </h3>

                      <p className="text-xs text-slate-400 mt-1">
                        Change the current project
                        progress.
                      </p>

                    </div>

                    {renderStatusDropdown(
                      selectedProject
                    )}

                  </div>

                </div>

                {/* Footer */}

                <div className="mt-6 flex justify-end">

                  <button
                    type="button"
                    onClick={
                      closeDetails
                    }
                    className="px-6 py-3 rounded-xl bg-slate-800 text-white font-bold text-sm hover:bg-slate-900"
                  >
                    Close
                  </button>

                </div>

              </div>

            </div>

          </div>
        )}

    </div>
  );
}