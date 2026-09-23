import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { API_ORIGIN } from "../lib/api";

import {
  Activity,
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  LogIn,
  LogOut,
  RefreshCw,
  Search,
  Timer,
  UserCheck,
  UserX,
  Users,
  X,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Printer,
  CalendarCheck2,
  TrendingUp,
  Coffee,
  Target,
} from "lucide-react";

const ATTENDANCE_API = `${API_ORIGIN}/api/attendance`;

const USER_API = `${API_ORIGIN}/api/UserAccounts`;

const ACTIVE_THRESHOLD = 2 * 60 * 1000;

const DEFAULT_SHIFT_START = "09:30";
const DEFAULT_SHIFT_END = "18:30";

const PAGE_SIZE_OPTIONS = [10, 20, 50];


// ======================================================
// ADMIN ATTENDANCE
// ======================================================

const AdminAttendance = () => {
  const [attendance, setAttendance] = useState([]);
  const [users, setUsers] = useState([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [error, setError] = useState("");

  const [searchTerm, setSearchTerm] = useState("");

  const [selectedDate, setSelectedDate] = useState("");

  const [statusFilter, setStatusFilter] =
    useState("All");

  const [crmFilter, setCrmFilter] =
    useState("All");

  const [autoRefresh, setAutoRefresh] =
    useState(true);

  const [selectedEmployee, setSelectedEmployee] =
    useState(null);

  const [sortConfig, setSortConfig] = useState({
    key: "name",
    direction: "asc",
  });

  const [currentPage, setCurrentPage] = useState(1);

  const [pageSize, setPageSize] =
    useState(10);

  const [lastUpdated, setLastUpdated] =
    useState(null);

  const [refreshCountdown, setRefreshCountdown] =
    useState(30);

  const [showFilters, setShowFilters] =
    useState(false);


  // ====================================================
  // TOKEN
  // ====================================================

  const getAdminToken = () => {
    return localStorage.getItem("adminToken");
  };


  // ====================================================
  // TODAY
  // ====================================================

  const getTodayDate = () => {
    const now = new Date();

    const year = now.getFullYear();

    const month = String(
      now.getMonth() + 1
    ).padStart(2, "0");

    const day = String(
      now.getDate()
    ).padStart(2, "0");

    return `${year}-${month}-${day}`;
  };


  // ====================================================
  // FETCH ATTENDANCE
  // ====================================================

  const fetchAttendance = useCallback(
    async () => {
      const token = getAdminToken();

      if (!token) {
        setError(
          "Admin token not found. Please login again."
        );

        setLoading(false);
        return;
      }

      try {
        const url = selectedDate
          ? `${ATTENDANCE_API}/admin/date/${selectedDate}`
          : `${ATTENDANCE_API}/admin/all`;

        const response = await fetch(url, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type":
              "application/json",
          },
        });

        const text =
          await response.text();

        let data = {};

        try {
          data = text
            ? JSON.parse(text)
            : {};
        } catch {
          data = {};
        }

        if (!response.ok) {
          throw new Error(
            data?.message ||
              data?.error ||
              `Attendance API error: ${response.status}`
          );
        }

        let records = [];

        if (Array.isArray(data)) {
          records = data;
        } else if (
          Array.isArray(
            data.attendance
          )
        ) {
          records = data.attendance;
        } else if (
          Array.isArray(data.records)
        ) {
          records = data.records;
        } else if (
          Array.isArray(data.data)
        ) {
          records = data.data;
        }

        setAttendance(records);
        setError("");
        setLastUpdated(new Date());
        setRefreshCountdown(30);
      } catch (err) {
        console.error(
          "FETCH ATTENDANCE ERROR:",
          err
        );

        setError(
          err.message ||
            "Unable to load attendance."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [selectedDate]
  );


  // ====================================================
  // FETCH USERS
  // ====================================================

  const fetchUsers = useCallback(
    async () => {
      const token = getAdminToken();

      if (!token) {
        return;
      }

      try {
        const response = await fetch(
          `${USER_API}/get-All-Profiles`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type":
                "application/json",
            },
          }
        );

        const text =
          await response.text();

        let data = {};

        try {
          data = text
            ? JSON.parse(text)
            : {};
        } catch {
          data = {};
        }

        if (!response.ok) {
          console.warn(
            "Could not fetch users:",
            data?.message
          );

          return;
        }

        let profileList = [];

        if (Array.isArray(data)) {
          profileList = data;
        } else if (
          Array.isArray(data.users)
        ) {
          profileList = data.users;
        } else if (
          Array.isArray(data.profiles)
        ) {
          profileList = data.profiles;
        } else if (
          Array.isArray(data.data)
        ) {
          profileList = data.data;
        }

        setUsers(profileList);
      } catch (err) {
        console.error(
          "FETCH USERS ERROR:",
          err
        );
      }
    },
    []
  );


  // ====================================================
  // INITIAL LOAD
  // ====================================================

  useEffect(() => {
    fetchAttendance();
    fetchUsers();
  }, [
    fetchAttendance,
    fetchUsers,
  ]);


  // ====================================================
  // AUTO REFRESH
  // ====================================================

  useEffect(() => {
    if (!autoRefresh) {
      return;
    }

    setRefreshCountdown(30);

    const interval =
      setInterval(() => {
        fetchAttendance();
        fetchUsers();
      }, 30000);

    return () =>
      clearInterval(interval);
  }, [
    autoRefresh,
    fetchAttendance,
    fetchUsers,
  ]);


  // ====================================================
  // COUNTDOWN
  // ====================================================

  useEffect(() => {
    if (!autoRefresh) {
      return;
    }

    const timer =
      setInterval(() => {
        setRefreshCountdown(
          (previous) => {
            if (previous <= 1) {
              return 30;
            }

            return previous - 1;
          }
        );
      }, 1000);

    return () =>
      clearInterval(timer);
  }, [autoRefresh]);


  // ====================================================
  // MANUAL REFRESH
  // ====================================================

  const handleRefresh = async () => {
    setRefreshing(true);

    await Promise.all([
      fetchAttendance(),
      fetchUsers(),
    ]);

    setRefreshCountdown(30);
  };


  // ====================================================
  // GET USER ID
  // ====================================================

  const getUserId = (user) => {
    return String(
      user?._id ||
        user?.id ||
        user?.userId ||
        ""
    );
  };


  // ====================================================
  // GET ATTENDANCE USER ID
  // ====================================================

  const getAttendanceUserId = (
    record
  ) => {
    return String(
      record?.userId?._id ||
        record?.userId ||
        record?.user?._id ||
        record?.user?.id ||
        ""
    );
  };


  // ====================================================
  // FORMAT TIME
  // ====================================================

  const formatTime = (value) => {
    if (!value) {
      return "--";
    }

    const date = new Date(value);

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return "--";
    }

    return date.toLocaleTimeString(
      "en-IN",
      {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }
    );
  };


  // ====================================================
  // FORMAT DATE
  // ====================================================

  const formatDate = (value) => {
    if (!value) {
      return "--";
    }

    const date = new Date(value);

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return "--";
    }

    return date.toLocaleDateString(
      "en-IN",
      {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }
    );
  };


  // ====================================================
  // FORMAT DATE TIME
  // ====================================================

  const formatDateTime = (
    value
  ) => {
    if (!value) {
      return "--";
    }

    const date = new Date(value);

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return "--";
    }

    return `${date.toLocaleDateString(
      "en-IN",
      {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }
    )} ${date.toLocaleTimeString(
      "en-IN",
      {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }
    )}`;
  };


  // ====================================================
  // FORMAT MINUTES
  // ====================================================

  const formatMinutes = (
    minutes = 0
  ) => {
    const total = Math.max(
      0,
      Number(minutes) || 0
    );

    const hours =
      Math.floor(total / 60);

    const mins = total % 60;

    return `${hours}h ${mins}m`;
  };


  // ====================================================
  // TIME STRING TO MINUTES
  // ====================================================

  const timeToMinutes = (
    time
  ) => {
    if (!time) {
      return null;
    }

    const parts =
      String(time).split(":");

    const hours =
      Number(parts[0]);

    const minutes =
      Number(parts[1]);

    if (
      Number.isNaN(hours) ||
      Number.isNaN(minutes)
    ) {
      return null;
    }

    return (
      hours * 60 + minutes
    );
  };


  // ====================================================
  // SHIFT MINUTES
  // ====================================================

  const getShiftMinutes = (
    user,
    record
  ) => {
    const start =
      timeToMinutes(
        user?.shiftStart ||
          record?.shiftStart ||
          DEFAULT_SHIFT_START
      );

    const end =
      timeToMinutes(
        user?.shiftEnd ||
          record?.shiftEnd ||
          DEFAULT_SHIFT_END
      );

    if (
      start === null ||
      end === null
    ) {
      return 540;
    }

    return Math.max(
      1,
      end - start
    );
  };


  // ====================================================
  // LATE MINUTES
  // ====================================================

  const getLateMinutes = (
    record,
    user
  ) => {
    if (!record?.checkIn) {
      return 0;
    }

    if (
      record.lateMinutes !==
      undefined
    ) {
      return Number(
        record.lateMinutes
      ) || 0;
    }

    const shiftStart =
      user?.shiftStart ||
      record?.shiftStart ||
      DEFAULT_SHIFT_START;

    const shiftMinutes =
      timeToMinutes(
        shiftStart
      );

    if (
      shiftMinutes === null
    ) {
      return 0;
    }

    const loginDate =
      new Date(record.checkIn);

    const loginMinutes =
      loginDate.getHours() * 60 +
      loginDate.getMinutes();

    return Math.max(
      0,
      loginMinutes -
        shiftMinutes
    );
  };


  // ====================================================
  // EARLY LOGOUT
  // ====================================================

  const getEarlyLogoutMinutes = (
    record,
    user
  ) => {
    if (!record?.checkOut) {
      return 0;
    }

    if (
      record.earlyLogoutMinutes !==
      undefined
    ) {
      return Number(
        record.earlyLogoutMinutes
      ) || 0;
    }

    const shiftEnd =
      user?.shiftEnd ||
      record?.shiftEnd ||
      DEFAULT_SHIFT_END;

    const shiftMinutes =
      timeToMinutes(
        shiftEnd
      );

    if (
      shiftMinutes === null
    ) {
      return 0;
    }

    const logoutDate =
      new Date(record.checkOut);

    const logoutMinutes =
      logoutDate.getHours() * 60 +
      logoutDate.getMinutes();

    return Math.max(
      0,
      shiftMinutes -
        logoutMinutes
    );
  };


  // ====================================================
  // OVERTIME
  // ====================================================

  const getOvertimeMinutes = (
    record,
    user
  ) => {
    if (!record?.checkOut) {
      return 0;
    }

    if (
      record.overtimeMinutes !==
      undefined
    ) {
      return Number(
        record.overtimeMinutes
      ) || 0;
    }

    const shiftEnd =
      user?.shiftEnd ||
      record?.shiftEnd ||
      DEFAULT_SHIFT_END;

    const shiftMinutes =
      timeToMinutes(
        shiftEnd
      );

    if (
      shiftMinutes === null
    ) {
      return 0;
    }

    const logoutDate =
      new Date(record.checkOut);

    const logoutMinutes =
      logoutDate.getHours() * 60 +
      logoutDate.getMinutes();

    return Math.max(
      0,
      logoutMinutes -
        shiftMinutes
    );
  };


  // ====================================================
  // CRM STATUS
  // ====================================================

  const getCRMStatus = (
    user
  ) => {
    if (!user) {
      return "Logged Out";
    }

    if (
      user.isOnline !== true
    ) {
      return "Logged Out";
    }

    if (!user.lastActivity) {
      return "Inactive";
    }

    const lastActivity =
      new Date(
        user.lastActivity
      );

    const age =
      Date.now() -
      lastActivity.getTime();

    if (
      age <= ACTIVE_THRESHOLD
    ) {
      return "Active";
    }

    return "Inactive";
  };


  // ====================================================
  // ATTENDANCE STATUS
  // ====================================================

  const getAttendanceStatus = (
    record
  ) => {
    if (!record) {
      return "Not Started";
    }

    if (record.status) {
      return record.status;
    }

    if (record.checkOut) {
      return "Completed";
    }

    if (record.checkIn) {
      return "Present";
    }

    return "Not Started";
  };


  // ====================================================
  // MERGE USERS + ATTENDANCE
  // ====================================================

  const employeeRows =
    useMemo(() => {
      const attendanceMap =
        new Map();

      attendance.forEach(
        (record) => {
          const id =
            getAttendanceUserId(
              record
            );

          if (id) {
            attendanceMap.set(
              id,
              record
            );
          }
        }
      );

      const rows = [];

      users.forEach((user) => {
        const id =
          getUserId(user);

        const record =
          attendanceMap.get(id) ||
          null;

        rows.push({
          user,
          attendance: record,
        });
      });

      attendance.forEach(
        (record) => {
          const id =
            getAttendanceUserId(
              record
            );

          if (!id) {
            return;
          }

          const exists =
            rows.some(
              (row) =>
                getUserId(
                  row.user
                ) === id
            );

          if (!exists) {
            rows.push({
              user: {
                _id: id,
                name:
                  record.userName ||
                  "Unknown User",
                mobile:
                  record.mobile ||
                  "",
                role:
                  record.role ||
                  "User",
                shiftStart:
                  record.shiftStart ||
                  DEFAULT_SHIFT_START,
                shiftEnd:
                  record.shiftEnd ||
                  DEFAULT_SHIFT_END,
                isOnline: false,
                lastActivity: null,
              },
              attendance: record,
            });
          }
        }
      );

      return rows;
    }, [
      users,
      attendance,
    ]);


  // ====================================================
  // FILTER
  // ====================================================

  const filteredRows =
    useMemo(() => {
      const search =
        searchTerm
          .trim()
          .toLowerCase();

      return employeeRows.filter(
        ({
          user,
          attendance: record,
        }) => {
          const name =
            user?.name ||
            record?.userName ||
            "";

          const mobile =
            user?.mobile || "";

          const role =
            user?.role || "";

          const crmStatus =
            getCRMStatus(user);

          const attendanceStatus =
            getAttendanceStatus(
              record
            );

          const matchesSearch =
            !search ||
            name
              .toLowerCase()
              .includes(search) ||
            mobile
              .toLowerCase()
              .includes(search) ||
            role
              .toLowerCase()
              .includes(search);

          const matchesAttendance =
            statusFilter === "All" ||
            attendanceStatus ===
              statusFilter;

          const matchesCRM =
            crmFilter === "All" ||
            crmStatus ===
              crmFilter;

          return (
            matchesSearch &&
            matchesAttendance &&
            matchesCRM
          );
        }
      );
    }, [
      employeeRows,
      searchTerm,
      statusFilter,
      crmFilter,
    ]);


  // ====================================================
  // SORT
  // ====================================================

  const sortedRows =
    useMemo(() => {
      const rows = [
        ...filteredRows,
      ];

      rows.sort(
        (a, b) => {
          const userA =
            a.user || {};

          const userB =
            b.user || {};

          const recordA =
            a.attendance || {};

          const recordB =
            b.attendance || {};

          let valueA;
          let valueB;

          switch (
            sortConfig.key
          ) {
            case "checkIn":
              valueA =
                recordA.checkIn
                  ? new Date(
                      recordA.checkIn
                    ).getTime()
                  : 0;

              valueB =
                recordB.checkIn
                  ? new Date(
                      recordB.checkIn
                    ).getTime()
                  : 0;
              break;

            case "working":
              valueA =
                Number(
                  recordA.totalMinutes
                ) || 0;

              valueB =
                Number(
                  recordB.totalMinutes
                ) || 0;
              break;

            case "late":
              valueA =
                getLateMinutes(
                  recordA,
                  userA
                );

              valueB =
                getLateMinutes(
                  recordB,
                  userB
                );
              break;

            case "overtime":
              valueA =
                getOvertimeMinutes(
                  recordA,
                  userA
                );

              valueB =
                getOvertimeMinutes(
                  recordB,
                  userB
                );
              break;

            case "status":
              valueA =
                getAttendanceStatus(
                  recordA
                );

              valueB =
                getAttendanceStatus(
                  recordB
                );
              break;

            default:
              valueA = String(
                userA?.name ||
                  recordA?.userName ||
                  ""
              ).toLowerCase();

              valueB = String(
                userB?.name ||
                  recordB?.userName ||
                  ""
              ).toLowerCase();
          }

          if (
            valueA <
            valueB
          ) {
            return sortConfig.direction ===
              "asc"
              ? -1
              : 1;
          }

          if (
            valueA >
            valueB
          ) {
            return sortConfig.direction ===
              "asc"
              ? 1
              : -1;
          }

          return 0;
        }
      );

      return rows;
    }, [
      filteredRows,
      sortConfig,
    ]);


  // ====================================================
  // STATISTICS
  // ====================================================

  const stats =
    useMemo(() => {
      let active = 0;
      let inactive = 0;
      let loggedOut = 0;
      let notStarted = 0;
      let present = 0;
      let completed = 0;
      let late = 0;
      let overtime = 0;
      let totalMinutes = 0;

      employeeRows.forEach(
        ({
          user,
          attendance: record,
        }) => {
          const crmStatus =
            getCRMStatus(user);

          const attendanceStatus =
            getAttendanceStatus(
              record
            );

          if (
            crmStatus ===
            "Active"
          ) {
            active++;
          }

          if (
            crmStatus ===
            "Inactive"
          ) {
            inactive++;
          }

          if (
            crmStatus ===
            "Logged Out"
          ) {
            loggedOut++;
          }

          if (
            attendanceStatus ===
            "Not Started"
          ) {
            notStarted++;
          }

          if (
            attendanceStatus ===
            "Present"
          ) {
            present++;
          }

          if (
            attendanceStatus ===
            "Completed"
          ) {
            completed++;
          }

          if (
            getLateMinutes(
              record,
              user
            ) > 0
          ) {
            late++;
          }

          if (
            getOvertimeMinutes(
              record,
              user
            ) > 0
          ) {
            overtime++;
          }

          totalMinutes +=
            Number(
              record?.totalMinutes
            ) || 0;
        }
      );

      const attendanceMarked =
        present +
        completed;

      const attendancePercentage =
        employeeRows.length > 0
          ? Math.round(
              (attendanceMarked /
                employeeRows.length) *
                100
            )
          : 0;

      const completionPercentage =
        employeeRows.length > 0
          ? Math.round(
              (completed /
                employeeRows.length) *
                100
            )
          : 0;

      return {
        total:
          employeeRows.length,
        active,
        inactive,
        loggedOut,
        notStarted,
        present,
        completed,
        late,
        overtime,
        totalMinutes,
        attendanceMarked,
        attendancePercentage,
        completionPercentage,
      };
    }, [
      employeeRows,
    ]);


  // ====================================================
  // PAGINATION
  // ====================================================

  const totalPages =
    Math.max(
      1,
      Math.ceil(
        sortedRows.length /
          pageSize
      )
    );

  const paginatedRows =
    useMemo(() => {
      const start =
        (currentPage - 1) *
        pageSize;

      return sortedRows.slice(
        start,
        start + pageSize
      );
    }, [
      sortedRows,
      currentPage,
      pageSize,
    ]);


  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchTerm,
    selectedDate,
    statusFilter,
    crmFilter,
    pageSize,
  ]);


  useEffect(() => {
    if (
      currentPage >
      totalPages
    ) {
      setCurrentPage(
        totalPages
      );
    }
  }, [
    currentPage,
    totalPages,
  ]);


  // ====================================================
  // SORT HANDLER
  // ====================================================

  const handleSort = (
    key
  ) => {
    setSortConfig(
      (previous) => {
        if (
          previous.key === key
        ) {
          return {
            key,
            direction:
              previous.direction ===
              "asc"
                ? "desc"
                : "asc",
          };
        }

        return {
          key,
          direction: "asc",
        };
      }
    );
  };


  // ====================================================
  // SORT ICON
  // ====================================================

  const SortIcon = ({
    column,
  }) => {
    if (
      sortConfig.key !==
      column
    ) {
      return (
        <ArrowUpDown
          size={13}
          className="text-gray-400"
        />
      );
    }

    return sortConfig.direction ===
      "asc" ? (
      <ArrowUp
        size={13}
        className="text-blue-600"
      />
    ) : (
      <ArrowDown
        size={13}
        className="text-blue-600"
      />
    );
  };


  // ====================================================
  // QUICK DATE
  // ====================================================

  const handleToday = () => {
    setSelectedDate(
      getTodayDate()
    );
  };


  const clearDate = () => {
    setSelectedDate("");
  };


  // ====================================================
  // CSV EXPORT
  // ====================================================

  const exportCSV = () => {
    const headers = [
      "Employee",
      "Mobile",
      "Role",
      "Date",
      "Shift Start",
      "Shift End",
      "CRM Status",
      "Attendance Status",
      "Check In",
      "Check Out",
      "Working Time",
      "Late Minutes",
      "Early Logout Minutes",
      "Overtime Minutes",
      "Attendance Source",
    ];

    const csvRows =
      sortedRows.map(
        ({
          user,
          attendance: record,
        }) => {
          return [
            user?.name ||
              record?.userName ||
              "Unknown",

            user?.mobile || "",

            user?.role || "",

            record?.date ||
              selectedDate ||
              "",

            user?.shiftStart ||
              record?.shiftStart ||
              DEFAULT_SHIFT_START,

            user?.shiftEnd ||
              record?.shiftEnd ||
              DEFAULT_SHIFT_END,

            getCRMStatus(user),

            getAttendanceStatus(
              record
            ),

            formatTime(
              record?.checkIn
            ),

            formatTime(
              record?.checkOut
            ),

            formatMinutes(
              record?.totalMinutes
            ),

            getLateMinutes(
              record,
              user
            ),

            getEarlyLogoutMinutes(
              record,
              user
            ),

            getOvertimeMinutes(
              record,
              user
            ),

            record?.attendanceSource ||
              "CRM_LOGIN",
          ];
        }
      );

    const csv = [
      headers,
      ...csvRows,
    ]
      .map((row) =>
        row
          .map(
            (value) =>
              `"${String(
                value ?? ""
              ).replace(
                /"/g,
                '""'
              )}"`
          )
          .join(",")
      )
      .join("\n");

    const blob =
      new Blob(
        [csv],
        {
          type: "text/csv;charset=utf-8;",
        }
      );

    const url =
      URL.createObjectURL(
        blob
      );

    const link =
      document.createElement(
        "a"
      );

    link.href = url;

    link.download =
      `attendance-${
        selectedDate ||
        getTodayDate()
      }.csv`;

    document.body.appendChild(
      link
    );

    link.click();

    document.body.removeChild(
      link
    );

    URL.revokeObjectURL(
      url
    );
  };


  // ====================================================
  // PRINT
  // ====================================================

  const printReport = () => {
    window.print();
  };


  // ====================================================
  // STATUS BADGE
  // ====================================================

  const StatusBadge = ({
    status,
  }) => {
    const styles = {
      Active:
        "bg-green-100 text-green-700 border-green-200",

      Inactive:
        "bg-yellow-100 text-yellow-700 border-yellow-200",

      "Logged Out":
        "bg-gray-100 text-gray-700 border-gray-200",

      "Not Started":
        "bg-red-100 text-red-700 border-red-200",

      Present:
        "bg-blue-100 text-blue-700 border-blue-200",

      Completed:
        "bg-green-100 text-green-700 border-green-200",

      "Half Day":
        "bg-orange-100 text-orange-700 border-orange-200",

      Absent:
        "bg-red-100 text-red-700 border-red-200",

      Leave:
        "bg-purple-100 text-purple-700 border-purple-200",
    };

    return (
      <span
        className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-semibold ${
          styles[status] ||
          "bg-gray-100 text-gray-700 border-gray-200"
        }`}
      >
        {status}
      </span>
    );
  };


  // ====================================================
  // PROGRESS
  // ====================================================

  const getWorkingProgress = (
    record,
    user
  ) => {
    const total =
      Number(
        record?.totalMinutes
      ) || 0;

    const shift =
      getShiftMinutes(
        user,
        record
      );

    return Math.min(
      100,
      Math.round(
        (total / shift) *
          100
      )
    );
  };


  // ====================================================
  // LOADING
  // ====================================================

  if (loading) {
    return (
      <div className="w-full min-h-[500px] bg-gray-50 flex items-center justify-center">
        <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center shadow-sm">
          <RefreshCw
            size={34}
            className="mx-auto mb-3 text-blue-600 animate-spin"
          />

          <h2 className="font-semibold text-gray-900">
            Loading Attendance
          </h2>

          <p className="text-sm text-gray-500 mt-1">
            Fetching employee attendance...
          </p>
        </div>
      </div>
    );
  }


  // ====================================================
  // MAIN UI
  // ====================================================

  return (
    <div className="attendance-print-area w-full min-h-screen bg-gray-50 p-4 sm:p-5 lg:p-6">

      {/* ==================================================
          PRINT CSS
      ================================================== */}

      <style>
        {`
          @media print {
            body {
              background: white !important;
            }

            body * {
              visibility: hidden;
            }

            .attendance-print-area,
            .attendance-print-area * {
              visibility: visible;
            }

            .attendance-print-area {
              position: absolute;
              left: 0;
              top: 0;
              width: 100%;
              background: white !important;
              padding: 20px !important;
            }

            .no-print {
              display: none !important;
            }

            .attendance-table {
              display: table !important;
            }
          }
        `}
      </style>


      {/* ==================================================
          HEADER
      ================================================== */}

      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 mb-6">

        <div>

          <div className="flex items-center gap-2">

            <div className="p-2 bg-blue-100 rounded-lg">
              <UserCheck
                size={25}
                className="text-blue-600"
              />
            </div>

            <div>

              <h1 className="text-2xl font-bold text-gray-900">
                Employee Attendance
              </h1>

              <p className="text-sm text-gray-500 mt-1">
                Monitor CRM login, attendance and working hours
              </p>

            </div>

          </div>

          {lastUpdated && (
            <p className="text-xs text-gray-400 mt-2">
              Last updated:{" "}
              {formatDateTime(
                lastUpdated
              )}
            </p>
          )}

        </div>


        <div className="flex flex-wrap gap-2 no-print">

          <button
            onClick={handleToday}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            <CalendarCheck2
              size={17}
            />

            Today
          </button>


          <button
            onClick={exportCSV}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            <Download
              size={17}
            />

            Export CSV
          </button>


          <button
            onClick={printReport}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            <Printer
              size={17}
            />

            Print
          </button>


          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-60"
          >
            <RefreshCw
              size={17}
              className={
                refreshing
                  ? "animate-spin"
                  : ""
              }
            />

            Refresh
          </button>

        </div>

      </div>


      {/* ==================================================
          API ERROR
      ================================================== */}

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 no-print">

          <div className="flex gap-3">

            <AlertCircle
              size={21}
              className="text-red-600 shrink-0"
            />

            <div className="flex-1">

              <p className="font-semibold text-red-800">
                Attendance API Error
              </p>

              <p className="text-sm text-red-700 mt-1">
                {error}
              </p>

              <p className="text-xs text-red-600 mt-2">
                Check your backend server and attendance routes.
              </p>

            </div>

            <button
              onClick={() =>
                setError("")
              }
              className="text-red-500 hover:text-red-700"
            >
              <X size={18} />
            </button>

          </div>

        </div>
      )}


      {/* ==================================================
          LIVE MONITOR
      ================================================== */}

      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">

        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">

          <div className="flex items-center gap-3">

            <div className="relative p-2.5 bg-green-50 rounded-lg">

              <Activity
                size={22}
                className="text-green-600"
              />

              <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" />

            </div>

            <div>

              <p className="font-semibold text-gray-900">
                Live Employee Monitoring
              </p>

              <p className="text-xs text-gray-500">
                CRM activity is monitored separately from attendance
              </p>

            </div>

          </div>


          <div className="flex flex-wrap items-center gap-4">

            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer no-print">

              <input
                type="checkbox"
                checked={
                  autoRefresh
                }
                onChange={(e) =>
                  setAutoRefresh(
                    e.target.checked
                  )
                }
                className="w-4 h-4"
              />

              Auto refresh

            </label>


            {autoRefresh && (
              <span className="text-xs text-gray-400">
                Next refresh in{" "}
                <span className="font-semibold text-gray-700">
                  {refreshCountdown}s
                </span>
              </span>
            )}

          </div>

        </div>

      </div>


      {/* ==================================================
          STATISTICS
      ================================================== */}

      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-7 gap-3 mb-6">

        <StatCard
          title="Employees"
          value={
            stats.total
          }
          icon={
            <Users size={20} />
          }
        />

        <StatCard
          title="Active"
          value={
            stats.active
          }
          icon={
            <Activity size={20} />
          }
          valueClass="text-green-600"
        />

        <StatCard
          title="Present"
          value={
            stats.present
          }
          icon={
            <UserCheck
              size={20}
            />
          }
          valueClass="text-blue-600"
        />

        <StatCard
          title="Completed"
          value={
            stats.completed
          }
          icon={
            <CheckCircle2
              size={20}
            />
          }
          valueClass="text-green-600"
        />

        <StatCard
          title="Not Started"
          value={
            stats.notStarted
          }
          icon={
            <UserX size={20} />
          }
          valueClass="text-red-600"
        />

        <StatCard
          title="Late"
          value={
            stats.late
          }
          icon={
            <AlertCircle
              size={20}
            />
          }
          valueClass="text-orange-600"
        />

        <StatCard
          title="Overtime"
          value={
            stats.overtime
          }
          icon={
            <Clock3
              size={20}
            />
          }
          valueClass="text-purple-600"
        />

      </div>


      {/* ==================================================
          PERFORMANCE SUMMARY
      ================================================== */}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">

        <SummaryCard
          icon={
            <Target size={22} />
          }
          title="Attendance Rate"
          value={`${stats.attendancePercentage}%`}
          description={`${stats.attendanceMarked} of ${stats.total} employees marked attendance`}
          progress={
            stats.attendancePercentage
          }
        />


        <SummaryCard
          icon={
            <CheckCircle2
              size={22}
            />
          }
          title="Completion Rate"
          value={`${stats.completionPercentage}%`}
          description={`${stats.completed} employees completed checkout`}
          progress={
            stats.completionPercentage
          }
        />


        <SummaryCard
          icon={
            <Clock3 size={22} />
          }
          title="Total Working Time"
          value={formatMinutes(
            stats.totalMinutes
          )}
          description="Recorded working time from attendance"
          progress={null}
        />

      </div>


      {/* ==================================================
          FILTER HEADER
      ================================================== */}

      <div className="bg-white border border-gray-200 rounded-xl mb-6">

        <div className="p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">

          <div className="flex items-center gap-2">

            <div className="p-2 bg-gray-100 rounded-lg">
              <Search
                size={18}
                className="text-gray-600"
              />
            </div>

            <div>

              <p className="font-semibold text-gray-900">
                Attendance Records
              </p>

              <p className="text-xs text-gray-500">
                Showing{" "}
                {sortedRows.length}{" "}
                employees
              </p>

            </div>

          </div>


          <button
            onClick={() =>
              setShowFilters(
                (previous) =>
                  !previous
              )
            }
            className="no-print text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            {showFilters
              ? "Hide Filters"
              : "Show Filters"}
          </button>

        </div>


        {/* ==================================================
            FILTERS
        ================================================== */}

        <div
          className={`${
            showFilters
              ? "block"
              : "block"
          } border-t border-gray-100 p-4`}
        >

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">

            {/* SEARCH */}

            <div className="relative xl:col-span-2">

              <Search
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />

              <input
                type="text"
                value={
                  searchTerm
                }
                onChange={(e) =>
                  setSearchTerm(
                    e.target.value
                  )
                }
                placeholder="Search name, mobile or role..."
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
              />

            </div>


            {/* DATE */}

            <div className="relative">

              <CalendarDays
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />

              <input
                type="date"
                value={
                  selectedDate
                }
                onChange={(e) =>
                  setSelectedDate(
                    e.target.value
                  )
                }
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
              />

            </div>


            {/* ATTENDANCE */}

            <select
              value={
                statusFilter
              }
              onChange={(e) =>
                setStatusFilter(
                  e.target.value
                )
              }
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
            >

              <option value="All">
                All Attendance
              </option>

              <option value="Present">
                Present
              </option>

              <option value="Completed">
                Completed
              </option>

              <option value="Not Started">
                Not Started
              </option>

              <option value="Half Day">
                Half Day
              </option>

              <option value="Absent">
                Absent
              </option>

              <option value="Leave">
                Leave
              </option>

            </select>


            {/* CRM */}

            <select
              value={
                crmFilter
              }
              onChange={(e) =>
                setCrmFilter(
                  e.target.value
                )
              }
              className="w-full px-4 py-2.5 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
            >

              <option value="All">
                All CRM Status
              </option>

              <option value="Active">
                Active
              </option>

              <option value="Inactive">
                Inactive
              </option>

              <option value="Logged Out">
                Logged Out
              </option>

            </select>

          </div>


          <div className="flex flex-wrap items-center gap-2 mt-3 no-print">

            <button
              onClick={handleToday}
              className="px-3 py-2 text-xs font-semibold bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100"
            >
              Today
            </button>

            <button
              onClick={
                clearDate
              }
              className="px-3 py-2 text-xs font-semibold bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
            >
              All Dates
            </button>


            {(searchTerm ||
              selectedDate ||
              statusFilter !==
                "All" ||
              crmFilter !==
                "All") && (
              <button
                onClick={() => {
                  setSearchTerm(
                    ""
                  );

                  setSelectedDate(
                    ""
                  );

                  setStatusFilter(
                    "All"
                  );

                  setCrmFilter(
                    "All"
                  );
                }}
                className="px-3 py-2 text-xs font-semibold text-red-600 hover:underline"
              >
                Clear All Filters
              </button>
            )}

          </div>

        </div>

      </div>


      {/* ==================================================
          DESKTOP TABLE
      ================================================== */}

      <div className="hidden lg:block bg-white border border-gray-200 rounded-xl overflow-hidden">

        <div className="overflow-x-auto">

          <table className="attendance-table w-full">

            <thead className="bg-gray-50 border-b border-gray-200">

              <tr>

                <SortableHeader
                  title="Employee"
                  column="name"
                  onClick={
                    handleSort
                  }
                  SortIcon={SortIcon}
                />

                <th className="text-left px-5 py-4 text-xs font-bold text-gray-500 uppercase">
                  Shift
                </th>

                <th className="text-left px-5 py-4 text-xs font-bold text-gray-500 uppercase">
                  CRM
                </th>

                <th className="text-left px-5 py-4 text-xs font-bold text-gray-500 uppercase">
                  Attendance
                </th>

                <SortableHeader
                  title="Login"
                  column="checkIn"
                  onClick={
                    handleSort
                  }
                  SortIcon={SortIcon}
                />

                <th className="text-left px-5 py-4 text-xs font-bold text-gray-500 uppercase">
                  Logout
                </th>

                <SortableHeader
                  title="Working"
                  column="working"
                  onClick={
                    handleSort
                  }
                  SortIcon={SortIcon}
                />

                <SortableHeader
                  title="Late"
                  column="late"
                  onClick={
                    handleSort
                  }
                  SortIcon={SortIcon}
                />

                <SortableHeader
                  title="Overtime"
                  column="overtime"
                  onClick={
                    handleSort
                  }
                  SortIcon={SortIcon}
                />

              </tr>

            </thead>


            <tbody>

              {paginatedRows.length ===
              0 ? (
                <tr>

                  <td
                    colSpan="9"
                    className="text-center py-16"
                  >

                    <Users
                      size={40}
                      className="mx-auto mb-3 text-gray-300"
                    />

                    <p className="font-semibold text-gray-700">
                      No attendance records found
                    </p>

                    <p className="text-sm text-gray-400 mt-1">
                      Try changing your filters
                    </p>

                  </td>

                </tr>
              ) : (
                paginatedRows.map(
                  ({
                    user,
                    attendance: record,
                  }) => {

                    const crmStatus =
                      getCRMStatus(
                        user
                      );

                    const attendanceStatus =
                      getAttendanceStatus(
                        record
                      );

                    const late =
                      getLateMinutes(
                        record,
                        user
                      );

                    const overtime =
                      getOvertimeMinutes(
                        record,
                        user
                      );

                    const progress =
                      getWorkingProgress(
                        record,
                        user
                      );

                    return (
                      <tr
                        key={
                          getUserId(
                            user
                          ) ||
                          `attendance-${record?._id}`
                        }
                        onClick={() =>
                          setSelectedEmployee(
                            {
                              user,
                              attendance:
                                record,
                            }
                          )
                        }
                        className="border-b border-gray-100 hover:bg-blue-50/50 cursor-pointer transition"
                      >

                        {/* EMPLOYEE */}

                        <td className="px-5 py-4">

                          <div className="flex items-center gap-3">

                            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold shrink-0">

                              {(
                                user?.name ||
                                record?.userName ||
                                "U"
                              )
                                .charAt(
                                  0
                                )
                                .toUpperCase()}

                            </div>

                            <div className="min-w-0">

                              <p className="font-semibold text-gray-900 truncate max-w-[180px]">
                                {user?.name ||
                                  record?.userName ||
                                  "Unknown User"}
                              </p>

                              <p className="text-xs text-gray-400">
                                {user?.mobile ||
                                  "--"}
                              </p>

                            </div>

                          </div>

                        </td>


                        {/* SHIFT */}

                        <td className="px-5 py-4">

                          <p className="font-medium text-gray-800">
                            {user?.shiftStart ||
                              record?.shiftStart ||
                              DEFAULT_SHIFT_START}
                          </p>

                          <p className="text-xs text-gray-400">
                            to{" "}
                            {user?.shiftEnd ||
                              record?.shiftEnd ||
                              DEFAULT_SHIFT_END}
                          </p>

                        </td>


                        {/* CRM */}

                        <td className="px-5 py-4">

                          <StatusBadge
                            status={
                              crmStatus
                            }
                          />

                        </td>


                        {/* ATTENDANCE */}

                        <td className="px-5 py-4">

                          <StatusBadge
                            status={
                              attendanceStatus
                            }
                          />

                        </td>


                        {/* LOGIN */}

                        <td className="px-5 py-4">

                          <div className="flex items-center gap-1.5 text-gray-700">

                            <LogIn
                              size={15}
                              className="text-green-600"
                            />

                            {formatTime(
                              record?.checkIn
                            )}

                          </div>

                        </td>


                        {/* LOGOUT */}

                        <td className="px-5 py-4">

                          <div className="flex items-center gap-1.5 text-gray-700">

                            <LogOut
                              size={15}
                              className="text-red-500"
                            />

                            {formatTime(
                              record?.checkOut
                            )}

                          </div>

                        </td>


                        {/* WORKING */}

                        <td className="px-5 py-4 min-w-[150px]">

                          <div className="flex items-center justify-between gap-2">

                            <span className="flex items-center gap-1.5 font-semibold text-gray-800 text-sm">

                              <Clock3
                                size={15}
                                className="text-blue-600"
                              />

                              {formatMinutes(
                                record?.totalMinutes
                              )}

                            </span>

                            <span className="text-[10px] text-gray-400">
                              {progress}%
                            </span>

                          </div>

                          <div className="w-full h-1.5 bg-gray-100 rounded-full mt-2 overflow-hidden">

                            <div
                              className="h-full bg-blue-500 rounded-full"
                              style={{
                                width: `${progress}%`,
                              }}
                            />

                          </div>

                        </td>


                        {/* LATE */}

                        <td className="px-5 py-4">

                          {late >
                          0 ? (
                            <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-1 rounded-lg">
                              {late}m
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">
                              —
                            </span>
                          )}

                        </td>


                        {/* OVERTIME */}

                        <td className="px-5 py-4">

                          {overtime >
                          0 ? (
                            <span className="text-xs font-semibold text-green-600 bg-green-50 px-2 py-1 rounded-lg">
                              {overtime}m
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">
                              —
                            </span>
                          )}

                        </td>

                      </tr>
                    );
                  }
                )
              )}

            </tbody>

          </table>

        </div>


        {/* ==================================================
            PAGINATION
        ================================================== */}

        <Pagination
          currentPage={
            currentPage
          }
          totalPages={
            totalPages
          }
          pageSize={
            pageSize
          }
          setPageSize={
            setPageSize
          }
          setCurrentPage={
            setCurrentPage
          }
          totalRecords={
            sortedRows.length
          }
          pageSizeOptions={
            PAGE_SIZE_OPTIONS
          }
        />

      </div>


      {/* ==================================================
          MOBILE CARDS
      ================================================== */}

      <div className="lg:hidden space-y-3">

        {paginatedRows.length ===
        0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">

            <Users
              size={40}
              className="mx-auto mb-3 text-gray-300"
            />

            <p className="font-semibold text-gray-700">
              No employees found
            </p>

            <p className="text-sm text-gray-400 mt-1">
              Try changing your filters
            </p>

          </div>
        ) : (
          paginatedRows.map(
            ({
              user,
              attendance: record,
            }) => {

              const crmStatus =
                getCRMStatus(
                  user
                );

              const attendanceStatus =
                getAttendanceStatus(
                  record
                );

              const late =
                getLateMinutes(
                  record,
                  user
                );

              const early =
                getEarlyLogoutMinutes(
                  record,
                  user
                );

              const overtime =
                getOvertimeMinutes(
                  record,
                  user
                );

              const progress =
                getWorkingProgress(
                  record,
                  user
                );

              return (
                <div
                  key={
                    getUserId(
                      user
                    ) ||
                    `mobile-${record?._id}`
                  }
                  onClick={() =>
                    setSelectedEmployee(
                      {
                        user,
                        attendance:
                          record,
                      }
                    )
                  }
                  className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm cursor-pointer"
                >

                  <div className="flex items-start justify-between gap-3">

                    <div className="flex items-center gap-3 min-w-0">

                      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold shrink-0">

                        {(
                          user?.name ||
                          record?.userName ||
                          "U"
                        )
                          .charAt(
                            0
                          )
                          .toUpperCase()}

                      </div>

                      <div className="min-w-0">

                        <p className="font-bold text-gray-900 truncate">
                          {user?.name ||
                            record?.userName ||
                            "Unknown User"}
                        </p>

                        <p className="text-xs text-gray-400 mt-1">
                          {user?.mobile ||
                            "--"}
                        </p>

                      </div>

                    </div>

                    <StatusBadge
                      status={
                        crmStatus
                      }
                    />

                  </div>


                  <div className="mt-4">

                    <StatusBadge
                      status={
                        attendanceStatus
                      }
                    />

                  </div>


                  <div className="grid grid-cols-2 gap-3 mt-4">

                    <InfoBox
                      label="Shift"
                      value={`${
                        user?.shiftStart ||
                        DEFAULT_SHIFT_START
                      } - ${
                        user?.shiftEnd ||
                        DEFAULT_SHIFT_END
                      }`}
                    />

                    <InfoBox
                      label="Working"
                      value={formatMinutes(
                        record?.totalMinutes
                      )}
                    />

                    <InfoBox
                      label="Check In"
                      value={formatTime(
                        record?.checkIn
                      )}
                    />

                    <InfoBox
                      label="Check Out"
                      value={formatTime(
                        record?.checkOut
                      )}
                    />

                  </div>


                  <div className="mt-4">

                    <div className="flex justify-between text-xs mb-1">

                      <span className="text-gray-500">
                        Shift Progress
                      </span>

                      <span className="font-semibold text-gray-700">
                        {progress}%
                      </span>

                    </div>

                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">

                      <div
                        className="h-full bg-blue-500 rounded-full"
                        style={{
                          width: `${progress}%`,
                        }}
                      />

                    </div>

                  </div>


                  <div className="flex flex-wrap gap-2 mt-4">

                    {late > 0 && (
                      <span className="text-[11px] px-2 py-1 rounded bg-red-50 text-red-600">
                        Late {late}m
                      </span>
                    )}

                    {early > 0 && (
                      <span className="text-[11px] px-2 py-1 rounded bg-orange-50 text-orange-600">
                        Early {early}m
                      </span>
                    )}

                    {overtime > 0 && (
                      <span className="text-[11px] px-2 py-1 rounded bg-green-50 text-green-600">
                        OT {overtime}m
                      </span>
                    )}

                    {late === 0 &&
                      early === 0 &&
                      overtime === 0 && (
                        <span className="text-[11px] px-2 py-1 rounded bg-gray-50 text-gray-500">
                          Normal
                        </span>
                      )}

                  </div>

                </div>
              );
            }
          )
        )}


        {paginatedRows.length >
          0 && (
          <div className="bg-white border border-gray-200 rounded-xl">

            <Pagination
              currentPage={
                currentPage
              }
              totalPages={
                totalPages
              }
              pageSize={
                pageSize
              }
              setPageSize={
                setPageSize
              }
              setCurrentPage={
                setCurrentPage
              }
              totalRecords={
                sortedRows.length
              }
              pageSizeOptions={
                PAGE_SIZE_OPTIONS
              }
            />

          </div>
        )}

      </div>


      {/* ==================================================
          EMPLOYEE DETAILS MODAL
      ================================================== */}

      {selectedEmployee && (
        <EmployeeDetailsModal
          employee={
            selectedEmployee
          }
          onClose={() =>
            setSelectedEmployee(
              null
            )
          }
          formatTime={
            formatTime
          }
          formatDate={
            formatDate
          }
          formatDateTime={
            formatDateTime
          }
          formatMinutes={
            formatMinutes
          }
          getCRMStatus={
            getCRMStatus
          }
          getAttendanceStatus={
            getAttendanceStatus
          }
          getLateMinutes={
            getLateMinutes
          }
          getEarlyLogoutMinutes={
            getEarlyLogoutMinutes
          }
          getOvertimeMinutes={
            getOvertimeMinutes
          }
          getWorkingProgress={
            getWorkingProgress
          }
          StatusBadge={
            StatusBadge
          }
        />
      )}

    </div>
  );
};


// ======================================================
// SORTABLE HEADER
// ======================================================

const SortableHeader = ({
  title,
  column,
  onClick,
  SortIcon,
}) => {
  return (
    <th className="text-left px-5 py-4 text-xs font-bold text-gray-500 uppercase">

      <button
        onClick={() =>
          onClick(column)
        }
        className="flex items-center gap-1.5 hover:text-gray-900"
      >
        {title}

        <SortIcon
          column={column}
        />
      </button>

    </th>
  );
};


// ======================================================
// STAT CARD
// ======================================================

const StatCard = ({
  title,
  value,
  icon,
  valueClass = "text-gray-900",
}) => {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-sm transition">

      <div className="flex items-center gap-3">

        <div className="p-2.5 bg-blue-50 rounded-lg text-blue-600">
          {icon}
        </div>

        <div className="min-w-0">

          <p className="text-xs text-gray-500 truncate">
            {title}
          </p>

          <p
            className={`text-xl font-bold ${valueClass}`}
          >
            {value}
          </p>

        </div>

      </div>

    </div>
  );
};


// ======================================================
// SUMMARY CARD
// ======================================================

const SummaryCard = ({
  icon,
  title,
  value,
  description,
  progress,
}) => {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">

      <div className="flex items-start justify-between gap-4">

        <div className="p-3 bg-blue-50 rounded-xl text-blue-600">
          {icon}
        </div>

        <div className="text-right">

          <p className="text-xs text-gray-500">
            {title}
          </p>

          <p className="text-2xl font-bold text-gray-900 mt-1">
            {value}
          </p>

        </div>

      </div>

      <p className="text-xs text-gray-500 mt-4">
        {description}
      </p>

      {progress !== null && (
        <div className="mt-3">

          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">

            <div
              className="h-full bg-blue-500 rounded-full transition-all"
              style={{
                width: `${progress}%`,
              }}
            />

          </div>

        </div>
      )}

    </div>
  );
};


// ======================================================
// INFO BOX
// ======================================================

const InfoBox = ({
  label,
  value,
}) => {
  return (
    <div className="bg-gray-50 rounded-lg p-3">

      <p className="text-xs text-gray-400">
        {label}
      </p>

      <p className="text-sm font-semibold text-gray-800 mt-1 break-words">
        {value}
      </p>

    </div>
  );
};


// ======================================================
// PAGINATION
// ======================================================

const Pagination = ({
  currentPage,
  totalPages,
  pageSize,
  setPageSize,
  setCurrentPage,
  totalRecords,
  pageSizeOptions,
}) => {
  const start =
    totalRecords === 0
      ? 0
      : (currentPage - 1) *
          pageSize +
        1;

  const end =
    Math.min(
      currentPage *
        pageSize,
      totalRecords
    );

  return (
    <div className="px-4 py-4 border-t border-gray-200 flex flex-col md:flex-row md:items-center md:justify-between gap-3 no-print">

      <div className="flex items-center gap-2 text-sm text-gray-500">

        <span>
          Showing{" "}
          <strong className="text-gray-800">
            {start}
          </strong>{" "}
          -{" "}
          <strong className="text-gray-800">
            {end}
          </strong>{" "}
          of{" "}
          <strong className="text-gray-800">
            {totalRecords}
          </strong>
        </span>

      </div>


      <div className="flex items-center gap-3">

        <select
          value={pageSize}
          onChange={(e) =>
            setPageSize(
              Number(
                e.target.value
              )
            )
          }
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
        >

          {pageSizeOptions.map(
            (size) => (
              <option
                key={size}
                value={size}
              >
                {size} / page
              </option>
            )
          )}

        </select>


        <button
          disabled={
            currentPage <= 1
          }
          onClick={() =>
            setCurrentPage(
              (page) =>
                Math.max(
                  1,
                  page - 1
                )
            )
          }
          className="p-2 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
        >
          <ChevronLeft
            size={17}
          />
        </button>


        <span className="text-sm font-semibold text-gray-700 min-w-[70px] text-center">
          {currentPage} /{" "}
          {totalPages}
        </span>


        <button
          disabled={
            currentPage >=
            totalPages
          }
          onClick={() =>
            setCurrentPage(
              (page) =>
                Math.min(
                  totalPages,
                  page + 1
                )
            )
          }
          className="p-2 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
        >
          <ChevronRight
            size={17}
          />
        </button>

      </div>

    </div>
  );
};


// ======================================================
// EMPLOYEE DETAILS MODAL
// ======================================================

const EmployeeDetailsModal = ({
  employee,
  onClose,
  formatTime,
  formatDate,
  formatDateTime,
  formatMinutes,
  getCRMStatus,
  getAttendanceStatus,
  getLateMinutes,
  getEarlyLogoutMinutes,
  getOvertimeMinutes,
  getWorkingProgress,
  StatusBadge,
}) => {
  const {
    user,
    attendance: record,
  } = employee;

  const crmStatus =
    getCRMStatus(user);

  const attendanceStatus =
    getAttendanceStatus(
      record
    );

  const late =
    getLateMinutes(
      record,
      user
    );

  const early =
    getEarlyLogoutMinutes(
      record,
      user
    );

  const overtime =
    getOvertimeMinutes(
      record,
      user
    );

  const progress =
    getWorkingProgress(
      record,
      user
    );

  return (
    <div className="fixed inset-0 z-[999] bg-black/50 flex items-center justify-center p-4">

      <div className="bg-white w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl shadow-2xl">

        {/* HEADER */}

        <div className="sticky top-0 z-10 bg-white border-b p-5 flex items-center justify-between">

          <div className="flex items-center gap-3">

            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-lg">
              {(
                user?.name ||
                record?.userName ||
                "U"
              )
                .charAt(0)
                .toUpperCase()}
            </div>

            <div>

              <h2 className="text-xl font-bold text-gray-900">
                {user?.name ||
                  record?.userName ||
                  "Unknown User"}
              </h2>

              <p className="text-sm text-gray-500 mt-1">
                Employee Attendance Details
              </p>

            </div>

          </div>


          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100"
          >
            <X size={20} />
          </button>

        </div>


        {/* CONTENT */}

        <div className="p-5 space-y-6">

          {/* STATUS */}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

            <div className="border rounded-xl p-4">

              <p className="text-xs text-gray-500 mb-2">
                CRM Status
              </p>

              <StatusBadge
                status={
                  crmStatus
                }
              />

            </div>


            <div className="border rounded-xl p-4">

              <p className="text-xs text-gray-500 mb-2">
                Attendance Status
              </p>

              <StatusBadge
                status={
                  attendanceStatus
                }
              />

            </div>

          </div>


          {/* EMPLOYEE */}

          <section>

            <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
              <Users
                size={18}
              />

              Employee Information
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

              <InfoBox
                label="Name"
                value={
                  user?.name ||
                  record?.userName ||
                  "--"
                }
              />

              <InfoBox
                label="Mobile"
                value={
                  user?.mobile ||
                  "--"
                }
              />

              <InfoBox
                label="Role"
                value={
                  user?.role ||
                  "--"
                }
              />

              <InfoBox
                label="Date"
                value={
                  record?.date ||
                  formatDate(
                    record?.checkIn
                  )
                }
              />

            </div>

          </section>


          {/* SHIFT */}

          <section>

            <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
              <Clock3
                size={18}
              />

              Shift Information
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

              <InfoBox
                label="Shift Start"
                value={
                  user?.shiftStart ||
                  record?.shiftStart ||
                  DEFAULT_SHIFT_START
                }
              />

              <InfoBox
                label="Shift End"
                value={
                  user?.shiftEnd ||
                  record?.shiftEnd ||
                  DEFAULT_SHIFT_END
                }
              />

            </div>

          </section>


          {/* ATTENDANCE */}

          <section>

            <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
              <CalendarDays
                size={18}
              />

              Attendance Details
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

              <InfoBox
                label="Check In"
                value={formatDateTime(
                  record?.checkIn
                )}
              />

              <InfoBox
                label="Check Out"
                value={formatDateTime(
                  record?.checkOut
                )}
              />

              <InfoBox
                label="Working Time"
                value={formatMinutes(
                  record?.totalMinutes
                )}
              />

              <InfoBox
                label="Attendance Source"
                value={
                  record?.attendanceSource ||
                  "CRM_LOGIN"
                }
              />

            </div>

          </section>


          {/* WORKING PROGRESS */}

          <section>

            <div className="flex items-center justify-between mb-2">

              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <TrendingUp
                  size={18}
                />

                Shift Progress
              </h3>

              <span className="text-sm font-bold text-blue-600">
                {progress}%
              </span>

            </div>

            <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">

              <div
                className="h-full bg-blue-500 rounded-full"
                style={{
                  width: `${progress}%`,
                }}
              />

            </div>

          </section>


          {/* CRM ACTIVITY */}

          <section>

            <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
              <Activity
                size={18}
              />

              CRM Activity
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

              <InfoBox
                label="CRM Status"
                value={
                  crmStatus
                }
              />

              <InfoBox
                label="Last Activity"
                value={formatDateTime(
                  user?.lastActivity
                )}
              />

              <InfoBox
                label="Login Time"
                value={formatDateTime(
                  user?.loginTime ||
                    record?.checkIn
                )}
              />

              <InfoBox
                label="Logout Time"
                value={formatDateTime(
                  user?.logoutTime ||
                    record?.checkOut
                )}
              />

            </div>

          </section>


          {/* SHIFT INSIGHTS */}

          <section>

            <h3 className="font-bold text-gray-900 mb-3">
              Shift Insights
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

              <InsightBox
                title="Late"
                value={`${late} min`}
                icon={
                  <AlertCircle
                    size={18}
                  />
                }
                type={
                  late > 0
                    ? "danger"
                    : "normal"
                }
              />

              <InsightBox
                title="Early Logout"
                value={`${early} min`}
                icon={
                  <LogOut
                    size={18}
                  />
                }
                type={
                  early > 0
                    ? "warning"
                    : "normal"
                }
              />

              <InsightBox
                title="Overtime"
                value={`${overtime} min`}
                icon={
                  <Clock3
                    size={18}
                  />
                }
                type={
                  overtime > 0
                    ? "success"
                    : "normal"
                }
              />

            </div>

          </section>


          {/* NOT STARTED */}

          {!record && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">

              <div className="flex gap-3">

                <AlertCircle
                  size={20}
                  className="text-red-600 shrink-0"
                />

                <div>

                  <p className="font-semibold text-red-800">
                    Attendance Not Started
                  </p>

                  <p className="text-sm text-red-700 mt-1">
                    No attendance record was created for this employee.
                  </p>

                  <p className="text-xs text-red-600 mt-2">
                    Admin can review this employee manually if they worked without marking attendance.
                  </p>

                </div>

              </div>

            </div>
          )}


          {/* CORRECTION REASON */}

          {record?.correctionReason && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">

              <p className="font-semibold text-yellow-800">
                Admin Correction
              </p>

              <p className="text-sm text-yellow-700 mt-1">
                {record.correctionReason}
              </p>

            </div>
          )}

        </div>


        {/* FOOTER */}

        <div className="border-t p-5 flex justify-end">

          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800"
          >
            Close
          </button>

        </div>

      </div>

    </div>
  );
};


// ======================================================
// INSIGHT BOX
// ======================================================

const InsightBox = ({
  title,
  value,
  icon,
  type = "normal",
}) => {
  const styles = {
    normal:
      "bg-gray-50 text-gray-700",

    danger:
      "bg-red-50 text-red-700",

    warning:
      "bg-orange-50 text-orange-700",

    success:
      "bg-green-50 text-green-700",
  };

  return (
    <div
      className={`rounded-xl p-4 ${styles[type]}`}
    >

      <div className="flex items-center gap-2">

        {icon}

        <span className="text-xs font-medium">
          {title}
        </span>

      </div>

      <p className="text-lg font-bold mt-2">
        {value}
      </p>

    </div>
  );
};


export default AdminAttendance;