// =====================================================
// STAFF MANAGEMENT (admin)
// Also provides the two handlers the existing admin screen already calls but the
// backend never had:  PUT /UserAccounts/update-PasswordById/:id  (edit user)
//                     DELETE /UserAccounts/delete-Account/:id     (delete user)
// =====================================================
const bcrypt = require("bcryptjs");
const User = require("../Models/User.Model");
const Branch = require("../Models/Branch.Model");
const Device = require("../Models/Device.Model");
const Notification = require("../Models/Notification.Model");
const Leave = require("../Models/Leave.Model");
const Regularization = require("../Models/Regularization.Model");
const engine = require("../Services/attendanceEngine");
const notify = require("../Services/notification.service");
const report = require("../Services/report.service");
const { dateKey, isValidDateKey } = require("../Utils/time");
const { ok, handle, httpError, isObjectId } = require("../Utils/http");

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const MOBILE = /^[0-9+\-\s()]{7,15}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const short = (v, n = 80) => String(v ?? "").trim().slice(0, n);

/** Validate + normalise the editable profile fields. Only supplied fields are returned. */
async function parseProfile(body = {}, { existingId = null, creating = false } = {}) {
  const f = {};

  if (body.name !== undefined || creating) {
    const name = short(body.name, 60);
    if (!name) throw httpError(400, "Name is required");
    const clash = await User.findOne({ name, ...(existingId ? { _id: { $ne: existingId } } : {}) }).select("_id");
    if (clash) throw httpError(409, "Username already exists");
    f.name = name;
  }

  if (body.mobile !== undefined || creating) {
    const mobile = short(body.mobile, 20);
    if (!MOBILE.test(mobile)) throw httpError(400, "Please enter a valid mobile number");
    const clash = await User.findOne({ mobile, ...(existingId ? { _id: { $ne: existingId } } : {}) }).select("_id");
    if (clash) throw httpError(409, "Mobile number already exists");
    f.mobile = mobile;
  }

  if (body.role !== undefined || creating) f.role = short(body.role, 40) || "user";

  for (const key of ["shiftStart", "shiftEnd"]) {
    if (body[key] !== undefined && body[key] !== "") {
      if (!HHMM.test(String(body[key]))) throw httpError(400, `${key} must be HH:MM`);
      f[key] = body[key];
    }
  }

  if (body.branchId !== undefined) {
    if (!body.branchId) f.branchId = null;
    else {
      if (!isObjectId(body.branchId) || !(await Branch.exists({ _id: body.branchId }))) throw httpError(400, "Unknown branch");
      f.branchId = body.branchId;
    }
  }

  if (body.attendanceMode !== undefined) {
    if (!["WIFI", "CRM_LOGIN"].includes(body.attendanceMode)) throw httpError(400, "attendanceMode must be WIFI or CRM_LOGIN");
    f.attendanceMode = body.attendanceMode;
  }

  if (body.email !== undefined) {
    const email = short(body.email, 120).toLowerCase();
    if (email && !EMAIL.test(email)) throw httpError(400, "Invalid email address");
    f.email = email;
  }
  if (body.department !== undefined) f.department = short(body.department, 60);
  if (body.employeeCode !== undefined) f.employeeCode = short(body.employeeCode, 30);

  if (body.joiningDate !== undefined) {
    if (body.joiningDate && !isValidDateKey(body.joiningDate)) throw httpError(400, "joiningDate must be YYYY-MM-DD");
    f.joiningDate = body.joiningDate || "";
  }
  if (body.isActive !== undefined) f.isActive = Boolean(body.isActive);

  // Wi-Fi mode makes no sense without a branch
  const finalMode = f.attendanceMode;
  if (finalMode === "WIFI" && f.branchId === null) throw httpError(400, "Wi-Fi attendance needs a branch");
  return f;
}

const publicUser = (u) => {
  const o = u.toObject ? u.toObject() : { ...u };
  delete o.password;
  return o;
};

