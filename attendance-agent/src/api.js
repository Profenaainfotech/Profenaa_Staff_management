// Talks to the CRM backend. Uses Node's built-in fetch (Node 18+).
const { serverUrl } = require("./config");

async function request(method, path, { body, token, device, timeoutMs = 15000 } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (device) headers.Authorization = `Device ${device}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(serverUrl() + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    let json = {};
    try {
      json = await res.json();
    } catch (_) {
      /* non-JSON body */
    }
    return { status: res.status, body: json };
  } catch (err) {
    // DNS failure, refused connection, timeout ... => "we are offline"
    const e = new Error(err.name === "AbortError" ? "Request timed out" : err.cause?.code || err.message);
    e.network = true;
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { request };
