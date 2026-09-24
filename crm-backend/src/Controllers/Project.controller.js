// =====================================================================
// PROJECTS
//
//   Admin  : create (Internal / External / Technologies), edit, delete, see everything
//   Staff  : see the project pool, take a project (self-assign) - ONE at a time
//   Everyone: the leaderboard (who completes the most projects, on time)
//
// A project is a CATALOG entry. The moment someone is assigned to it - by the
// admin, or by self-assigning - a Task is created for them (see Task.Model /
// Task.controller) and THAT is where the real work happens: starting it,
// submitting a link, being marked complete. There is one evaluation flow, not
// two - this controller never tracks progress itself, it only mirrors the
// linked task's outcome back for reporting and the leaderboard (see
// Task.controller's syncProjectFromTask).
//
// Every route is protected (see routers/Project.route.js). The person who is
// acting always comes from the login token, never from the request body.
// =====================================================================
const fs = require("fs");
const path = require("path");
const Project = require("../Models/Project.Model");
const ProjectClaim = require("../Models/ProjectClaim.Model");
const ProjectSlot = require("../Models/ProjectSlot.Model");
const Task = require("../Models/Task.Model");
const TechTask = require("../Models/TechTask.Model");
const User = require("../Models/User.Model");
const notify = require("../Services/notification.service");
const { ok, fail, handle, isObjectId, httpError } = require("../Utils/http");
const { dateKey } = require("../Utils/time");
const catalog = require("../Utils/Technologycatalog");

const TYPES = ["Internal", "External", "Technologies"];
const MAX_IMAGES = 10;
const UPLOAD_PREFIX = "/uploads/projects/";
const UPLOAD_DIR = path.join(__dirname, "../../uploads/projects");

const POPULATE = "name email mobile";
const STALE_CLAIM_MS = 15 * 1000;

// ---------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------
const clean = (v, max) => String(v ?? "").trim().slice(0, max);
const isAdmin = (req) => req.actor?.type === "admin";

/** Delete stored image files (best effort, only inside the projects upload folder) */
function removeFiles(paths = []) {
  for (const p of paths) {
    if (typeof p !== "string" || !p.startsWith(UPLOAD_PREFIX)) continue;
    const file = path.join(UPLOAD_DIR, path.basename(p));
    fs.unlink(file, () => {});
  }
}

/** Every image path uploaded with this request, cover image first */
function uploadedPaths(req) {
  const f = req.files || {};
  return [...(f.cardImage || []), ...(f.images || [])].map((x) => `${UPLOAD_PREFIX}${x.filename}`);
}

/** All images of a project as one list (the cover is always the first one) */
const imageList = (project) => [...new Set([project.cardImage, ...(project.images || [])].filter(Boolean))];

/** The validity time is optional: empty/absent simply means "no due date". A value that IS given must be a real date. */
function parseDue(value, { mustBeFuture }) {
  if (value === undefined || value === null || value === "") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw httpError(400, "The validity time is not a valid date.");
  if (mustBeFuture && d.getTime() < Date.now() + 60 * 1000) throw httpError(400, "The validity time must be in the future.");
  return d;
}