const hash = async (pw) => {
  if (!pw || String(pw).length < 6) throw httpError(400, "Password must be at least 6 characters");
  return bcrypt.hash(String(pw), 10);
};

async function afterChange(user, before, patch) {
  const wentInactive = patch.isActive === false && before.isActive !== false;
  const leftWifi = patch.attendanceMode === "CRM_LOGIN" && before.attendanceMode === "WIFI";
  if (wentInactive || leftWifi) await engine.closeOpenSessionFor(user._id, "MANUAL");
  if (wentInactive) {
    user.isOnline = false;
    await user.save();
  }
  if (patch.name && patch.name !== before.name) await Device.updateMany({ userId: user._id }, { $set: { userName: patch.name } });

  const changed =
    (patch.branchId !== undefined && String(patch.branchId || "") !== before.branchId) ||
    (patch.attendanceMode && patch.attendanceMode !== before.attendanceMode) ||
    (patch.shiftStart && patch.shiftStart !== before.shiftStart) ||
    (patch.shiftEnd && patch.shiftEnd !== before.shiftEnd);
  if (changed && !wentInactive) {
    await notify.notifyUser(user._id, {
      category: "staff",
      type: "ATTENDANCE_SETTINGS_CHANGED",
      severity: "info",
      title: "Your attendance settings were updated",
      message: `Mode: ${user.attendanceMode === "WIFI" ? "Office Wi-Fi (automatic)" : "CRM login"} · Shift ${user.shiftStart}–${user.shiftEnd}`,
      link: "Attendance",
    });
  }
}

// ---------------- list ----------------
// GET /api/staff?q=&branchId=&mode=&status=active|inactive|all
const list = handle(async (req, res) => {
  const { q, branchId, mode, status = "all" } = req.query;
  const query = {};
  if (branchId && isObjectId(branchId)) query.branchId = branchId;
  if (mode) query.attendanceMode = mode;
  if (status === "active") query.isActive = { $ne: false };
  if (status === "inactive") query.isActive = false;

  let users = await User.find(query).select("-password").sort({ name: 1 }).lean();
  if (q) {
    const needle = String(q).toLowerCase();
    users = users.filter((u) =>
      [u.name, u.mobile, u.role, u.department, u.employeeCode, u.email].some((v) => String(v || "").toLowerCase().includes(needle))
    );
  }
  const { rows } = await report.buildRows(users, dateKey());
  ok(res, { staff: rows });
});

const getOne = handle(async (req, res) => {
  if (!isObjectId(req.params.id)) throw httpError(400, "Invalid id");
  const user = await User.findById(req.params.id).select("-password").lean();
  if (!user) throw httpError(404, "Staff member not found");
  const devices = await Device.find({ userId: user._id }).select("-tokenHash").sort({ createdAt: -1 }).lean();
  ok(res, { user, devices });
});

// ---------------- create ----------------
// POST /api/staff
const create = handle(async (req, res) => {
  const f = await parseProfile(req.body, { creating: true });
  const password = await hash(req.body.password);
  if (!f.attendanceMode) f.attendanceMode = f.branchId ? "WIFI" : "CRM_LOGIN";
  if (f.attendanceMode === "WIFI" && !f.branchId) throw httpError(400, "Wi-Fi attendance needs a branch");
  const user = await User.create({ ...f, password });
  ok(res, { message: "User created successfully", user: publicUser(user) }, 201);
});

// ---------------- update ----------------
async function applyUpdate(req, res, { allowNoPassword = true } = {}) {
  if (!isObjectId(req.params.id)) throw httpError(400, "Invalid id");
  const user = await User.findById(req.params.id);
  if (!user) throw httpError(404, "Staff member not found");

  const patch = await parseProfile(req.body, { existingId: user._id });
  if (req.body.password) patch.password = await hash(req.body.password);

  const before = {
    name: user.name,
    isActive: user.isActive,
    attendanceMode: user.attendanceMode,
    branchId: String(user.branchId || ""),
    shiftStart: user.shiftStart,
    shiftEnd: user.shiftEnd,
  };

  const nextMode = patch.attendanceMode ?? user.attendanceMode;
  const nextBranch = patch.branchId !== undefined ? patch.branchId : user.branchId;
  if (nextMode === "WIFI" && !nextBranch) throw httpError(400, "Wi-Fi attendance needs a branch");
  if (!Object.keys(patch).length && allowNoPassword) throw httpError(400, "Nothing to update");

  Object.assign(user, patch);
  await user.save();
  await afterChange(user, before, patch);
  ok(res, { message: "User updated successfully", user: publicUser(user) });
}

