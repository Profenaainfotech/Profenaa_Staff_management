// Run:  node src/tests/techWork.test.js
// The Technologies Task daily percentage: ticked / allocated x 100, nothing ticked = 0.
const assert = require("assert");
const tech = require("../Services/techWork.service");

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log("  ✓", name); };
const allocs = [1, 2, 3, 4, 5].map((i) => ({ _id: `a${i}`, title: `Work ${i}`, kind: i <= 3 ? "Task" : "PastWork", technology: "React" }));

console.log("techWork.service");
ok("5 allocated, 3 ticked = 60%", () => {
  const s = tech.snapshot(allocs, ["a1", "a2", "a5"]);
  assert.strictEqual(s.allocated, 5);
  assert.strictEqual(s.ticked, 3);
  assert.strictEqual(s.percent, 60);
});
ok("separate percentage for tasks and past work", () => {
  const s = tech.snapshot(allocs, ["a1", "a2", "a5"]);
  assert.strictEqual(s.taskPercent, 66.7);
  assert.strictEqual(s.pastPercent, 50);
});
ok("nothing ticked = 0%", () => {
  assert.strictEqual(tech.snapshot(allocs, []).percent, 0);
  assert.strictEqual(tech.snapshot(allocs).percent, 0);
});
ok("ids that are not allocated to the person are ignored", () => {
  const s = tech.snapshot(allocs, ["a1", "someone-elses-task"]);
  assert.strictEqual(s.ticked, 1);
  assert.strictEqual(s.percent, 20);
});
ok("no allocated work = no percentage (not 0%)", () => {
  const s = tech.snapshot([], ["a1"]);
  assert.strictEqual(s.allocated, 0);
  assert.strictEqual(s.percent, null);
});
console.log(`\n${n} passed`);
process.exit(0);