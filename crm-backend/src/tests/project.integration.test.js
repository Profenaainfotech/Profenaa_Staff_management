// =====================================================
// PROJECTS + TASKS: ONE MERGED FLOW      node src/tests/project.integration.test.js
//
// Projects are a catalog. The moment someone is assigned - by the admin, or by
// self-assigning - a Task is created and THAT is where all the real tracking happens:
// starting, submitting a link, being marked complete. This suite proves:
//
//  - creating a project (validation, images, optional validity time)
//  - assigning at creation, or later, immediately creates a matching task
//  - self-assigning creates the task too, with the right message, and is race-safe
//  - completing the TASK (submit, or an admin's correction) mirrors back onto the
//    project (status / on-time / minutes) - there is no separate project-side flow
//  - the leaderboard is fed entirely by that mirrored data
//  - deleting a project cleans up its task; editing/reassigning is guarded correctly
//  - every route needs a login; Task routes in particular (previously had none)
//
// !! WIPES the database it connects to; refuses unless the name contains "test".
// =====================================================
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const http = require("http");
const mongoose = require("mongoose");

const app = require("../../app");
const Project = require("../Models/Project.Model");
const Task = require("../Models/Task.Model");
const Notification = require("../Models/Notification.Model");

let pass = 0;
const failures = [];
function check(name, cond, extra) {
  if (cond) {
    pass += 1;
    console.log("  ✓", name);
  } else {
    failures.push(name);
    console.log("  ✗", name, extra !== undefined ? `\n      got: ${JSON.stringify(extra)}` : "");
  }
}
const section = (t) => console.log(`\n${t}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let BASE = "";
async function call(method, p, { token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(BASE + p, { method, headers, body: payload });
  let json = {};
  try {
    json = await res.json();
  } catch (_) {
    /* empty body */
  }
  return { status: res.status, body: json };
}

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const png = (name = "a.png") => [new Blob([PNG], { type: "image/png" }), name];
const inDays = (d) => new Date(Date.now() + d * 24 * 3600 * 1000).toISOString();

function makeForm(fields = {}, images = 0) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) fd.append(k, v);
  for (let i = 0; i < images; i += 1) fd.append("images", ...png(`pic${i}.png`));
  return fd;
}
const good = (over = {}) => ({
  title: "Fix the login page",
  issueDetails: "The submit button does nothing on Safari",
  description: "Users on Safari cannot log in because the button never fires.",
  projectType: "Internal",
  dueDate: inDays(7),
  ...over,
});

const UPLOADS = path.join(__dirname, "../../uploads/projects");
const fileCount = () => (fs.existsSync(UPLOADS) ? fs.readdirSync(UPLOADS).length : 0);

async function run() {
  const filesAtStart = new Set(fs.existsSync(UPLOADS) ? fs.readdirSync(UPLOADS) : []);
  await mongoose.connect(process.env.MONGO_URI);
  if (!/test/i.test(mongoose.connection.name)) throw new Error(`Refusing to wipe database "${mongoose.connection.name}" (name must contain "test")`);
  for (const c of await mongoose.connection.db.collections()) await c.deleteMany({});

  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  BASE = `http://127.0.0.1:${server.address().port}`;
  const P = "/api/Project";
  const T = "/api/Task";

  // ---------------------------------------------- setup
  await call("POST", "/api/admin/register", { body: { name: "Boss", password: "admin123", role: "admin" } });
  const admin = (await call("POST", "/api/admin/login", { body: { name: "Boss", password: "admin123" } })).body.token;
  const mk = async (name, mobile) => (await call("POST", "/api/staff", { token: admin, body: { name, mobile, password: "secret123", role: "Developer", shiftStart: "09:30", shiftEnd: "18:30" } })).body.user;
  const A = await mk("Yokesh", "9400000001");
  const B = await mk("Praveen", "9400000002");
  const C = await mk("Karthik", "9400000003");
  const login = async (name) => (await call("POST", "/api/UserAccounts/Log-in", { body: { name, password: "secret123" } })).body.token;
  const tA = await login("Yokesh");
  const tB = await login("Praveen");
  const tC = await login("Karthik");
  check("admin and three staff are ready", Boolean(admin && A?._id && B?._id && C?._id && tA && tB && tC));
  const notified = async (filter, ms = 2000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const n = await Notification.findOne(filter);
      if (n) return n;
      await sleep(80);
    }
    return null;
  };

  // ================================================== AUTH
  section("Every route needs a login (Project and Task alike)");
  let r = await call("GET", `${P}/get-all-projects`);
  check("project list: 401 with no login", r.status === 401, r);
  r = await call("POST", `${P}/create-project`, { form: makeForm(good()) });
  check("create project: 401 with no login", r.status === 401, r);
  r = await call("GET", `${T}/get-all-tasks`);
  check("task list: 401 with no login (this used to have NO login check at all)", r.status === 401, r);
  r = await call("POST", `${T}/create-task`, { body: { title: "x", assignedTo: A._id } });
  check("create task: 401 with no login", r.status === 401, r);
  r = await call("GET", `${T}/get-all-tasks`, { token: tA });
  check("staff cannot use the admin task list (403)", r.status === 403, r);

  // ================================================== CREATE: VALIDATION (unchanged rules)
  section("Create: validation");
  const before = fileCount();
  const bad = async (over, re, label) => {
    const x = await call("POST", `${P}/create-project`, { token: admin, form: makeForm(good(over)) });
    check(label, x.status === 400 && re.test(x.body.message || ""), x.body);
  };
  await bad({ title: "" }, /title is required/i, "empty title");
  await bad({ issueDetails: "" }, /error or change/i, "the error / change field is required");
  await bad({ description: "short" }, /description is required/i, "description too short");
  await bad({ dueDate: "not-a-date" }, /not a valid date/i, "validity time must be a date");
  await bad({ dueDate: new Date(Date.now() - 3600 * 1000).toISOString() }, /in the future/i, "validity time cannot be in the past");
  r = await call("POST", `${P}/create-project`, { token: admin, form: makeForm(good({ assignedTo: "a".repeat(24) })) });
  check("unknown staff member: 404", r.status === 404 && /does not exist/i.test(r.body.message), r.body);
  r = await call("POST", `${P}/create-project`, { token: admin, form: makeForm(good(), 11) });
  check("more than 10 images is refused", r.status === 400 && /at most 10/i.test(r.body.message), r.body);
  await sleep(200);
  check("rejected requests leave no image files and no project behind", fileCount() === before && (await Project.countDocuments()) === 0);

  r = await call("POST", `${P}/create-project`, { token: admin, form: makeForm(good({ title: "No due date", dueDate: undefined })) });
  check("the validity time is optional", r.status === 201 && r.body.project.dueDate === null, r.body);

  // ================================================== ASSIGNMENT SPAWNS A TASK
  section("Assigning a project - at creation, or by editing it - immediately creates the matching task");
  r = await call("POST", `${P}/create-project`, { token: admin, form: makeForm(good({ title: "Assigned at creation", assignedTo: String(B._id) }), 2) });
  const AS1 = r.body.project;
  check("creating with assignedTo: the project is Assigned, not left Pending", r.status === 201 && AS1.status === "Assigned" && Boolean(AS1.taskId), r.body);
  check("...the success message talks about tasks", /task/i.test(r.body.message), r.body);
  let task1 = await Task.findById(AS1.taskId);
  check("...a real task exists: same title, same due date, same images-derived description, linked back to the project", Boolean(task1) && task1.title === "Assigned at creation" && task1.assignedTo.toString() === String(B._id) && new Date(task1.dueDate).getTime() === new Date(AS1.dueDate).getTime() && String(task1.projectId) === String(AS1._id) && task1.projectType === "Internal" && /Safari/.test(task1.description), task1);
  check("...the task starts Pending, untouched", task1.status === "Pending");
  check("...Praveen was told (the existing task-assignment notification, reused as-is)", Boolean(await notified({ recipientId: B._id, type: "TASK_ASSIGNED" })));
  r = await call("GET", `${T}/user/${B._id}`, { token: tB });
  check("...and it shows up under Praveen's own tasks", r.status === 200 && r.body.tasks.some((t) => String(t._id) === String(AS1.taskId)), r.body);

  const E1 = (await call("POST", `${P}/create-project`, { token: admin, form: makeForm(good({ title: "External unassigned", projectType: "External" })) })).body.project;
  check("an unassigned project stays Pending with no task", E1.status === "Pending" && !E1.taskId, E1);
  r = await call("PUT", `${P}/${E1._id}`, { token: admin, form: makeForm({ ...good({ title: "External unassigned", projectType: "External" }), dueDate: E1.dueDate, assignedTo: String(C._id) }) });
  check("assigning later, via edit, also spawns a task", r.status === 200 && r.body.project.status === "Assigned" && Boolean(r.body.project.taskId), r.body);
  const editTask = await Task.findById(r.body.project.taskId);
  check("...that task is External-flavoured and points back at this project", editTask.projectType === "External" && String(editTask.projectId) === String(E1._id));

  r = await call("PUT", `${P}/${AS1._id}`, { token: admin, form: makeForm({ ...good({ title: "Assigned at creation" }), dueDate: AS1.dueDate, assignedTo: String(A._id) }) });
  check("a project already handed to a task cannot be reassigned this way", r.status === 409 && /already been assigned to Praveen/i.test(r.body.message), r.body);

  // ================================================== SELF-ASSIGN
  section("Self-assign: 'Successfully added to your tasks', one at a time, race-safe");
  const Pool1 = (await call("POST", `${P}/create-project`, { token: admin, form: makeForm(good({ title: "Pool project" })) })).body.project;
  r = await call("PUT", `${P}/self-assign/${Pool1._id}`, { token: admin, body: {} });
  check("an admin cannot use the staff self-assign action (403)", r.status === 403, r);
  r = await call("PUT", `${P}/self-assign/${Pool1._id}`, { token: tA, body: {} });
  check("self-assign: clear message about tasks, no separate 'start' step needed", r.status === 200 && /Successfully added to your tasks/i.test(r.body.message) && r.body.project.status === "Assigned", r.body);
  const selfTask = await Task.findById(r.body.project.taskId);
  check("...it created a real task for Yokesh, Pending, linked to the project", Boolean(selfTask) && selfTask.assignedTo.toString() === String(A._id) && selfTask.status === "Pending" && String(selfTask.projectId) === String(Pool1._id), selfTask);
  check("...Yokesh is told the way any task assignment tells him (no separate project-only notice)", Boolean(await notified({ recipientId: A._id, type: "TASK_ASSIGNED" })));

  const Pool2 = (await call("POST", `${P}/create-project`, { token: admin, form: makeForm(good({ title: "Second pool project" })) })).body.project;
  r = await call("PUT", `${P}/self-assign/${Pool2._id}`, { token: tA, body: {} });
  check("one active project at a time: refused with a clear reason pointing at My Tasks", r.status === 400 && /Finish it \(see My Tasks\)/i.test(r.body.message), r.body);

  section("Races: two clicks at the same moment");
  // free up Praveen and Karthik (still holding AS1 / E1's tasks from earlier) so they can race
  await call("POST", `${T}/submission/${task1._id}`, { token: tB, body: { content: "done", taskUrl: "https://github.com/x" } });
  await call("POST", `${T}/submission/${editTask._id}`, { token: tC, body: { content: "done", taskUrl: "https://github.com/x" } });
  const R1 = (await call("POST", `${P}/create-project`, { token: admin, form: makeForm(good({ title: "Race for one project" })) })).body.project;
  const both = await Promise.all([call("PUT", `${P}/self-assign/${R1._id}`, { token: tB, body: {} }), call("PUT", `${P}/self-assign/${R1._id}`, { token: tC, body: {} })]);
  check("two people taking the SAME project at once: exactly one gets it", both.filter((x) => x.status === 200).length === 1 && both.filter((x) => x.status === 409).length === 1, both.map((x) => x.status));
  const winner = String((await Project.findById(R1._id)).assignedTo);
  check("...and only the winner got a task for it", (await Task.countDocuments({ projectId: R1._id })) === 1);

  const R2 = (await call("POST", `${P}/create-project`, { token: admin, form: makeForm(good({ title: "Race two-a" })) })).body.project;
  const R3 = (await call("POST", `${P}/create-project`, { token: admin, form: makeForm(good({ title: "Race two-b" })) })).body.project;
  const loser = winner === String(B._id) ? tC : tB;
  const two = await Promise.all([call("PUT", `${P}/self-assign/${R2._id}`, { token: loser, body: {} }), call("PUT", `${P}/self-assign/${R3._id}`, { token: loser, body: {} })]);
  check("one person taking TWO projects at once: only one is kept, and only one task made", two.filter((x) => x.status === 200).length === 1, two.map((x) => x.status));

  // ================================================== COMPLETING THE TASK MIRRORS BACK
  section("Completing the task (not the project) is what finishes it - and it mirrors back");
  r = await call("POST", `${T}/submission/${selfTask._id}`, { token: tB, body: { content: "done", taskUrl: "https://github.com/x" } });
  check("someone who does not hold the task cannot submit it (403)", r.status === 403, r);
  r = await call("POST", `${T}/submission/${selfTask._id}`, { token: tA, body: { content: "", taskUrl: "https://github.com/x" } });
  check("submitting needs the completed-work content", r.status === 400 && /content is required/i.test(r.body.message), r.body);
  r = await call("POST", `${T}/submission/${selfTask._id}`, { token: tA, body: { content: "Fixed the Safari bug", taskUrl: "https://github.com/example/fix" } });
  check("submitting work completes the task (no separate approval step, matching how Tasks already worked)", r.status === 200 && r.body.task.status === "Completed", r.body);
  check("...admins are told", Boolean(await notified({ recipientType: "admin", type: "TASK_SUBMITTED" })));

  const mirrored = await Project.findById(Pool1._id);
  check("...the PROJECT mirrors it: Completed, on time, with the minutes it took, no separate calculation", mirrored.status === "Completed" && mirrored.completedOnTime === true && typeof mirrored.completionMinutes === "number", mirrored);
  check("...taking another project works again now (the slot was released)", (await call("PUT", `${P}/self-assign/${Pool2._id}`, { token: tA, body: {} })).status === 200);
  await call("PUT", `${P}/self-assign/${Pool2._id}`, { token: tA, body: {} }); // no-op if it already succeeded above; keep state simple for what follows

  section("A late completion, and an admin's correction, mirror back too");
  const Late = (await call("POST", `${P}/create-project`, { token: admin, form: makeForm(good({ title: "Will be late", assignedTo: String(C._id) })) })).body.project;
  await Project.updateOne({ _id: Late._id }, { $set: { dueDate: new Date(Date.now() - 3600 * 1000) } });
  const lateTask = await Task.findById(Late.taskId);
  await Task.updateOne({ _id: lateTask._id }, { $set: { dueDate: new Date(Date.now() - 3600 * 1000) } });
  r = await call("POST", `${T}/submission/${lateTask._id}`, { token: tC, body: { content: "late work", taskUrl: "https://drive.google.com/late" } });
  check("submitting after the validity time: the task completes", r.status === 200 && r.body.task.status === "Completed", r.body);
  const lateProject = await Project.findById(Late._id);
  check("...and the project mirrors it as late, from the SAME data (no duplicate on-time logic)", lateProject.status === "Completed" && lateProject.completedOnTime === false, lateProject);

  r = await call("PUT", `${T}/update-status/${lateTask._id}`, { token: tC, body: { status: "In Progress" } });
  check("an admin can correct a task backwards; staff cannot (400, not their call to make)", r.status === 400 && /cannot go back/i.test(r.body.message), r.body);
  r = await call("PUT", `${T}/update-status/${lateTask._id}`, { token: admin, body: { status: "In Progress" } });
  check("admin corrects it back to In Progress", r.status === 200 && r.body.task.status === "In Progress", r.body);
  const correctedProject = await Project.findById(Late._id);
  check("...the project's mirrored result is cleared, back to Assigned - not stuck as a stale Completed", correctedProject.status === "Assigned" && correctedProject.completedOnTime === null && correctedProject.completionMinutes === null, correctedProject);
  r = await call("PUT", `${T}/update-status/${lateTask._id}`, { token: admin, body: { status: "Completed" } });
  check("admin can complete it directly too (an admin override, bypassing submission)", r.status === 200, r.body);
  check("...mirrored again", (await Project.findById(Late._id)).status === "Completed");

  section("Editing a task (the previously-broken 'Edit Date' button)");
  r = await call("PUT", `${T}/update-task/${lateTask._id}`, { token: tC, body: { dueDate: inDays(3) } });
  check("staff cannot edit a task (403)", r.status === 403, r);
  const newDue = inDays(14);
  r = await call("PUT", `${T}/update-task/${lateTask._id}`, { token: admin, body: { dueDate: newDue } });
  check("admin can change a task's due date", r.status === 200 && new Date(r.body.task.dueDate).toISOString() === newDue, r.body);
  check("...it keeps the linked project's due date in sync", new Date((await Project.findById(Late._id)).dueDate).toISOString() === newDue);
  r = await call("PUT", `${T}/update-task/${lateTask._id}`, { token: admin, body: { title: "" } });
  check("an empty title is refused", r.status === 400, r.body);

  // ================================================== STATS
  r = await call("GET", `${P}/stats/${C._id}`, { token: tC });
  check("a person's own numbers come from the mirrored project data", r.status === 200 && r.body.stats.completed === 2 && r.body.stats.onTime === 1 && r.body.stats.late === 1, r.body);

  // ================================================== DELETE CASCADES
  section("Deleting a project cleans up its task");
  const D1 = (await call("POST", `${P}/create-project`, { token: admin, form: makeForm(good({ title: "To delete", assignedTo: String(B._id) }), 1) })).body.project;
  const dTaskId = D1.taskId;
  r = await call("DELETE", `${P}/${D1._id}`, { token: tA });
  check("staff cannot delete a project (403)", r.status === 403, r);
  r = await call("DELETE", `${P}/${D1._id}`, { token: admin });
  check("admin deletes it", r.status === 200, r);
  check("...its linked task is gone too, nothing orphaned", !(await Task.findById(dTaskId)));

  // ================================================== LEADERBOARD, FED BY THE MIRRORED DATA
  section("Leaderboard reads the mirrored project data - one source of truth");
  await Project.deleteMany({});
  await Task.deleteMany({});
  const mkDone = async (title, owner, tok, late) => {
    const p = (await call("POST", `${P}/create-project`, { token: admin, form: makeForm(good({ title, assignedTo: String(owner._id) })) })).body.project;
    if (late) {
      await Project.updateOne({ _id: p._id }, { $set: { dueDate: new Date(Date.now() - 3600 * 1000) } });
      await Task.updateOne({ projectId: p._id }, { $set: { dueDate: new Date(Date.now() - 3600 * 1000) } });
    }
    const t = await Task.findOne({ projectId: p._id });
    await call("POST", `${T}/submission/${t._id}`, { token: tok, body: { content: "x", taskUrl: "https://x.com" } });
    return p;
  };
  await mkDone("Task A1", A, tA, false);
  await mkDone("Task A2", A, tA, false);
  await mkDone("Task B1", B, tB, false);
  await mkDone("Task B2", B, tB, true);
  await call("POST", `${P}/create-project`, { token: admin, form: makeForm(good({ title: "Task C open", assignedTo: String(C._id) })) });
  await call("POST", `${P}/create-project`, { token: admin, form: makeForm(good({ title: "Task up for grabs" })) });

  r = await call("GET", `${P}/leaderboard`, { token: tA });
  const lb = r.body.leaderboard;
  check("leaderboard answers for staff, all 3 listed", r.status === 200 && lb.length === 3, r.body);
  check("Yokesh: 2 on-time completions = 20 points", lb[0].name === "Yokesh" && lb[0].points === 20 && lb[0].completed === 2, lb[0]);
  check("Praveen: one on-time + one late = 15 points, 50% on-time", lb[1].name === "Praveen" && lb[1].points === 15 && lb[1].onTimeRate === 50, lb[1]);
  check("Karthik: nothing completed yet, still listed with an active project", lb[2].name === "Karthik" && lb[2].points === 0 && lb[2].active === 1, lb[2]);
  check("team progress: 6 projects, 4 completed, 1 assigned/active, 1 available", r.body.team.total === 6 && r.body.team.completed === 4 && r.body.team.assigned === 1 && r.body.team.available === 1, r.body.team);
  r = await call("GET", `${P}/leaderboard`);
  check("the leaderboard needs a login (401)", r.status === 401);

  for (const f of fs.existsSync(UPLOADS) ? fs.readdirSync(UPLOADS) : []) if (!filesAtStart.has(f)) fs.unlinkSync(path.join(UPLOADS, f));
  server.close();
  await mongoose.disconnect();
  console.log(`\n${pass} checks passed, ${failures.length} failed`);
  if (failures.length) {
    console.log("FAILED:\n - " + failures.join("\n - "));
    process.exit(1);
  }
  process.exit(0);
}

run().catch((err) => {
  console.error("\nTEST CRASHED:", err);
  process.exit(2);
});