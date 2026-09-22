// Small fetch wrapper for the new Wi-Fi attendance / notification / staff APIs.
// The existing screens keep calling the backend the way they always did.
//
// Base URL: VITE_API_URL if set, otherwise the same http://localhost:8000 the rest of the app uses.
export const API_ORIGIN = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export const getToken = (role) => localStorage.getItem(role === "admin" ? "adminToken" : "authToken");

async function request(method, path, { role = "user", body, query } = {}) {
  const qs = query
    ? "?" +
      Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&")
    : "";

  let res;
  try {
    res = await fetch(`${API_ORIGIN}${path}${qs === "?" ? "" : qs}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken(role)}`,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Cannot reach the server. Check your connection.", 0);
  }

  let data = {};
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok || data.success === false) {
    throw new ApiError(data.message || `Request failed (${res.status})`, res.status);
  }
  return data;
}

export const makeApi = (role) => ({
  get: (path, query) => request("GET", path, { role, query }),
  post: (path, body) => request("POST", path, { role, body: body ?? {} }),
  put: (path, body) => request("PUT", path, { role, body: body ?? {} }),
  patch: (path, body) => request("PATCH", path, { role, body: body ?? {} }),
  del: (path) => request("DELETE", path, { role }),
});