/** Validate the text fields shared by create and edit */
function readFields(body, { creating, current }) {
  const title = clean(body.title, 200);
  if (title.length < 3) throw httpError(400, "Project title is required (at least 3 characters).");
  if (title.length > 120) throw httpError(400, "Project title is too long (maximum 120 characters).");

  const issueDetails = clean(body.issueDetails, 1000);
  if (issueDetails.length < 5) throw httpError(400, "Describe the error or change that has to be made (at least 5 characters).");

  const description = clean(body.description, 2000);
  if (description.length < 10) throw httpError(400, "Project description is required (at least 10 characters).");

  const rawType = body.projectType || body.projectCategory; // the screen used to send "projectCategory"
  let projectType = current?.projectType || "Internal";
  if (rawType !== undefined && rawType !== "") {
    if (!TYPES.includes(rawType)) throw httpError(400, "Project type must be Internal or External.");
    // Technologies projects have their own form (domains + work items), never this one
    if (rawType === "Technologies" && current?.projectType !== "Technologies") throw httpError(400, "Technologies projects are created from the Technologies form.");
    projectType = rawType;
  }

  // Optional: on create, no dueDate sent = no validity time. On edit, not sending the field at
  // all leaves the existing due date untouched; sending it (even empty, to clear it) updates it.
  let dueDate = current?.dueDate || null;
  if (creating) {
    dueDate = parseDue(body.dueDate, { mustBeFuture: true });
  } else if (body.dueDate !== undefined) {
    dueDate = parseDue(body.dueDate, { mustBeFuture: true });
  }

  return { title, issueDetails, description, projectType, dueDate };
}

async function findStaff(id) {
  if (!isObjectId(id)) throw httpError(400, "Select a valid staff member.");
  const user = await User.findById(id);
  if (!user) throw httpError(404, "The selected staff member does not exist.");
  if (user.isActive === false) throw httpError(400, "The selected staff member is deactivated.");
  return user;
}

const poolFields = () => ({
  assignmentType: "Pool",
  assignedTo: null,
  assignedToName: "",
  assignedAt: null,
  assignedBy: "",
});

/** The project is back in the pool (or gone): whoever claimed it before no longer holds it */
const releaseClaim = (projectId) => ProjectClaim.deleteOne({ projectId }).catch(() => {});
/** The person is no longer taking / holding a self-assigned project */
const releaseSlot = (userId) => (userId ? ProjectSlot.deleteOne({ userId }).catch(() => {}) : Promise.resolve());

/** The project's issue details folded into the task description, so nothing is lost by merging the two */
const taskDescriptionFor = (project) => [project.issueDetails && `Error / change required: ${project.issueDetails}`, project.description].filter(Boolean).join("\n\n");

/**
 * The one and only place a project becomes real work: create the Task that will actually be
 * tracked (started, submitted, completed), and point the project at it. From here on the
 * project record just mirrors that task's outcome (see Task.controller's syncProjectFromTask) -
 * nothing about progress is decided here.
 */
