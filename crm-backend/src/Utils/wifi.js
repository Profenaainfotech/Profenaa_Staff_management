// =====================================================
// WI-FI MATCHING HELPERS
// =====================================================
// A device counts as "in the office" only when BOTH its SSID and BSSID match an
// active network registered on the employee's assigned branch. BSSID is the
// access point's hardware address, so a phone hotspot that merely copies the
// SSID "PROFENAA-5G" does not pass.
//
// BSSID patterns may end in a wildcard so that one entry can cover every radio
// of the same router, e.g.  8C:C7:C3:09:1D:*  matches ...:70 and ...:74.
// =====================================================

function normalizeBssid(value = "") {
  let s = String(value || "").trim().toUpperCase().replace(/-/g, ":");
  // 8CC7C3091D70 -> 8C:C7:C3:09:1D:70
  if (/^[0-9A-F]{12}$/.test(s)) {
    s = s.match(/.{2}/g).join(":");
  }
  return s;
}

function normalizeSsid(value = "") {
  return String(value || "")
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/**
 * Valid full BSSID ("8C:C7:C3:09:1D:70") or prefix pattern ending in "*"
 * ("8C:C7:C3:09:1D:*", "8C:C7:C3:*"). A wildcard pattern must keep at least
 * three fixed octets so nobody can accidentally authorise every network.
 */
function isValidBssidPattern(value) {
  const parts = normalizeBssid(value).split(":");
  const wildcard = parts[parts.length - 1] === "*";
  const fixed = wildcard ? parts.slice(0, -1) : parts;

  if (!wildcard && parts.length !== 6) return false;
  if (wildcard && (parts.length < 4 || parts.length > 6)) return false;
  if (!fixed.every((p) => /^[0-9A-F]{2}$/.test(p))) return false;
  return fixed.length >= 3;
}

function bssidMatches(pattern, bssid) {
  if (!isValidBssidPattern(pattern)) return false;
  const p = normalizeBssid(pattern).split(":");
  const b = normalizeBssid(bssid).split(":");
  if (b.length !== 6 || !b.every((x) => /^[0-9A-F]{2}$/.test(x))) return false;

  if (p[p.length - 1] === "*") {
    const prefix = p.slice(0, -1);
    return prefix.every((part, i) => part === b[i]);
  }
  return p.every((part, i) => part === b[i]);
}

/**
 * @param {object} branch  Branch document / plain object with networks[]
 * @param {string} ssid
 * @param {string} bssid
 */
function isAuthorizedNetwork(branch, ssid, bssid) {
  if (!branch || branch.active === false || !Array.isArray(branch.networks)) return false;
  if (!ssid || !bssid) return false;
  const wantedSsid = normalizeSsid(ssid);
  return branch.networks.some(
    (n) =>
      n.active !== false &&
      normalizeSsid(n.ssid) === wantedSsid &&
      bssidMatches(n.bssid, bssid)
  );
}

module.exports = {
  normalizeBssid,
  normalizeSsid,
  isValidBssidPattern,
  bssidMatches,
  isAuthorizedNetwork,
};
