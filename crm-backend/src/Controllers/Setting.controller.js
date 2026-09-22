const { getSettings, updateSettings } = require("../Services/settings.service");
const { ok, handle, httpError } = require("../Utils/http");

const get = handle(async (req, res) => {
  const s = await getSettings();
  ok(res, { settings: s });
});

const update = handle(async (req, res) => {
  const result = await updateSettings(req.body || {});
  if (result.errors) throw httpError(400, result.errors.join(". "));
  ok(res, { settings: result.settings });
});

module.exports = { get, update };