async function spawnTask(project, user, assignedBy) {
  const now = new Date();
  const task = await Task.create({
    title: project.title,
    description: taskDescriptionFor(project),
    assignedTo: user._id,
    assignedToName: user.name,
    assignedBy: assignedBy || "Admin",
    assignedAt: now,
    dueDate: project.dueDate,
    status: "Pending",
    projectId: project._id,
    projectType: project.projectType,
    domains: project.domains || [],
    workItems: project.workItems || [],
  });
  project.taskId = task._id;
  project.assignmentType = assignedBy === "Self Assignment" ? "Self" : "Admin";
  project.assignedTo = user._id;
  project.assignedToName = user.name;
  project.assignedBy = assignedBy || "Admin";
  project.assignedAt = now;
  project.startedAt = now;
  project.status = "Assigned";
  await project.save();

  notify.notifyUser(user._id, {
    category: "task",
    type: "TASK_ASSIGNED",
    severity: "info",
    title: "New task assigned",
    message: `${task.title}${task.dueDate ? ` · due ${new Date(task.dueDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}` : ""}`,
    link: "My Tasks",
  });
  return task;
}

function announcePool(project) {
  User.find({ isActive: { $ne: false } })
    .select("_id")
    .lean()
    .then((users) =>
      notify.notifyUsers(
        users.map((u) => u._id),
        {
          category: "project",
          type: "PROJECT_IN_POOL",
          severity: "info",
          title: `New ${project.projectType.toLowerCase()} project available`,
          message: project.title,
          link: "My Projects",
        }
      )
    )
    .catch(() => {});
}

// =====================================================================
// CREATE  (admin)
// =====================================================================
const createProject = handle(async (req, res) => {
  const uploaded = uploadedPaths(req);
  try {
    const f = readFields(req.body, { creating: true });
    if (uploaded.length > MAX_IMAGES) throw httpError(400, `You can add at most ${MAX_IMAGES} images.`);

    let owner = null;
    if (req.body.assignedTo) owner = await findStaff(req.body.assignedTo);

    const project = await Project.create({
      ...f,
      cardImage: uploaded[0] || "",
      images: uploaded,
      createdBy: req.admin?.name || "Admin",
      status: "Pending",
      ...poolFields(),
    });

    let message = `${project.projectType} project created and added to the project pool.`;
    if (owner) {
      await spawnTask(project, owner, req.admin?.name);
      message = `${project.projectType} project created and added to ${owner.name}'s tasks.`;
    } else {
      announcePool(project);
    }

    await project.populate("assignedTo", POPULATE);
    return ok(res, { message, project }, 201);
  } catch (err) {
    removeFiles(uploaded); // a rejected request must not leave images behind
    throw err;
  }
});

// =====================================================================
// TECHNOLOGIES  (admin)
//
// A Technologies project is a title + one staff member + the work items the admin ticked
// (each item belongs to a domain: Sales, Training, Marketing, Placement, HR, Social Media -
// see Utils/Technologycatalog). Staff are always chosen up front, so it goes straight to
// that person as a task; it never enters the pool.
// =====================================================================
const getTechnologycatalog = handle(async (req, res) => ok(res, { domains: catalog.DOMAINS, items: catalog.ITEMS }));

const createTechnologyProject = handle(async (req, res) => {
  const title = clean(req.body.title, 200);
  if (title.length < 3) throw httpError(400, "Project title is required (at least 3 characters).");
  if (title.length > 120) throw httpError(400, "Project title is too long (maximum 120 characters).");

  if (!req.body.assignedTo) throw httpError(400, "Select the staff member this project is for.");
  const owner = await findStaff(req.body.assignedTo);

  const ids = Array.isArray(req.body.workItemIds) ? req.body.workItemIds : [];
  if (!ids.length) throw httpError(400, "Tick at least one work item.");
  const workItems = catalog.resolveItems(ids);
  if (!workItems) throw httpError(400, "One of the selected work items does not exist. Reload the form and try again.");
  const domains = catalog.domainsOf(workItems);

  const project = await Project.create({
    title,
    projectType: "Technologies",
    domains,
    workItems,
    description: `${domains.join(", ")} · ${workItems.length} work item${workItems.length === 1 ? "" : "s"}: ${workItems.map((i) => i.title).join("; ")}`.slice(0, 2000),
    createdBy: req.admin?.name || "Admin",
    status: "Pending",
    ...poolFields(),
  });
  await spawnTask(project, owner, req.admin?.name); // a summary task, so it also shows on their dashboard and in My Tasks

  // One TechTask per ticked work item, for the SAME person - these are what actually turn
  // into tick boxes in their Daily Report and feed the daily percentage (see
  // Services/techWork.service.js). Without this, ticking the items in the catalog would only
  // ever create a summary task and never show up for the staff member to tick off daily.
  const today = dateKey();
  const techTasks = await TechTask.insertMany(
    workItems.map((item) => ({
      title: item.title,
      kind: "Task",
      technology: item.domain,
      assignedTo: owner._id,
      assignedToName: owner.name,
      assignedBy: req.admin?.name || "Admin",
      startDate: today,
      endDate: "",
    }))
  );
  project.techTaskIds = techTasks.map((t) => t._id);
  await project.save();

  await Promise.all(
    techTasks.map((t) =>
      notify.notifyUser(owner._id, {
        category: "task",
        type: "TECH_TASK_ALLOCATED",
        severity: "info",
        title: "Technologies task allocated to you",
        message: `${t.title} - tick it in your Daily Report on the days you complete it.`,
        link: "Daily Report",
      })
    )
  );

  await project.populate("assignedTo", POPULATE);
  return ok(res, { message: `Technologies project created and assigned to ${owner.name}. It now shows as ${workItems.length} tickable item${workItems.length === 1 ? "" : "s"} in their Daily Report.`, project }, 201);
});

// =====================================================================
// EDIT  (admin)
// =====================================================================
const updateProject = handle(async (req, res) => {
  const uploaded = uploadedPaths(req);
  try {
    if (!isObjectId(req.params.projectId)) throw httpError(400, "Invalid project.");
    const project = await Project.findById(req.params.projectId);
    if (!project) throw httpError(404, "Project not found.");
    if (project.projectType === "Technologies") throw httpError(409, "A Technologies project cannot be edited. Delete it and create it again with the right work items.");

    const f = readFields(req.body, { creating: false, current: project });

    // images: keep what the admin did not remove, add the new ones
    let removed = [];
    if (req.body.removeImages) {
      try {
        removed = JSON.parse(req.body.removeImages);
      } catch {
        throw httpError(400, "The list of removed images is not valid.");
      }
      if (!Array.isArray(removed)) throw httpError(400, "The list of removed images is not valid.");
    }
    const before = imageList(project);
    const removing = before.filter((p) => removed.includes(p));
    const images = [...before.filter((p) => !removed.includes(p)), ...uploaded];
    if (images.length > MAX_IMAGES) throw httpError(400, `A project can have at most ${MAX_IMAGES} images.`);

    // assignment: only while nobody has been assigned yet (once a task exists, manage it there)
    let newOwnerId;
    if (req.body.assignedTo !== undefined) {
      const wanted = String(req.body.assignedTo || "");
      const currentId = project.assignedTo ? String(project.assignedTo) : "";
      if (wanted !== currentId) {
        if (project.status !== "Pending") {
          throw httpError(409, project.status === "Completed" ? "A completed project cannot be reassigned." : `This project has already been assigned to ${project.assignedToName || "someone"}. Manage it from Tasks instead.`);
        }
        newOwnerId = wanted || null;
      }
    }

    Object.assign(project, f, { images, cardImage: images[0] || "" });
    await project.save();
    removeFiles(removing);

    let message = "Project updated successfully.";
    if (newOwnerId) {
      const owner = await findStaff(newOwnerId);
      await spawnTask(project, owner, req.admin?.name);
      message = `Project updated and added to ${owner.name}'s tasks.`;
    }

    await project.populate("assignedTo", POPULATE);
    return ok(res, { message, project });
  } catch (err) {
    removeFiles(uploaded);
    throw err;
  }
});

// =====================================================================
// DELETE  (admin)
// =====================================================================
const deleteProject = handle(async (req, res) => {
  if (!isObjectId(req.params.projectId)) throw httpError(400, "Invalid project.");
  const project = await Project.findById(req.params.projectId);
  if (!project) throw httpError(404, "Project not found.");

  await Project.deleteOne({ _id: project._id });
  await releaseClaim(project._id);
  if (project.status !== "Completed") await releaseSlot(project.assignedTo);
  removeFiles(imageList(project));

  // the linked task (if any, and not already completed) goes with it - nothing orphaned
  if (project.taskId) {
    const task = await Task.findById(project.taskId);
    if (task && task.status !== "Completed") await Task.deleteOne({ _id: task._id });
  }
  // Technologies: its tick-able work items go too, so they stop showing in Daily Reports
  if (project.techTaskIds?.length) await TechTask.deleteMany({ _id: { $in: project.techTaskIds } });

  if (project.assignedTo && project.status !== "Completed") {
    notify.notifyUser(project.assignedTo, {
      category: "project",
      type: "PROJECT_REMOVED",
      severity: "warning",
      title: "A project was removed",
      message: `"${project.title}" was removed by the administrator.`,
      link: "My Tasks",
    });
  }
  return ok(res, { message: "Project deleted.", projectId: String(project._id) });
});

// =====================================================================
// LISTS
// =====================================================================
const typeFilter = (query) => (TYPES.includes(query.type) ? { projectType: query.type } : {});

/** Admin: everything (?type=Internal|External) */
const getAllProjects = handle(async (req, res) => {
  const projects = await Project.find(typeFilter(req.query)).populate("assignedTo", POPULATE).sort({ createdAt: -1 });
  return ok(res, { count: projects.length, projects });
});

/** The pool: not taken by anyone yet (?type=Internal|External) */
const getProjectPool = handle(async (req, res) => {
  const projects = await Project.find({ assignedTo: null, assignmentType: "Pool", status: "Pending", ...typeFilter(req.query) }).sort({ createdAt: -1 });
  return ok(res, { count: projects.length, projects });
});

/** Projects held by one person (that person, or an admin) */
const getUserProjects = handle(async (req, res) => {
  const { userId } = req.params;
  if (!isObjectId(userId)) throw httpError(400, "Invalid user.");
  if (!isAdmin(req) && String(req.actor.id) !== userId) throw httpError(403, "You can only see your own projects.");
  const projects = await Project.find({ assignedTo: userId, ...typeFilter(req.query) })
    .populate("assignedTo", POPULATE)
    .sort({ createdAt: -1 });
  return ok(res, { count: projects.length, projects });
});

/**
 * One project at a time, even when someone clicks two projects at the same instant:
 * only one of those requests can get the person's slot. A slot left behind by a crash is
 * recognised (the person holds nothing) and cleaned up once it is a few seconds old.
 */
async function acquireSlot(userId) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await ProjectSlot.create({ userId });
      return;
    } catch (err) {
      if (err.code !== 11000) throw err;
    }
    const busy = await Project.findOne({ assignedTo: userId, status: "Assigned" }).select("title");
    if (busy) throw httpError(400, `You already have an active project ("${busy.title}"). Finish it (see My Tasks) before taking another one.`);
    const slot = await ProjectSlot.findOne({ userId });
    if (slot && Date.now() - new Date(slot.createdAt).getTime() > STALE_CLAIM_MS) {
      await ProjectSlot.deleteOne({ _id: slot._id });
      continue;
    }
    throw httpError(409, "You are already taking another project. Please wait a moment.");
  }
  throw httpError(409, "You are already taking another project. Please wait a moment.");
}

