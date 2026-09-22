// =====================================================
// NETWORK HELPERS  (client IP + browser description)
//
// The desktop agent and the employee's browser both reach the server from the
// office router, so they share the office's public IP (or, when the server is
// on the office LAN, the same private /24). That is how the server can tell
// "this login came from the office" without any extra software in the browser.
// =====================================================

function normalizeIp(ip) {
  let s = String(ip || "").trim();
  if (!s) return "";
  if (s.startsWith("::ffff:")) s = s.slice(7);
  if (s === "::1") s = "127.0.0.1";
  return s;
}

const isPrivateV4 = (ip) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(ip);
const isLoopback = (ip) => ip === "127.0.0.1" || ip === "::1";

/** Same office network: identical address, or two private IPv4 addresses on the same /24 */
function sameNetwork(a, b) {
  const x = normalizeIp(a);
  const y = normalizeIp(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (isPrivateV4(x) && isPrivateV4(y)) return x.split(".").slice(0, 3).join(".") === y.split(".").slice(0, 3).join(".");
  return false;
}

/** "Chrome 141 on Windows (Desktop)" from a User-Agent header */
function parseUserAgent(ua = "") {
  const s = String(ua || "");
  let browser = "Unknown browser";
  let m;
  if ((m = s.match(/Edg(?:e|A|iOS)?\/(\d+)/))) browser = `Edge ${m[1]}`;
  else if ((m = s.match(/OPR\/(\d+)/))) browser = `Opera ${m[1]}`;
  else if ((m = s.match(/(?:Chrome|CriOS)\/(\d+)/))) browser = `Chrome ${m[1]}`;
  else if ((m = s.match(/(?:Firefox|FxiOS)\/(\d+)/))) browser = `Firefox ${m[1]}`;
  else if (/Safari\//.test(s) && (m = s.match(/Version\/(\d+)/))) browser = `Safari ${m[1]}`;
  else if (/node|axios|curl|PostmanRuntime|undici/i.test(s)) browser = "API client";

  let os = "Unknown OS";
  if (/Windows NT 1[01]/.test(s)) os = "Windows 10/11";
  else if (/Windows NT 6\.3/.test(s)) os = "Windows 8.1";
  else if (/Windows NT 6\.[12]/.test(s)) os = "Windows 7/8";
  else if (/Windows/.test(s)) os = "Windows";
  else if (/Android/.test(s)) os = "Android";
  else if (/iPhone|iPad|iPod/.test(s)) os = "iOS";
  else if (/Mac OS X|Macintosh/.test(s)) os = "macOS";
  else if (/Linux/.test(s)) os = "Linux";

  let deviceType = "Desktop";
  if (/iPad|Tablet/.test(s) || (/Android/.test(s) && !/Mobile/.test(s))) deviceType = "Tablet";
  else if (/Mobi|iPhone|Android/.test(s)) deviceType = "Mobile";
  else if (!s) deviceType = "Unknown";

  return { browser, os, deviceType };
}

module.exports = { normalizeIp, sameNetwork, isPrivateV4, isLoopback, parseUserAgent };
