// =====================================================
// THE AGENT LOOP
//
// The agent is only a SENSOR. Every interval it writes one reading
// ("connected to SSID x / BSSID y" or "not connected") to the durable queue and
// tries to deliver the queue. All attendance decisions are made by the server.
// =====================================================
const os = require("os");
const cfg = require("./config");
const api = require("./api");
const queue = require("./queue");
const wifi = require("./wifi");
const log = require("./log");
const { toast } = require("./notify");
const prompt = require("./prompt");

const VERSION = require("../package.json").version;
const DEFAULT_INTERVAL = 90;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function createAgent() {
  const device = cfg.loadDevice();
  if (!device?.deviceToken) {
    throw new Error("This computer is not set up yet. Run:  node index.js --setup");
  }

  let state = cfg.loadState();
  let stopped = false;
  let timer = null;
  let flushing = false;
  let blockedUntil = 0;
  let online = true;
  let lastTickAt = 0;
  const said = new Set(); // one-time notices
  const asked = new Set(); // shift-end questions already shown (by id)
  let promptOpen = false;

  const offset = () => state.clockOffsetMs || 0;
  const nowIso = () => new Date(Date.now() + offset()).toISOString();
  const interval = () => Number(process.env.AGENT_INTERVAL_SECONDS) || state.heartbeatInterval || DEFAULT_INTERVAL;
  const saveState = () => cfg.saveState(state);
  const once = (key, fn) => {
    if (said.has(key)) return;
    said.add(key);
    fn();
  };

  // ---------- server settings ----------
  async function refreshConfig() {
    try {
      const q = `?hostname=${encodeURIComponent(os.hostname())}&agentVersion=${VERSION}`;
      const res = await api.request("GET", `/api/agent/config${q}`, { device: device.deviceToken });
      if (res.status === 200) {
        state.heartbeatInterval = res.body.heartbeatInterval || DEFAULT_INTERVAL;
        state.gracePeriod = res.body.gracePeriod;
        state.branch = res.body.branch;
        const skew = Date.parse(res.body.serverTime) - Date.now();
        state.clockOffsetMs = Math.abs(skew) > 30000 ? skew : 0;
        if (state.clockOffsetMs) log.warn(`This PC's clock differs from the server by ${Math.round(skew / 1000)}s - correcting timestamps.`);
        saveState();
        reportTracking(res.body);
      } else if (!handleAuthProblem(res)) {
        log.warn(`Config request failed (${res.status})`);
      }
    } catch (err) {
      if (!err.network) log.error(`Config error: ${err.message}`);
    }
  }

  const NOTICES = {
    MODE_NOT_WIFI: "Your attendance is set to CRM login, so this agent is idle. Ask your administrator to switch you to Wi-Fi attendance.",
    NO_BRANCH: "You have no branch assigned yet. Ask your administrator to assign one.",
    USER_INACTIVE: "Your account is deactivated. Contact your administrator.",
  };

  function reportTracking(s) {
    if (s && s.tracking === false && s.reason) {
      once(`track:${s.reason}`, () => toast("Attendance not active", NOTICES[s.reason] || s.reason));
    }
  }

  // ---------- server said no ----------
  function handleAuthProblem(res) {
    const code = res.body?.code;
    if (res.status === 403 && code === "DEVICE_PENDING") {
      blockedUntil = Date.now() + 60000;
      once("pending", () => toast("Waiting for approval", "An administrator must approve this computer before attendance starts. Readings are being saved."));
      return true;
    }
    if (res.status === 401 && code === "DEVICE_REVOKED") {
      blockedUntil = Date.now() + 10 * 60000;
      once("revoked", () => toast("Device revoked", "An administrator revoked this computer. Contact them to continue."));
      return true;
    }
    if (res.status === 401) {
      blockedUntil = Date.now() + 10 * 60000;
      once("badtoken", () => toast("Setup needed", "This computer's registration is no longer valid. Run setup again."));
      return true;
    }
    if (res.status === 429) {
      blockedUntil = Date.now() + 60000;
      return true;
    }
    return false;
  }

  // ---------- pop-ups on state changes ----------
  function handleServerState(s) {
    if (!s) return;
    reportTracking(s);
    if (!s.state) return;
    const prev = state.lastState || "IDLE";
    const next = s.state;
    if (prev !== next) {
      if (next === "WARNING") {
        const mins = Math.max(1, Math.ceil((s.graceRemainingSeconds ?? state.gracePeriod ?? 300) / 60));
        toast("Office Wi-Fi not detected", `Reconnect to the office Wi-Fi within about ${mins} min to keep your attendance running.`);
      } else if (prev === "WARNING" && next === "CONNECTED") {
        toast("Back on office Wi-Fi", "Attendance is running normally.");
      } else if (next === "CONNECTED") {
        toast("Attendance started", s.sessions > 1 ? "Welcome back." : "You are marked present.");
      } else if (next === "ENDED" && (prev === "CONNECTED" || prev === "WARNING")) {
        const m = s.workedMinutes || 0;
        const worked = `${Math.floor(m / 60)}h ${m % 60}m`;
        if (s.signedOut) toast("Attendance stopped", `You logged out of the CRM. Worked today: ${worked}. Log in again to continue.`);
        else if (s.overtimeState === "NO_RESPONSE") toast("No reply received", `Your attendance ended at shift end and the day is marked half day. Open Attendance in the CRM and explain. Worked: ${worked}.`);
        else if (s.overtimeState === "DECLINED") toast("Attendance finished", `Have a good evening. Worked today: ${worked}.`);
        else toast("Attendance paused", `Worked so far today: ${worked}.`);
      }
      state.lastState = next;
      saveState();
    }
  }

  // ---------- "Are you still working?" ----------
  async function sendAnswer(answer) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await api.request("POST", "/api/agent/overtime", { device: device.deviceToken, body: { answer } });
      } catch (err) {
        if (!err.network || attempt === 3) throw err;
        await sleep(3000);
      }
    }
    return null;
  }

  async function showShiftEndQuestion(p) {
    if (promptOpen || asked.has(p.askId)) return;
    asked.add(p.askId);
    promptOpen = true;
    try {
      log.info(`Shift-end question #${p.askId}: asking the employee (${p.secondsLeft}s to answer)`);
      const answer = await prompt.askStillWorking({ secondsLeft: p.secondsLeft, shiftEnd: p.shiftEnd });
      if (answer === "YES" || answer === "NO") {
        const res = await sendAnswer(answer);
        if (res?.status === 200 && res.body.ok) {
          log.info(`Shift-end answer sent: ${answer}`);
          if (answer === "YES") toast("Overtime is being recorded", "Time after your shift end is counted as overtime. You will be asked again in about an hour.");
          else toast("Attendance finished", "Your attendance ended at shift end. Have a good evening.");
        } else {
          toast("Answer not accepted", "The time to answer may have passed, or you already answered. Open Attendance in the CRM to check.");
        }
      } else if (answer === "UNAVAILABLE") {
        toast("Shift ended - are you still working?", "Open Attendance in the CRM and answer Yes or No within a few minutes, otherwise your day is marked as a half day.");
      } else if (answer === "TIMEOUT") {
        log.info("Shift-end question: no answer before the deadline");
      }
    } catch (err) {
      log.warn(`Could not send the shift-end answer: ${err.message}`);
      toast("Could not send your answer", "Please open Attendance in the CRM and answer there.");
    } finally {
      promptOpen = false;
    }
  }

  function handleQuestion(s) {
    if (!s) return;
    if (s.prompt && s.prompt.askId) {
      showShiftEndQuestion(s.prompt); // not awaited: readings keep flowing while the dialog is open
    } else if (promptOpen && s.prompt === null) {
      prompt.cancel(); // answered on the web page (or the time ran out): close the dialog
    }
  }

  // ---------- delivery ----------
  async function flush(force = false) {
    if (flushing || (stopped && !force) || Date.now() < blockedUntil) return;
    flushing = true;
    try {
      while (queue.size() && (!stopped || force)) {
        const items = queue.peek(200);
        const fresh =
          items.length === 1 &&
          items[0].kind === "HEARTBEAT" &&
          Date.now() + offset() - Date.parse(items[0].occurredAt) < 30000;

        const res = fresh
          ? await api.request("POST", "/api/agent/heartbeat", { device: device.deviceToken, body: items[0] })
          : await api.request("POST", "/api/agent/batch", { device: device.deviceToken, body: { events: items }, timeoutMs: 30000 });

        if (res.status === 200) {
          queue.ack(items.length);
          if (!online) {
            online = true;
            log.info(`Back online${fresh ? "" : ` - sent ${items.length} saved reading(s)`}`);
          }
          handleServerState(fresh ? res.body : res.body.state);
          handleQuestion(fresh ? res.body : res.body.state);
          continue;
        }
        if (handleAuthProblem(res)) break;
        if (res.status >= 400 && res.status < 500) {
          // the server will never accept this batch: drop it rather than get stuck forever
          log.warn(`Server rejected ${items.length} reading(s) (${res.status}: ${res.body?.message || "no message"}) - discarding`);
          queue.ack(items.length);
          continue;
        }
        log.warn(`Server error ${res.status}; will retry`);
        break;
      }
    } catch (err) {
      if (err.network) {
        if (online) {
          online = false;
          log.warn(`Cannot reach the server (${err.message}). Readings are saved and will be sent when it is back.`);
        }
      } else {
        log.error(`Delivery error: ${err.message}`);
      }
    } finally {
      flushing = false;
    }
  }

  // ---------- one cycle ----------
  async function tick() {
    if (stopped) return;
    const started = Date.now();
    try {
      if (lastTickAt && started - lastTickAt > interval() * 3000) {
        log.info(`Resumed after ${Math.round((started - lastTickAt) / 1000)}s pause (sleep or suspend)`);
      }
      lastTickAt = started;

      const r = await wifi.current();
      if (r.hidden) {
        once("hidden", () =>
          toast("Wi-Fi details hidden by Windows", "Turn on Settings > Privacy & security > Location so the agent can read the Wi-Fi name.")
        );
      }
      queue.push({ kind: "HEARTBEAT", connected: r.connected, ssid: r.ssid, bssid: r.bssid, occurredAt: nowIso() });
      await flush();
    } catch (err) {
      log.error(`Cycle error: ${err.message}`);
    }
    if (stopped) return;
    const wait = Math.max(1000, interval() * 1000 - (Date.now() - started) + Math.round((Math.random() - 0.5) * 2000));
    timer = setTimeout(tick, wait);
  }

  async function start() {
    log.info(`Agent ${VERSION} started for "${device.userName || "employee"}" -> ${cfg.serverUrl()}`);
    if (queue.size()) log.info(`${queue.size()} reading(s) from the previous run are waiting to be sent`);
    // Don't wait for the server: readings are queued and delivered whenever it is reachable.
    refreshConfig();
    setInterval(refreshConfig, 30 * 60 * 1000).unref?.();
    await tick();
  }

  async function shutdown(reason = "stopped") {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    log.info(`Shutting down (${reason})`);
    try {
      const r = await wifi.current();
      queue.push({ kind: "SHUTDOWN", connected: r.connected, ssid: r.ssid, bssid: r.bssid, occurredAt: nowIso() });
      blockedUntil = 0;
      await Promise.race([flush(true), sleep(4000)]);
    } catch (_) {
      /* the persisted queue will deliver it next start */
    }
    if (queue.size()) log.info(`${queue.size()} reading(s) left in the queue for the next start`);
  }

  return { start, shutdown, flush, tick, refreshConfig };
}

module.exports = { createAgent, VERSION };