/**
 * Claim a pool project for one person. Exactly one caller succeeds; everybody else gets a
 * clear "already taken" answer. A claim left behind on a project that is back in the pool
 * (for example after a manual database fix) is cleaned up once it is a few seconds old.
 */
async function claim(projectId, userId) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await ProjectClaim.create({ projectId, userId });
      return;
    } catch (err) {
      if (err.code !== 11000) throw err;
    }
    const [project, existing] = await Promise.all([
      Project.findById(projectId).select("assignedTo assignedToName assignmentType status"),
      ProjectClaim.findOne({ projectId }),
    ]);
    if (!project) throw httpError(404, "Project not found.");
    if (project.assignedToName) {
      throw httpError(409, project.assignmentType === "Self" ? `Sorry, ${project.assignedToName} has already taken this project.` : `This project is already assigned to ${project.assignedToName}.`);
    }
    const inPool = !project.assignedTo && project.assignmentType === "Pool" && project.status === "Pending";
    const old = existing && Date.now() - new Date(existing.createdAt).getTime() > STALE_CLAIM_MS;
    if (inPool && old) {
      await ProjectClaim.deleteOne({ _id: existing._id });
      continue; // try once more
    }
    throw httpError(409, "Someone else is taking this project right now. Please pick another one.");
  }
  throw httpError(409, "Someone else is taking this project right now. Please pick another one.");
}

