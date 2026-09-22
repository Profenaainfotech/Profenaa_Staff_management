// =====================================================
// PROJECTS END-TO-END TEST      node src/tests/project.integration.test.js
//
//  - login protection (nothing works without it; staff cannot create / edit / delete)
//  - create Internal / External: every validation message, optional images, up to 10
//  - the old screen bug: "projectCategory" (External) used to be stored as Internal
//  - lists by type, the pool, one person's projects
//  - edit (fields, images added / removed, type change, assign / unassign) and delete
//  - self-assign ("take" / "take and start"), one project at a time, and RACES:
//      two people taking the same project, one person taking two at once
//  - start, complete on time / late, admin correction
//  - the leaderboard (points, rank, team progress, type and period filters)
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

/** multipart form; images = number of pictures to attach */
function makeForm(fields = {}, images = 0, imageField = "images") {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) fd.append(k, v);
  for (let i = 0; i < images; i += 1) fd.append(imageField, ...png(`pic${i}.png`));
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
const diskName = (p) => path.join(UPLOADS, path.basename(p));

async function run() {
  const filesAtStart = new Set(fs.existsSync(UPLOADS) ? fs.readdirSync(UPLOADS) : []); // the test removes only what it created
  await mongoose.connect(process.env.MONGO_URI);
  if (!/test/i.test(mongoose.connection.name)) throw new Error(`Refusing to wipe database "${mongoose.connection.name}" (name must contain "test")`);
  for (const c of await mongoose.connection.db.collections()) await c.deleteMany({});

  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  BASE = `http://127.0.0.1:${server.address().port}`;
  const P = "/api/Project";

  // ---------------------------------------------- setup
  await call("POST", "/api/admin/register", { body: { name: "Boss", password: "admin123", role: "admin" } });
  const admin = (await call("POST", "/api/admin/login", { body: { name: "Boss", password: "admin123" } })).body.token;
  const mk = async (name, mobile) => (await call("POST", "/api/staff", { token: admin, body: { name, mobile, password: "secret123", role: "Developer", shiftStart: "09:30", shiftEnd: "18:30" } })).body.user;
  const A = await mk("Yokesh", "9200000001");
  const B = await mk("Praveen", "9200000002");
  const C = await mk("Karthik", "9200000003");
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

  // ================================================== SECURITY
  section("Login protection");
  let r = await call("GET", `${P}/get-all-projects`);
  check("no login: the project list is refused (401)", r.status === 401, r);
  r = await call("POST", `${P}/create-project`, { form: makeForm(good()) });
  check("no login: creating a project is refused (401)", r.status === 401, r);
  r = await call("POST", `${P}/create-project`, { token: tA, form: makeForm(good()) });
  check("staff cannot create a project (403)", r.status === 403, r);
  r = await call("GET", `${P}/get-all-projects`, { token: tA });
  check("staff cannot use the admin list (403)", r.status === 403, r);
  r = await call("GET", `${P}/pool`, { token: tA });
  check("staff can see the pool", r.status === 200 && Array.isArray(r.body.projects), r);

  // ================================================== CREATE: VALIDATION
  section("Create: every validation message");
  const before = fileCount();
  const bad = async (over, images, re, label) => {
    const x = await call("POST", `${P}/create-project`, { token: admin, form: makeForm(good(over), images) });
    check(label, x.status === 400 && re.test(x.body.message || ""), x.body);
  };
  await bad({ title: "" }, 0, /title is required/i, "empty title");
  await bad({ title: "ab" }, 0, /title is required/i, "title too short");
  await bad({ title: "x".repeat(121) }, 0, /too long/i, "title too long");
  await bad({ issueDetails: "" }, 0, /error or change/i, "the error / change field is required");
  await bad({ issueDetails: "no" }, 0, /at least 5/i, "the error / change field needs a real sentence");
  await bad({ description: "short" }, 0, /description is required/i, "description too short");
  await bad({ dueDate: "" }, 0, /validity time/i, "validity time is required");
  await bad({ dueDate: "not-a-date" }, 0, /not a valid date/i, "validity time must be a date");
  await bad({ dueDate: new Date(Date.now() - 3600 * 1000).toISOString() }, 0, /in the future/i, "validity time cannot be in the past");
  await bad({ projectType: "Random" }, 0, /Internal or External/i, "unknown type");
  await bad({ assignedTo: "12345" }, 0, /valid staff member/i, "bad staff id");
  r = await call("POST", `${P}/create-project`, { token: admin, form: makeForm(good({ assignedTo: "a".repeat(24) })) });
  check("unknown staff member: 404", r.status === 404 && /does not exist/i.test(r.body.message), r.body);
  r = await call("POST", `${P}/create-project`, { token: admin, form: makeForm(good(), 11) });
  check("more than 10 images is refused with a clear message", r.status === 400 && /at most 10/i.test(r.body.message), r.body);
  const fdText = makeForm(good());
  fdText.append("images", new Blob(["hello"], { type: "text/plain" }), "notes.txt");
  r = await call("POST", `${P}/create-project`, { token: admin, form: fdText });
  check("a non-image file is refused", r.status === 400 && /JPG, JPEG, PNG and WEBP/i.test(r.body.message), r.body);
  const fdBig = makeForm(good());
  fdBig.append("images", new Blob([Buffer.alloc(5 * 1024 * 1024 + 100)], { type: "image/png" }), "big.png");
  r = await call("POST", `${P}/create-project`, { token: admin, form: fdBig });
  check("an image over 5 MB is refused", r.status === 400 && /5 MB/i.test(r.body.message), r.body);
  await sleep(200);
  check("rejected requests leave no image files behind", fileCount() === before, { before, after: fileCount() });
  check("...and nothing was saved", (await Project.countDocuments()) === 0);

  // ================================================== CREATE: OK
  section("Create: Internal and External");
  r = await call("POST", `${P}/create-project`, { token: admin, form: makeForm(good({ title: "Internal with pictures" }), 3) });
  const I1 = r.body.project;
  check("Internal project with 3 images (no assignee)", r.status === 201 && I1.projectType === "Internal" && I1.images.length === 3, r.body);
  check("...the first image is the card cover", I1.cardImage === I1.images[0]);
  check("...it goes to the pool, Pending, with the issue text and validity time stored", I1.assignmentType === "Pool" && I1.status === "Pending" && /Safari/.test(I1.issueDetails) && new Date(I1.dueDate) > new Date(), I1);
  check("...its image files exist on disk", I1.images.every((p) => fs.existsSync(diskName(p))));
  check("...every active staff member was told there is a new project", Boolean(await notified({ recipientId: A._id, type: "PROJECT_IN_POOL" })) && Boolean(await notified({ recipientId: C._id, type: "PROJECT_IN_POOL" })));

  r = await call("POST", `${P}/create-project`, { token: admin, form: makeForm(good({ title: "External client work", projectType: "External" })) });
  const E1 = r.body.project;
  check("External project without any image (images are optional)", r.status === 201 && E1.projectType === "External" && E1.images.length === 0 && E1.cardImage === "", r.body);

  r = await call("POST", `${P}/create-project`, { token: admin, form: makeForm({ ...good({ title: "Sent by the old screen" }), projectType: undefined, projectCategory: "External" }) });
  check("the old screen's field name (projectCategory) now stores External correctly", r.status === 201 && r.body.project.projectType === "External", r.body);

  r = await call("POST", `${P}/create-project`, { token: admin, form: makeForm(good({ title: "Assigned to Praveen", assignedTo: String(B._id) })) });
  const AS1 = r.body.project;
  check("a project can be assigned to a staff member while creating it", r.status === 201 && AS1.assignmentType === "Admin" && AS1.assignedToName === "Praveen" && AS1.status === "Pending", r.body);
  check("...that person is notified", Boolean(await notified({ recipientId: B._id, type: "PROJECT_ASSIGNED" })));

  // ================================================== LISTS
  section("Lists by type");
  r = await call("GET", `${P}/get-all-projects`, { token: admin });
  check("admin sees all four", r.status === 200 && r.body.count === 4, r.body.count);
  r = await call("GET", `${P}/get-all-projects?type=Internal`, { token: admin });
  check("Internal filter: only Internal", r.body.projects.length === 2 && r.body.projects.every((p) => p.projectType === "Internal"), r.body.projects.map((p) => p.projectType));
  r = await call("GET", `${P}/get-all-projects?type=External`, { token: admin });
  check("External filter: only External", r.body.projects.length === 2 && r.body.projects.every((p) => p.projectType === "External"));
  r = await call("GET", `${P}/pool?type=External`, { token: tA });
  check("the pool can be filtered by type too", r.body.projects.length === 2 && r.body.projects.every((p) => p.projectType === "External" && p.assignmentType === "Pool"), r.body.projects.length);
  r = await call("GET", `${P}/pool`, { token: tA });
  check("the pool never shows assigned projects", r.body.projects.length === 3 && !r.body.projects.some((p) => p.title === "Assigned to Praveen"), r.body.projects.length);
  r = await call("GET", `${P}/user/${B._id}`, { token: tB });
  check("a person sees their own projects", r.status === 200 && r.body.projects.length === 1, r.body);
  r = await call("GET", `${P}/user/${B._id}`, { token: tA });
  check("...but not somebody else's (403)", r.status === 403, r);
  r = await call("GET", `${P}/user/${B._id}`, { token: admin });
  check("an admin can see anyone's", r.status === 200 && r.body.projects.length === 1);

  // ================================================== EDIT
  section("Edit (admin)");
  r = await call("PUT", `${P}/${I1._id}`, { token: tA, form: makeForm(good()) });
  check("staff cannot edit (403)", r.status === 403, r);
  r = await call("PUT", `${P}/${"b".repeat(24)}`, { token: admin, form: makeForm(good()) });
  check("editing a project that does not exist: 404", r.status === 404, r);
  r = await call("PUT", `${P}/${I1._id}`, { token: admin, form: makeForm(good({ issueDetails: "" })) });
  check("edit uses the same validation", r.status === 400 && /error or change/i.test(r.body.message), r.body);

  const dueChange = inDays(10);
  r = await call("PUT", `${P}/${I1._id}`, { token: admin, form: makeForm(good({ title: "Internal - renamed", issueDetails: "New wording of the error", description: "A brand new description for this project.", dueDate: dueChange, projectType: "External" })) });
  check("edit changes title, error text, description, validity time and type", r.status === 200 && r.body.project.title === "Internal - renamed" && r.body.project.issueDetails === "New wording of the error" && r.body.project.projectType === "External" && new Date(r.body.project.dueDate).toISOString() === dueChange, r.body);
  r = await call("GET", `${P}/get-all-projects?type=Internal`, { token: admin });
  check("...and it moved out of the Internal list", !r.body.projects.some((p) => String(p._id) === String(I1._id)));
  r = await call("PUT", `${P}/${I1._id}`, { token: admin, form: makeForm({ ...good({ title: "Internal again", projectType: "Internal" }), dueDate: dueChange }) });
  check("...back to Internal (unchanged validity time is accepted)", r.status === 200 && r.body.project.projectType === "Internal", r.body);

  const gone = I1.images[1];
  const fdImg = makeForm({ ...good({ title: "Internal again" }), dueDate: dueChange, removeImages: JSON.stringify([gone]) }, 2);
  r = await call("PUT", `${P}/${I1._id}`, { token: admin, form: fdImg });
  check("edit can remove an image and add new ones (3 - 1 + 2 = 4)", r.status === 200 && r.body.project.images.length === 4 && !r.body.project.images.includes(gone), r.body);
  await sleep(200);
  check("...the removed image file is deleted from disk", !fs.existsSync(diskName(gone)));
  const removeCover = r.body.project.images[0];
  r = await call("PUT", `${P}/${I1._id}`, { token: admin, form: makeForm({ ...good({ title: "Internal again" }), dueDate: dueChange, removeImages: JSON.stringify([removeCover]) }) });
  check("removing the cover makes the next image the cover", r.status === 200 && r.body.project.cardImage === r.body.project.images[0] && r.body.project.cardImage !== removeCover, r.body);
  r = await call("PUT", `${P}/${I1._id}`, { token: admin, form: makeForm({ ...good({ title: "Internal again" }), dueDate: dueChange }, 8) });
  check("edit refuses more than 10 images in total", r.status === 400 && /at most 10/i.test(r.body.message), r.body);
  r = await call("PUT", `${P}/${I1._id}`, { token: admin, form: makeForm({ ...good({ title: "Internal again" }), dueDate: dueChange, removeImages: "{oops" }) });
  check("a broken remove list is refused", r.status === 400, r.body);

  r = await call("PUT", `${P}/${E1._id}`, { token: admin, form: makeForm({ ...good({ title: "External client work", projectType: "External" }), dueDate: E1.dueDate, assignedTo: String(C._id) }) });
  check("edit can assign a pool project to a person", r.status === 200 && r.body.project.assignedToName === "Karthik" && r.body.project.assignmentType === "Admin", r.body);
  r = await call("PUT", `${P}/${E1._id}`, { token: admin, form: makeForm({ ...good({ title: "External client work", projectType: "External" }), dueDate: E1.dueDate, assignedTo: "" }) });
  check("...and back to the pool", r.status === 200 && r.body.project.assignedTo === null && r.body.project.assignmentType === "Pool", r.body);

  // ================================================== TAKE A PROJECT
  section("Staff take a project (one at a time)");
  r = await call("PUT", `${P}/self-assign/${I1._id}`, { token: admin, body: {} });
  check("an admin cannot use the staff 'take' action (403)", r.status === 403, r);
  r = await call("PUT", `${P}/self-assign/${I1._id}`, { token: tA, body: { start: true } });
  check("'take and start': assigned to me and already In Progress", r.status === 200 && r.body.project.assignedToName === "Yokesh" && r.body.project.assignmentType === "Self" && r.body.project.status === "In Progress" && r.body.project.startedAt, r.body);
  check("...admin is told who started what", Boolean(await notified({ recipientType: "admin", type: "PROJECT_TAKEN" })));
  r = await call("PUT", `${P}/self-assign/${E1._id}`, { token: tA, body: {} });
  check("a second project while one is active is refused, with the reason", r.status === 400 && /already have an active project/i.test(r.body.message), r.body);
  r = await call("PUT", `${P}/self-assign/${AS1._id}`, { token: tB, body: {} });
  check("Praveen already holds an admin-assigned project, so he cannot take another either", r.status === 400 && /already have an active project/i.test(r.body.message), r.body);
  r = await call("PUT", `${P}/self-assign/${I1._id}`, { token: tC, body: {} });
  check("taking something already taken: 409 naming who has it", r.status === 409 && /Yokesh has already taken/i.test(r.body.message), r.body);
  r = await call("PUT", `${P}/self-assign/${AS1._id}`, { token: tC, body: {} });
  check("an admin-assigned project cannot be taken by someone else (409, says who has it)", r.status === 409 && /already assigned to Praveen/i.test(r.body.message), r.body);
  r = await call("PUT", `${P}/${I1._id}`, { token: admin, form: makeForm({ ...good({ title: "Internal again" }), dueDate: dueChange, assignedTo: String(C._id) }) });
  check("a project in progress cannot be reassigned (409)", r.status === 409 && /in progress/i.test(r.body.message), r.body);

  const ProjectClaim = require("../Models/ProjectClaim.Model");
  const ST = (await call("POST", `${P}/create-project`, { token: admin, form: makeForm(good({ title: "Stale claim" })) })).body.project;
  await ProjectClaim.collection.insertOne({ projectId: new mongoose.Types.ObjectId(ST._id), userId: A._id, createdAt: new Date(Date.now() - 60000) });
  r = await call("PUT", `${P}/self-assign/${ST._id}`, { token: tC, body: {} });
  check("a forgotten old claim on a project that is in the pool does not block it", r.status === 200 && r.body.project.assignedToName === "Karthik", r.body);
  await call("PUT", `${P}/update-status/${ST._id}`, { token: admin, body: { status: "Completed" } }); // Karthik is free again

  // ================================================== START + COMPLETE
  section("Start, complete, on time and late");
  r = await call("PUT", `${P}/start/${AS1._id}`, { token: tA, body: {} });
  check("only the person who holds it can start it (403)", r.status === 403, r);
  r = await call("PUT", `${P}/start/${AS1._id}`, { token: tB, body: {} });
  check("the holder starts an admin-assigned project", r.status === 200 && r.body.project.status === "In Progress" && r.body.project.startedAt, r.body);
  const started = r.body.project.startedAt;
  r = await call("PUT", `${P}/start/${AS1._id}`, { token: tB, body: {} });
  check("starting twice changes nothing (the start time is kept)", r.status === 200 && r.body.project.startedAt === started, r.body);

  r = await call("PUT", `${P}/update-status/${AS1._id}`, { token: tA, body: { status: "Completed" } });
  check("someone else cannot complete it (403)", r.status === 403, r);
  r = await call("PUT", `${P}/update-status/${AS1._id}`, { token: tB, body: { status: "Done" } });
  check("an unknown status is refused", r.status === 400, r);
  r = await call("PUT", `${P}/update-status/${AS1._id}`, { token: tB, body: { status: "Completed" } });
  const done1 = r.body.project;
  check("complete before the validity time: on time, with the minutes it took", r.status === 200 && done1.status === "Completed" && done1.completedOnTime === true && typeof done1.completionMinutes === "number" && done1.completedAt, r.body);
  check("...admin is told", Boolean(await notified({ recipientType: "admin", type: "PROJECT_COMPLETED" })));
  r = await call("PUT", `${P}/update-status/${AS1._id}`, { token: tB, body: { status: "In Progress" } });
  check("staff cannot move a project backwards (400)", r.status === 400 && /cannot go back/i.test(r.body.message), r.body);

  const L1 = (await call("POST", `${P}/create-project`, { token: admin, form: makeForm(good({ title: "Will be late", assignedTo: String(B._id) })) })).body.project;
  await Project.updateOne({ _id: L1._id }, { $set: { dueDate: new Date(Date.now() - 3600 * 1000) } });
  r = await call("PUT", `${P}/update-status/${L1._id}`, { token: tB, body: { status: "Completed" } });
  check("complete AFTER the validity time: marked late", r.status === 200 && r.body.project.completedOnTime === false, r.body);
  check("...a project completed straight from Pending gets a start time too", Boolean(r.body.project.startedAt) && r.body.project.completionMinutes === 0, r.body);

  r = await call("PUT", `${P}/update-status/${L1._id}`, { token: admin, body: { status: "In Progress" } });
  check("admin can correct a status (even backwards); the result is cleared", r.status === 200 && r.body.project.status === "In Progress" && r.body.project.completedAt === null && r.body.project.completedOnTime === null && r.body.project.completionMinutes === null, r.body);
  r = await call("PUT", `${P}/update-status/${E1._id}`, { token: admin, body: { status: "Completed" } });
  check("admin cannot complete a project nobody holds", r.status === 400 && /Assign the project/i.test(r.body.message), r.body);

  r = await call("GET", `${P}/stats/${B._id}`, { token: tB });
  check("a person's own numbers", r.status === 200 && r.body.stats.completed === 1 && r.body.stats.onTime === 1 && r.body.stats.inProgress >= 1, r.body);
  r = await call("GET", `${P}/stats/${B._id}`, { token: tA });
  check("...are private (403)", r.status === 403, r);

  section("Races: two clicks at the same moment");
  // Yokesh finishes his project, so Yokesh and Karthik are both free
  r = await call("PUT", `${P}/update-status/${I1._id}`, { token: tA, body: { status: "Completed" } });
  check("(set-up) Yokesh completes his project", r.status === 200 && r.body.project.status === "Completed", r.body);
  const R1 = (await call("POST", `${P}/create-project`, { token: admin, form: makeForm(good({ title: "Race for one project" })) })).body.project;
  const both = await Promise.all([call("PUT", `${P}/self-assign/${R1._id}`, { token: tA, body: {} }), call("PUT", `${P}/self-assign/${R1._id}`, { token: tC, body: {} })]);
  const wins = both.filter((x) => x.status === 200);
  check("two people taking the SAME project: exactly one gets it", wins.length === 1 && both.filter((x) => x.status === 409).length === 1, both.map((x) => x.status));
  const owner = await Project.findById(R1._id);
  check("...and it belongs to the winner only", String(owner.assignedTo) === String(wins[0].body.project.assignedTo._id));

  const R2 = (await call("POST", `${P}/create-project`, { token: admin, form: makeForm(good({ title: "Race two-a" })) })).body.project;
  const R3 = (await call("POST", `${P}/create-project`, { token: admin, form: makeForm(good({ title: "Race two-b" })) })).body.project;
  // the loser of the first race holds nothing: let them grab two projects at the very same moment
  const loserIsA = String(owner.assignedTo) === String(C._id);
  const holder = loserIsA ? tA : tC;
  const holderId = loserIsA ? A._id : C._id;
  const two = await Promise.all([call("PUT", `${P}/self-assign/${R2._id}`, { token: holder, body: {} }), call("PUT", `${P}/self-assign/${R3._id}`, { token: holder, body: {} })]);
  check("one person taking TWO projects at once: only one is kept", two.filter((x) => x.status === 200).length === 1, two.map((x) => x.status));
  check("...they hold exactly one active project", (await Project.countDocuments({ assignedTo: holderId, status: { $in: ["Pending", "In Progress"] } })) === 1);
  check("...the other went back to the pool", (await Project.countDocuments({ _id: { $in: [R2._id, R3._id] }, assignedTo: null, assignmentType: "Pool" })) === 1);

  // ================================================== LEADERBOARD
  section("Leaderboard and team progress");
  // fresh, isolated data
  await Project.deleteMany({});
  const mkProject = async (over, owner, status, extra = {}) => {
    const x = (await call("POST", `${P}/create-project`, { token: admin, form: makeForm(good(over)) })).body.project;
    if (owner) await call("PUT", `${P}/${x._id}`, { token: admin, form: makeForm({ ...good(over), dueDate: x.dueDate, assignedTo: String(owner._id) }) });
    if (status) await call("PUT", `${P}/update-status/${x._id}`, { token: admin, body: { status } });
    if (Object.keys(extra).length) await Project.updateOne({ _id: x._id }, { $set: extra });
    return x;
  };
  await mkProject({ title: "Proj A1" }, A, "Completed");
  await mkProject({ title: "Proj A2" }, A, "Completed");
  await mkProject({ title: "Proj B1" }, B, "Completed");
  const b2 = await mkProject({ title: "Proj B2" }, B, "Completed");
  await Project.updateOne({ _id: b2._id }, { $set: { completedOnTime: false } }); // B finished this one late
  await mkProject({ title: "C-open", projectType: "External" }, C, "In Progress");
  await mkProject({ title: "Nobody yet 1" });
  await mkProject({ title: "Nobody yet 2", projectType: "External" });
  await mkProject({ title: "Overdue one" }, null, null, { dueDate: new Date(Date.now() - 86400000) });

  r = await call("GET", `${P}/leaderboard`, { token: tA });
  const lb = r.body.leaderboard;
  check("leaderboard answers for staff", r.status === 200 && Array.isArray(lb) && lb.length === 3, r.body);
  check("rank 1 is the person with the most on-time completions (2 x 10 = 20 points)", lb[0].name === "Yokesh" && lb[0].points === 20 && lb[0].completed === 2 && lb[0].onTime === 2 && lb[0].rank === 1, lb[0]);
  check("rank 2: one on time + one late (10 + 5 = 15 points, 50% on time)", lb[1].name === "Praveen" && lb[1].points === 15 && lb[1].onTime === 1 && lb[1].late === 1 && lb[1].onTimeRate === 50, lb[1]);
  check("rank 3: nothing completed yet, but still listed with their open project", lb[2].name === "Karthik" && lb[2].points === 0 && lb[2].active === 1 && lb[2].rank === 3, lb[2]);
  check("a person can see where THEY stand", r.body.me?.name === "Yokesh" && r.body.me.rank === 1);
  check("team progress: 8 projects, 4 completed (50%), 1 in progress, 3 available, 1 overdue", r.body.team.total === 8 && r.body.team.completed === 4 && r.body.team.inProgress === 1 && r.body.team.available === 3 && r.body.team.overdue === 1 && r.body.team.percentComplete === 50, r.body.team);
  r = await call("GET", `${P}/leaderboard?type=External`, { token: admin });
  check("filter by type: External only (admin view has no personal row)", r.body.type === "External" && r.body.team.total === 2 && r.body.team.completed === 0 && r.body.me === null, r.body.team);
  r = await call("GET", `${P}/leaderboard?type=Internal`, { token: tB });
  check("Internal only: Yokesh and Praveen keep their scores", r.body.leaderboard[0].points === 20 && r.body.leaderboard[1].points === 15, r.body.leaderboard);
  const old = await Project.findOne({ title: "Proj A1" });
  await Project.updateOne({ _id: old._id }, { $set: { completedAt: new Date(Date.now() - 40 * 86400000) } });
  r = await call("GET", `${P}/leaderboard?period=week`, { token: tA });
  check("period 'this week' ignores a completion from 40 days ago", r.body.leaderboard.find((x) => x.name === "Yokesh").completed === 1, r.body.leaderboard);
  r = await call("GET", `${P}/leaderboard?period=all`, { token: tA });
  check("...'all time' still counts it", r.body.leaderboard.find((x) => x.name === "Yokesh").completed === 2);
  r = await call("GET", `${P}/leaderboard`);
  check("the leaderboard needs a login (401)", r.status === 401);

  // ================================================== DELETE
  section("Delete (admin)");
  const D1 = (await call("POST", `${P}/create-project`, { token: admin, form: makeForm(good({ title: "To be deleted", assignedTo: String(C._id) }), 2) })).body.project;
  r = await call("DELETE", `${P}/${D1._id}`, { token: tA });
  check("staff cannot delete (403)", r.status === 403, r);
  check("...the project is still there", Boolean(await Project.findById(D1._id)));
  r = await call("DELETE", `${P}/${D1._id}`, { token: admin });
  check("admin deletes it", r.status === 200 && /deleted/i.test(r.body.message), r);
  await sleep(200);
  check("...it is gone from the database and its image files are removed", !(await Project.findById(D1._id)) && D1.images.every((p) => !fs.existsSync(diskName(p))));
  check("...the person it was assigned to is told", Boolean(await notified({ recipientId: C._id, type: "PROJECT_REMOVED" })));
  r = await call("DELETE", `${P}/${D1._id}`, { token: admin });
  check("deleting again: 404", r.status === 404, r);
  r = await call("DELETE", `${P}/not-an-id`, { token: admin });
  check("a broken id is refused (400)", r.status === 400, r);

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
