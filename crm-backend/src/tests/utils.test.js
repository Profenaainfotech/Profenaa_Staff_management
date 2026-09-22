// Run:  node src/tests/utils.test.js
const assert = require("assert");
const t = require("../Utils/time");
const w = require("../Utils/wifi");

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log("  ✓", name); };

console.log("time.js");
ok("dateKey uses IST not server tz (UTC 20:00 = next day 01:30 IST)", () => {
  assert.strictEqual(t.dateKey(new Date("2026-09-18T20:00:00Z")), "2026-09-19");
  assert.strictEqual(t.dateKey(new Date("2026-09-18T18:29:00Z")), "2026-09-18");
  assert.strictEqual(t.dateKey(new Date("2026-09-18T18:30:00Z")), "2026-09-19");
});
ok("minutesOfDay in IST", () => {
  assert.strictEqual(t.minutesOfDay(new Date("2026-09-18T04:00:00Z")), 9 * 60 + 30);
});
ok("startOfDay/endOfDay round trip", () => {
  const s = t.startOfDay("2026-09-19");
  assert.strictEqual(s.toISOString(), "2026-09-18T18:30:00.000Z");
  assert.strictEqual(t.dateKey(s), "2026-09-19");
  assert.strictEqual(t.dateKey(t.endOfDay("2026-09-19")), "2026-09-19");
  assert.strictEqual(t.dateKey(new Date(t.endOfDay("2026-09-19").getTime() + 1)), "2026-09-20");
});
ok("addDays across month/year", () => {
  assert.strictEqual(t.addDays("2026-09-30", 1), "2026-10-01");
  assert.strictEqual(t.addDays("2026-01-01", -1), "2025-12-31");
  assert.strictEqual(t.addDays("2028-02-28", 1), "2028-02-29");
});
ok("weekday", () => {
  assert.strictEqual(t.weekday("2026-09-20"), 0); // Sunday
  assert.strictEqual(t.weekday("2026-09-21"), 1);
});
ok("eachDate + monthRange", () => {
  assert.deepStrictEqual(t.eachDate("2026-09-28", "2026-10-02").length, 5);
  assert.deepStrictEqual(t.monthRange("2026-02"), { from: "2026-02-01", to: "2026-02-28" });
  assert.strictEqual(t.monthRange("2026-13"), null);
});
ok("isValidDateKey", () => {
  assert.ok(t.isValidDateKey("2026-09-20"));
  assert.ok(!t.isValidDateKey("2026-02-30"));
  assert.ok(!t.isValidDateKey("20-09-2026"));
});
ok("timeToMinutes / dateAtTime", () => {
  assert.strictEqual(t.timeToMinutes("09:30"), 570);
  assert.strictEqual(t.dateAtTime("2026-09-19", "09:30").toISOString(), "2026-09-19T04:00:00.000Z");
});

console.log("wifi.js");
const branch = {
  active: true,
  networks: [
    { ssid: "PROFENAA-5G", bssid: "8C:C7:C3:09:1D:70", active: true },
    { ssid: "PROFENAA-2G", bssid: "8C:C7:C3:09:1D:74", active: true },
    { ssid: "PROFENAA- 2G", bssid: "14:A7:2B:EA:2E:51", active: true },
    { ssid: "OLD", bssid: "AA:BB:CC:DD:EE:FF", active: false },
    { ssid: "MESH", bssid: "10:20:30:40:*", active: true },
  ],
};
ok("exact SSID+BSSID authorised (both bands)", () => {
  assert.ok(w.isAuthorizedNetwork(branch, "PROFENAA-5G", "8c:c7:c3:09:1d:70"));
  assert.ok(w.isAuthorizedNetwork(branch, "PROFENAA-2G", "8C-C7-C3-09-1D-74"));
});
ok("phone hotspot copying the SSID is NOT authorised (BSSID differs)", () => {
  assert.ok(!w.isAuthorizedNetwork(branch, "PROFENAA-5G", "02:11:22:33:44:55"));
});
ok("right BSSID but wrong SSID is NOT authorised", () => {
  assert.ok(!w.isAuthorizedNetwork(branch, "Free WiFi", "8C:C7:C3:09:1D:70"));
});
ok("Pollachi SSID with the real space matches only as broadcast", () => {
  assert.ok(w.isAuthorizedNetwork(branch, "PROFENAA- 2G", "14:A7:2B:EA:2E:51"));
  assert.ok(!w.isAuthorizedNetwork(branch, "PROFENAA-2G", "14:A7:2B:EA:2E:51"));
});
ok("disabled network and inactive branch are rejected", () => {
  assert.ok(!w.isAuthorizedNetwork(branch, "OLD", "AA:BB:CC:DD:EE:FF"));
  assert.ok(!w.isAuthorizedNetwork({ ...branch, active: false }, "PROFENAA-5G", "8C:C7:C3:09:1D:70"));
});
ok("empty / disconnected never authorised", () => {
  assert.ok(!w.isAuthorizedNetwork(branch, "", ""));
  assert.ok(!w.isAuthorizedNetwork(null, "PROFENAA-5G", "8C:C7:C3:09:1D:70"));
});
ok("wildcard tail covers mesh nodes", () => {
  assert.ok(w.isAuthorizedNetwork(branch, "mesh", "10:20:30:40:AA:BB"));
  assert.ok(!w.isAuthorizedNetwork(branch, "mesh", "10:20:31:40:AA:BB"));
});
ok("pattern validation blocks dangerous wildcards", () => {
  assert.ok(w.isValidBssidPattern("8C:C7:C3:09:1D:70"));
  assert.ok(w.isValidBssidPattern("8C:C7:C3:09:1D:*"));
  assert.ok(w.isValidBssidPattern("8CC7C3091D70"));
  assert.ok(!w.isValidBssidPattern("*:*:*:*:*:*"));
  assert.ok(!w.isValidBssidPattern("8C:C7:*"));
  assert.ok(!w.isValidBssidPattern("8C:C7:*:*:*:*"));
  assert.ok(w.isValidBssidPattern("8C:C7:C3:*"));
  assert.ok(!w.isValidBssidPattern("8C:*:C3:09:1D:70"));
  assert.ok(!w.isValidBssidPattern("hello"));
});

console.log(`\n${n} passed`);