// =====================================================================
// TAKE A PROJECT (self-assign)
//
// It must still be in the pool, and the person must not already hold an unfinished project
// (one at a time). It is claimed atomically, so two people clicking at the same moment can
// never both get it. Taking it immediately creates the matching task - there is no separate
// "started" step here, starting the actual work happens on the task.
// =====================================================================
const selfAssignProject = handle(async (req, res) => {
  const { projectId } = req.params;
  if (!isObjectId(projectId)) throw httpError(400, "Invalid project.");
  const user = await User.findById(req.actor.id);
  if (!user || user.isActive === false) throw httpError(403, "Your account cannot take projects.");

  const busy = await Project.findOne({ assignedTo: user._id, status: "Assigned" }).select("title");
  if (busy) {
    return fail(res, 400, `You already have an active project ("${busy.title}"). Finish it (see My Tasks) before taking another one.`, { activeProject: busy });
  }

  // 1) my slot (one project at a time), then the claim on the project itself:
  //    the unique indexes let exactly ONE request through, however many click at once
  await acquireSlot(user._id);
  try {
    await claim(projectId, user._id);
  } catch (err) {
    await releaseSlot(user._id);
    throw err;
  }

  // 2) the claim is ours: take the project
  const project = await Project.findOneAndUpdate(
    { _id: projectId, assignedTo: null, assignmentType: "Pool", status: "Pending" },
    { $set: { assignmentType: "Self", assignedTo: user._id, assignedToName: user.name } },
    { returnDocument: "after" }
  );

  if (!project) {
    await releaseClaim(projectId); // it was not takeable after all (deleted, or given to someone by an admin)
    await releaseSlot(user._id);
    const existing = await Project.findById(projectId).select("assignedToName assignmentType");
    if (!existing) throw httpError(404, "Project not found.");
    if (existing.assignedToName) throw httpError(409, `This project is already assigned to ${existing.assignedToName}.`);
    throw httpError(400, "This project is not available for self-assignment.");
  }

  // 3) two DIFFERENT projects taken at the very same moment: only the first one is kept
  const holding = await Project.find({ assignedTo: user._id, status: "Assigned" }).sort({ createdAt: 1, _id: 1 }).select("_id");
  if (holding.length > 1 && String(holding[0]._id) !== String(project._id)) {
    await Project.updateOne({ _id: project._id, assignedTo: user._id }, { $set: poolFields() });
    await releaseClaim(project._id);
    throw httpError(409, "You already have an active project. Complete it before taking another one.");
  }

  await spawnTask(project, user, "Self Assignment");

  notify.notifyAdmins({
    category: "project",
    type: "PROJECT_TAKEN",
    severity: "info",
    title: `${user.name} took a project`,
    message: `${project.title} (${project.projectType})`,
    link: "Tasks",
    dedupeKey: `proj-take:${project._id}:${user._id}`,
  });

  await project.populate("assignedTo", POPULATE);
  return ok(res, { message: "Successfully added to your tasks. Find it under My Tasks.", project });
});

