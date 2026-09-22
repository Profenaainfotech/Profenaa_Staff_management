// Small helpers so every new endpoint answers in the same JSON shape the CRM already uses:
//   { success: true, ... }   /   { success: false, message }
const ok = (res, data = {}, status = 200) => res.status(status).json({ success: true, ...data });
const fail = (res, status, message, extra = {}) => res.status(status).json({ success: false, message, ...extra });

/** Wrap an async handler: thrown errors become JSON responses (err.status is honoured). */
const handle = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    if (err.status) return fail(res, err.status, err.message);
    if (err.name === "ValidationError") return fail(res, 400, Object.values(err.errors).map((e) => e.message).join(", "));
    if (err.name === "CastError") return fail(res, 400, "Invalid id or value");
    if (err.code === 11000) return fail(res, 409, "That record already exists");
    console.error(`[API] ${req.method} ${req.originalUrl}:`, err);
    return fail(res, 500, "Server error");
  }
};

const isObjectId = (v) => /^[a-f0-9]{24}$/i.test(String(v || ""));
const httpError = (status, message) => Object.assign(new Error(message), { status });

module.exports = { ok, fail, handle, isObjectId, httpError };