const update = handle((req, res) => applyUpdate(req, res));
// existing screen: PUT /UserAccounts/update-PasswordById/:id with { name, mobile, password }
const updateAccountByAdmin = handle((req, res) => {
  // the old form always sends the password field; blank means "leave unchanged"
  if (req.body && req.body.password === "") delete req.body.password;
  return applyUpdate(req, res);
});

const resetPassword = handle(async (req, res) => {
  if (!isObjectId(req.params.id)) throw httpError(400, "Invalid id");
  const user = await User.findById(req.params.id);
  if (!user) throw httpError(404, "Staff member not found");
  user.password = await hash(req.body?.password);
  await user.save();
  await notify.notifyUser(user._id, {
    category: "staff",
    type: "PASSWORD_RESET",
    severity: "warning",
    title: "Your password was reset by an administrator",
    message: "Use your new password the next time you sign in.",
  });
  ok(res, { message: "Password updated" });
});

// POST /api/staff/bulk  { userIds, attendanceMode?, branchId?, isActive? }
const bulk = handle(async (req, res) => {
  const ids = (Array.isArray(req.body?.userIds) ? req.body.userIds : []).filter(isObjectId);
  if (!ids.length) throw httpError(400, "Select at least one staff member");
  const { attendanceMode, branchId, isActive } = req.body;
  const patch = await parseProfile({ attendanceMode, branchId, isActive });
  if (!Object.keys(patch).length) throw httpError(400, "Nothing to change");

  const users = await User.find({ _id: { $in: ids } });
  let modified = 0;
  const skipped = [];
  for (const user of users) {
    const nextMode = patch.attendanceMode ?? user.attendanceMode;
    const nextBranch = patch.branchId !== undefined ? patch.branchId : user.branchId;
    if (nextMode === "WIFI" && !nextBranch) {
      skipped.push(user.name);
      continue;
    }
    const before = {
      name: user.name,
      isActive: user.isActive,
      attendanceMode: user.attendanceMode,
      branchId: String(user.branchId || ""),
      shiftStart: user.shiftStart,
      shiftEnd: user.shiftEnd,
    };
    Object.assign(user, patch);
    await user.save();
    await afterChange(user, before, patch);
    modified += 1;
  }
  ok(res, { modified, skipped, message: skipped.length ? `${skipped.length} skipped (no branch): ${skipped.join(", ")}` : "Updated" });
});

// ---------------- delete ----------------
async function removeUser(id) {
  if (!isObjectId(id)) throw httpError(400, "Invalid id");
  const user = await User.findById(id);
  if (!user) throw httpError(404, "User not found");
  await engine.closeOpenSessionFor(user._id, "MANUAL");
  // attendance history is kept (records carry the employee's name)
  await Promise.all([
    Device.deleteMany({ userId: user._id }),
    Notification.deleteMany({ recipientType: "user", recipientId: user._id }),
    Leave.deleteMany({ userId: user._id, status: { $in: ["Pending"] } }),
    Regularization.deleteMany({ userId: user._id, status: "Pending" }),
  ]);
  await User.deleteOne({ _id: user._id });
}

const remove = handle(async (req, res) => {
  await removeUser(req.params.id);
  ok(res, { message: "User deleted successfully" });
});

module.exports = { list, getOne, create, update, updateAccountByAdmin, resetPassword, bulk, remove, deleteAccount: remove };