// =====================================================================
// ONE PERSON'S NUMBERS
// =====================================================================
const getUserProjectStats = handle(async (req, res) => {
  const { userId } = req.params;
  if (!isObjectId(userId)) throw httpError(400, "Invalid user.");
  if (!isAdmin(req) && String(req.actor.id) !== userId) throw httpError(403, "You can only see your own numbers.");
  const projects = await Project.find({ assignedTo: userId }).select("status completedOnTime").lean();
  const count = (fn) => projects.filter(fn).length;
  return ok(res, {
    stats: {
      total: projects.length,
      assigned: count((p) => p.status === "Assigned"),
      completed: count((p) => p.status === "Completed"),
      onTime: count((p) => p.status === "Completed" && p.completedOnTime !== false),
      late: count((p) => p.status === "Completed" && p.completedOnTime === false),
    },
  });
});

// =====================================================================
// LEADERBOARD  (the staff competition)
//   ?type=Internal|External   (default: all)
//   ?period=all|month|week    (which completions count; default: all)
//
// Points: 10 for every project completed on time, 5 for a late one. The completion itself is
// decided on the linked task (see Task.controller) and mirrored here - this just reports it.
// Rank: points, then completed, then the quickest average time.
// =====================================================================
const POINTS_ON_TIME = 10;
const POINTS_LATE = 5;

