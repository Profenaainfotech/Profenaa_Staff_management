// =====================================================================
// PROJECTS
//
//   Admin  : create (Internal / External), edit, delete, see everything,
//            correct a status
//   Staff  : see the project pool, take a project (self-assign, optionally
//            start it straight away), start, complete - ONE project at a time
//   Everyone: the leaderboard (who completes the most projects, on time)
//
// Every route is protected (see routers/Project.route.js). The person who is
// acting always comes from the login token, never from the request body.
// =====================================================================
const fs = require("fs");
const path = require("path");
const Project = require("../Models/Project.Model");
const ProjectClaim = require("../Models/ProjectClaim.Model");
const ProjectSlot = require("../Models/ProjectSlot.Model");
const User = require("../Models/User.Model");
const notify = require("../Services/notification.service");
const { ok, fail, handle, isObjectId, httpError } = require("../Utils/http");

const TYPES = ["Internal", "External"];
const STATUSES = ["Pending", "In Progress", "Submitted", "Completed"];
const ACTIVE = ["Pending", "In Progress", "Submitted"]; // a person can hold only one of these at a time
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

/** A submission link (GitHub, Drive, or any other web link) must be a real, well-formed http(s) address */
function parseLink(value) {
  const link = clean(value, 500);
  if (!link) throw httpError(400, "Add a link (GitHub, Drive, or any other) to the work you completed.");
  let url;
  try {
    url = new URL(link);
  } catch {
    throw httpError(400, "That does not look like a valid link. Include the full address, e.g. https://...");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw httpError(400, "The link must start with http:// or https://");
  return link;
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

const assignedFields = (user, by) => ({
  assignmentType: "Admin",
  assignedTo: user._id,
  assignedToName: user.name,
  assignedAt: new Date(),
  assignedBy: by || "Admin",
});

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
      ...(owner ? assignedFields(owner, req.admin?.name) : poolFields()),
    });

    if (owner) {
      notify.notifyUser(owner._id, {
        category: "project",
        type: "PROJECT_ASSIGNED",
        severity: "info",
        title: "New project assigned to you",
        message: project.title,
        link: "My Projects",
      });
    } else {
      announcePool(project);
    }

    await project.populate("assignedTo", POPULATE);
    return ok(
      res,
      {
        message: owner
          ? `${project.projectType} project created and assigned to ${owner.name}.`
          : `${project.projectType} project created and added to the project pool.`,
        project,
      },
      201
    );
  } catch (err) {
    removeFiles(uploaded); // a rejected request must not leave images behind
    throw err;
  }
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

    // assignment: only while nobody has started it
    let assignment = null;
    const previousHolder = project.assignedTo;
    if (req.body.assignedTo !== undefined) {
      const wanted = String(req.body.assignedTo || "");
      const currentId = project.assignedTo ? String(project.assignedTo) : "";
      if (wanted !== currentId) {
        if (project.status !== "Pending") {
          throw httpError(409, project.status === "Completed" ? "A completed project cannot be reassigned." : `This project is already in progress with ${project.assignedToName || "someone"}. It cannot be reassigned.`);
        }
        assignment = wanted ? assignedFields(await findStaff(wanted), req.admin?.name) : poolFields();
      }
    }

    Object.assign(project, f, { images, cardImage: images[0] || "" });
    if (assignment) Object.assign(project, assignment);
    await project.save();
    removeFiles(removing);

    if (assignment) await releaseSlot(previousHolder);

    if (assignment && assignment.assignedTo) {
      notify.notifyUser(assignment.assignedTo, {
        category: "project",
        type: "PROJECT_ASSIGNED",
        severity: "info",
        title: "A project was assigned to you",
        message: project.title,
        link: "My Projects",
      });
    } else if (assignment) {
      await releaseClaim(project._id);
      announcePool(project);
    }

    await project.populate("assignedTo", POPULATE);
    return ok(res, { message: "Project updated successfully.", project });
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

  if (project.assignedTo && project.status !== "Completed") {
    notify.notifyUser(project.assignedTo, {
      category: "project",
      type: "PROJECT_REMOVED",
      severity: "warning",
      title: "A project was removed",
      message: `"${project.title}" was removed by the administrator.`,
      link: "My Projects",
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
    const busy = await Project.findOne({ assignedTo: userId, status: { $in: ACTIVE } }).select("title");
    if (busy) throw httpError(400, `You already have an active project ("${busy.title}"). Finish it (or wait for admin approval) before taking another one.`);
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
// TAKE A PROJECT (self-assign)  - optionally start it straight away
//   { start: true }  = "Assign to me and start working"
//
// Rules: it must still be in the pool, and the person must not already hold
// an unfinished project (one at a time). It is claimed atomically, so two
// people clicking at the same moment can never both get it.
// =====================================================================
const selfAssignProject = handle(async (req, res) => {
  const { projectId } = req.params;
  if (!isObjectId(projectId)) throw httpError(400, "Invalid project.");
  const user = await User.findById(req.actor.id);
  if (!user || user.isActive === false) throw httpError(403, "Your account cannot take projects.");

  const busy = await Project.findOne({ assignedTo: user._id, status: { $in: ACTIVE } }).select("title status");
  if (busy) {
    return fail(res, 400, `You already have an active project ("${busy.title}"). Finish it (or wait for admin approval) before taking another one.`, { activeProject: busy });
  }

  const start = req.body?.start === true || req.body?.start === "true";

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
  const now = new Date();
  const project = await Project.findOneAndUpdate(
    { _id: projectId, assignedTo: null, assignmentType: "Pool", status: "Pending" },
    {
      $set: {
        assignmentType: "Self",
        assignedTo: user._id,
        assignedToName: user.name,
        assignedAt: now,
        assignedBy: "Self Assignment",
        status: start ? "In Progress" : "Pending",
        startedAt: start ? now : null,
      },
    },
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

  notify.notifyAdmins({
    category: "project",
    type: "PROJECT_TAKEN",
    severity: "info",
    title: `${user.name} ${start ? "started" : "took"} a project`,
    message: `${project.title} (${project.projectType})`,
    link: "Projects",
    dedupeKey: `proj-take:${project._id}:${user._id}`,
  });

  await project.populate("assignedTo", POPULATE);
  return ok(res, { message: start ? "Project assigned to you and started. Good luck!" : "Project assigned to you.", project });
});

// =====================================================================
// START  (the person who holds it)
// =====================================================================
const startProject = handle(async (req, res) => {
  const { projectId } = req.params;
  if (!isObjectId(projectId)) throw httpError(400, "Invalid project.");
  const project = await Project.findById(projectId);
  if (!project) throw httpError(404, "Project not found.");
  if (!project.assignedTo || String(project.assignedTo) !== String(req.actor.id)) throw httpError(403, "You are not authorized to start this project.");
  if (project.status === "Completed") throw httpError(400, "A completed project cannot be started again.");
  if (project.status === "In Progress") return ok(res, { message: "This project is already in progress.", project });

  project.status = "In Progress";
  project.startedAt = new Date();
  await project.save();
  return ok(res, { message: "Project started successfully.", project });
});

// =====================================================================
// SUBMIT FOR REVIEW  (the person who holds it)
//
// Staff no longer mark their own project Completed. Instead they submit a link to their
// work (GitHub, Drive, or anything else); an admin opens it, checks it, and only the admin
// can then mark the project Completed (or send it back for changes).
// =====================================================================
const submitProject = handle(async (req, res) => {
  const { projectId } = req.params;
  if (!isObjectId(projectId)) throw httpError(400, "Invalid project.");
  const project = await Project.findById(projectId);
  if (!project) throw httpError(404, "Project not found.");
  if (!project.assignedTo || String(project.assignedTo) !== String(req.actor.id)) throw httpError(403, "You are not authorized to submit this project.");
  if (project.status === "Completed") throw httpError(400, "This project is already completed.");
  if (project.status === "Submitted") throw httpError(400, "This project is already submitted and waiting for admin review.");
  if (project.status !== "In Progress") throw httpError(400, "Start working on the project before submitting it.");

  const link = parseLink(req.body?.link);
  project.status = "Submitted";
  project.submissionLink = link;
  project.submittedAt = new Date();
  await project.save();

  notify.notifyAdmins({
    category: "project",
    type: "PROJECT_SUBMITTED",
    severity: "info",
    title: `${project.assignedToName || "Someone"} submitted work for review`,
    message: project.title,
    link: "Projects",
  });

  await project.populate("assignedTo", POPULATE);
  return ok(res, { message: "Submitted for admin review. You will be told once it is checked.", project });
});

// =====================================================================
// STATUS  (the person who holds it: forward only, and never straight to
// Completed - that needs an admin's approval; an admin can correct anything)
// =====================================================================
const updateProjectStatus = handle(async (req, res) => {
  const { projectId } = req.params;
  const { status } = req.body || {};
  if (!isObjectId(projectId)) throw httpError(400, "Invalid project.");
  if (!STATUSES.includes(status)) throw httpError(400, "Invalid project status.");
  const project = await Project.findById(projectId);
  if (!project) throw httpError(404, "Project not found.");

  const admin = isAdmin(req);
  if (!admin && (!project.assignedTo || String(project.assignedTo) !== String(req.actor.id))) {
    throw httpError(403, "You are not authorized to update this project.");
  }
  if (!project.assignedTo && status !== "Pending") throw httpError(400, "Assign the project to a staff member first.");

  const from = project.status;
  if (from === status) return ok(res, { message: "Project status updated successfully.", project });

  if (!admin) {
    if (status === "Submitted") throw httpError(400, "Submit your work with a link, so an admin can review it.");
    if (status === "Completed") throw httpError(400, "Only an admin can mark a project completed, after reviewing your submission.");
    const forward = from === "Pending" && status === "In Progress";
    if (!forward) throw httpError(400, `A project cannot go back from ${from} to ${status}. Ask an administrator.`);
  }

  const now = new Date();
  project.status = status;
  if (status === "Pending") {
    project.startedAt = null;
  } else if (!project.startedAt) {
    project.startedAt = now;
  }

  if (status === "Completed") {
    // "On time" is judged by when the staff member actually finished (submitted), not by
    // how quickly the admin got round to approving it.
    const finishedAt = from === "Submitted" && project.submittedAt ? new Date(project.submittedAt) : now;
    project.completedAt = now;
    project.completedOnTime = project.dueDate ? finishedAt.getTime() <= new Date(project.dueDate).getTime() : null;
    project.completionMinutes = Math.max(0, Math.round((finishedAt.getTime() - new Date(project.startedAt).getTime()) / 60000));
  } else {
    // moved out of Completed by an administrator: the result no longer counts
    project.completedAt = null;
    project.completedOnTime = null;
    project.completionMinutes = null;
  }

  // sent back from Submitted without approving it: clear the old link, the resubmission must be fresh
  const sentBack = from === "Submitted" && status !== "Completed";
  if (sentBack) {
    project.submissionLink = "";
    project.submittedAt = null;
  }

  await project.save();
  if (status === "Completed") await releaseSlot(project.assignedTo);

  if (status === "Completed" && project.assignedTo) {
    notify.notifyUser(project.assignedTo, {
      category: "project",
      type: "PROJECT_APPROVED",
      severity: project.completedOnTime === false ? "warning" : "success",
      title: "Your submission was approved",
      message: `${project.title} - ${project.completedOnTime === false ? "marked completed (after the validity time)" : "marked completed on time"}.`,
      link: "My Projects",
    });
  } else if (sentBack && project.assignedTo) {
    notify.notifyUser(project.assignedTo, {
      category: "project",
      type: "PROJECT_SENT_BACK",
      severity: "warning",
      title: "Your submission needs changes",
      message: `${project.title} - please review it and submit again.`,
      link: "My Projects",
    });
  }
  await project.populate("assignedTo", POPULATE);
  return ok(res, { message: "Project status updated successfully.", project });
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
      pending: count((p) => p.status === "Pending"),
      inProgress: count((p) => p.status === "In Progress"),
      submitted: count((p) => p.status === "Submitted"),
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
// Points: 10 for every project completed on time, 5 for a late one.
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
    Project.find(typeFilter(req.query)).select("assignedTo status dueDate completedAt completedOnTime completionMinutes assignmentType").lean(),
    User.find({ isActive: { $ne: false } }).select("name role").lean(),
  ]);

  const rows = new Map(
    staff.map((u) => [String(u._id), { userId: u._id, name: u.name, role: u.role || "", assigned: 0, active: 0, completed: 0, onTime: 0, late: 0, minutes: 0, timed: 0 }])
  );
  const now = Date.now();
  const team = { total: projects.length, available: 0, pending: 0, inProgress: 0, submitted: 0, completed: 0, overdue: 0 };

  for (const p of projects) {
    if (p.status === "Completed") team.completed += 1;
    else if (p.status === "Submitted") team.submitted += 1;
    else if (p.status === "In Progress") team.inProgress += 1;
    else if (p.assignedTo) team.pending += 1;
    else team.available += 1;
    if (p.status !== "Completed" && p.dueDate && new Date(p.dueDate).getTime() < now) team.overdue += 1;

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
  updateProject,
  deleteProject,
  getAllProjects,
  getUserProjects,
  getProjectPool,
  selfAssignProject,
  startProject,
  submitProject,
  updateProjectStatus,
  getUserProjectStats,
  getLeaderboard,
};