// Durable outbox. Every reading is written here FIRST, then sent.
// If the internet or the server is down, readings pile up on disk (surviving
// restarts and power cuts) and are replayed later WITH THEIR ORIGINAL TIMESTAMPS,
// so the server can tell "was at the office, network was down" from "was away".
const fs = require("fs");
const { files } = require("./config");
const log = require("./log");

const MAX_ITEMS = 3000; // ~75 hours at one reading per 90 s

let items = null;

function load() {
  if (items) return items;
  items = [];
  try {
    for (const line of fs.readFileSync(files().queue, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        items.push(JSON.parse(line));
      } catch (_) {
        /* skip a damaged line */
      }
    }
  } catch (_) {
    /* no file yet */
  }
  return items;
}

function persistAll() {
  const tmp = files().queue + ".tmp";
  fs.writeFileSync(tmp, items.map((i) => JSON.stringify(i)).join("\n") + (items.length ? "\n" : ""));
  fs.renameSync(tmp, files().queue);
}

function push(evt) {
  load();
  items.push(evt);
  if (items.length > MAX_ITEMS) {
    const drop = items.length - MAX_ITEMS;
    items.splice(0, drop);
    log.warn(`Queue full: dropped the ${drop} oldest reading(s)`);
    persistAll();
    return;
  }
  fs.appendFileSync(files().queue, JSON.stringify(evt) + "\n");
}

const peek = (n) => load().slice(0, n);
const size = () => load().length;

function ack(n) {
  load();
  items.splice(0, n);
  persistAll();
}

module.exports = { push, peek, ack, size };
