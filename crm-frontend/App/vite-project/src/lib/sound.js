// Notification sounds.
// A short tone is generated in the browser (no audio files). Different severities sound different:
// info = one soft note, success = rising two notes, warning = double beep, critical = urgent three notes.
//
// Browsers only allow sound after the person has clicked or typed on the page at least once;
// the first interaction unlocks it automatically.
const KEY = "notificationSound";

let ctx = null;

export const isMuted = () => {
  try {
    return localStorage.getItem(KEY) === "off";
  } catch {
    return false;
  }
};

export const setMuted = (muted) => {
  try {
    localStorage.setItem(KEY, muted ? "off" : "on");
  } catch {
    /* private mode: the setting just is not remembered */
  }
};

function audio() {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!ctx) {
    try {
      ctx = new AC();
    } catch {
      return null;
    }
  }
  return ctx;
}

/** Called on the first click / key press so later alerts are allowed to make sound */
export function unlockAudio() {
  const c = audio();
  if (c && c.state === "suspended") c.resume().catch(() => {});
}

if (typeof window !== "undefined") {
  const once = () => {
    unlockAudio();
    ["pointerdown", "keydown", "touchstart"].forEach((e) => window.removeEventListener(e, once));
  };
  ["pointerdown", "keydown", "touchstart"].forEach((e) => window.addEventListener(e, once, { passive: true }));
}

// [frequency Hz, length s] notes
const TUNES = {
  info: [[880, 0.16]],
  success: [[660, 0.12], [880, 0.2]],
  warning: [[740, 0.14], [740, 0.14]],
  critical: [[988, 0.15], [784, 0.15], [988, 0.22]],
};

/** Play the alert tone for a severity. Returns true when a sound was scheduled. */
export function playAlert(severity = "info") {
  if (isMuted()) return false;
  const c = audio();
  if (!c) return false;
  if (c.state === "suspended") {
    c.resume().catch(() => {});
    if (c.state === "suspended") return false; // nobody has interacted with the page yet
  }
  const tune = TUNES[severity] || TUNES.info;
  let t = c.currentTime + 0.02;
  for (const [freq, len] of tune) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + len);
    osc.connect(gain).connect(c.destination);
    osc.start(t);
    osc.stop(t + len + 0.03);
    t += len + 0.07;
  }
  return true;
}

const RANK = { info: 0, success: 1, warning: 2, critical: 3 };
/** The loudest severity in a list of notifications */
export const topSeverity = (list) => list.reduce((best, n) => (RANK[n.severity] > RANK[best] ? n.severity : best), "info");