function periodStart(period) {
  const now = new Date();
  if (period === "week") return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (period === "month") {
    // first day of this month, India time
    const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
    return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1) - 5.5 * 60 * 60 * 1000);
  }
  return null;
}

const getLeaderboard = handle(async (req, res) => {
  const period = ["week", "month"].includes(req.query.period) ? req.query.period : "all";
  const since = periodStart(period);
  const [projects, staff] = await Promise.all([
    Project.find(typeFilter(req.query)).select("assignedTo status dueDate completedAt completedOnTime completionMinutes").lean(),
    User.find({ isActive: { $ne: false } }).select("name role").lean(),
  ]);

  const rows = new Map(
    staff.map((u) => [String(u._id), { userId: u._id, name: u.name, role: u.role || "", assigned: 0, active: 0, completed: 0, onTime: 0, late: 0, minutes: 0, timed: 0 }])
  );
  const now = Date.now();
  const team = { total: projects.length, available: 0, assigned: 0, completed: 0, overdue: 0 };

  for (const p of projects) {
    if (p.status === "Completed") team.completed += 1;
    else if (p.status === "Assigned") team.assigned += 1;
    else team.available += 1;
    if (p.status === "Assigned" && p.dueDate && new Date(p.dueDate).getTime() < now) team.overdue += 1;

    const row = p.assignedTo ? rows.get(String(p.assignedTo)) : null;
    if (!row) continue;
    row.assigned += 1;
    if (p.status !== "Completed") {
      row.active += 1;
      continue;
    }
    if (since && (!p.completedAt || new Date(p.completedAt) < since)) continue; // outside the chosen period
    row.completed += 1;
    if (p.completedOnTime === false) row.late += 1;
    else row.onTime += 1;
    if (typeof p.completionMinutes === "number") {
      row.minutes += p.completionMinutes;
      row.timed += 1;
    }
  }

  const list = [...rows.values()]
    .map((r) => ({
      userId: r.userId,
      name: r.name,
      role: r.role,
      assigned: r.assigned,
      active: r.active,
      completed: r.completed,
      onTime: r.onTime,
      late: r.late,
      onTimeRate: r.completed ? Math.round((r.onTime / r.completed) * 100) : null,
      avgMinutes: r.timed ? Math.round(r.minutes / r.timed) : null,
      points: r.onTime * POINTS_ON_TIME + r.late * POINTS_LATE,
    }))
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.completed - a.completed ||
        (a.avgMinutes ?? Infinity) - (b.avgMinutes ?? Infinity) ||
        a.name.localeCompare(b.name)
    )
    .map((r, i) => ({ ...r, rank: i + 1 }));

  team.percentComplete = team.total ? Math.round((team.completed / team.total) * 100) : 0;
  const me = req.actor.type === "user" ? list.find((r) => String(r.userId) === String(req.actor.id)) || null : null;
  return ok(res, { type: TYPES.includes(req.query.type) ? req.query.type : "All", period, points: { onTime: POINTS_ON_TIME, late: POINTS_LATE }, team, leaderboard: list, me });
});

module.exports = {
  createProject,
  createTechnologyProject,
  getTechnologycatalog,
  updateProject,
  deleteProject,
  getAllProjects,
  getUserProjects,
  getProjectPool,
  selfAssignProject,
  getUserProjectStats,
  getLeaderboard,
  // shared with Task.controller so a linked task's outcome can be mirrored back
  spawnTask,
  releaseSlot,
};
