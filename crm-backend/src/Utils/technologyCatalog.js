// =====================================================================
// TECHNOLOGIES PROJECTS - the catalog the admin picks from
//
//   7 domains  ->  25 work items. Every item belongs to exactly one domain.
//
// This file is the ONE place the list lives: the admin form loads it from
// GET /api/Project/technology-catalog, and createTechnologyProject validates
// against it. To move an item to another domain, rename one, or add a new one,
// change it here only (keep each item's `id` - old projects store it).
//
// Projects / work items the admin deletes from the form are remembered in the
// TechCatalogState collection and filtered out by current() - see below.
// Projects / work items the admin ADDS with "+ Add new" are stored there too, so they are
// permanent: current() returns the built-in list plus everything the admin added.
// Work items the admin RENAMES are stored there too (renameItem), so the new name is permanent.
// =====================================================================

const TechCatalogState = require("../Models/TechCatalogState.Model");
const STATE_KEY = "technologies";
const CUSTOM_ID_BASE = 1000; // custom work items get 1001, 1002, ... (built-in ones are 1-26)

const DOMAINS = ["Sales", "Training", "Marketing", "Placement", "HR", "Social Media", "Branding"];

const ITEMS = [
  { id: 1, title: "Projects training", domain: "Training" },
  { id: 2, title: "information promotion videos", domain: "Marketing" },
  { id: 3, title: "Social media management", domain: "Social Media" },
  { id: 4, title: "College visits", domain: "Sales" },
  { id: 5, title: "Enquiry generation", domain: "Sales" },
  { id: 6, title: "Promotion Posters creation", domain: "Marketing" },
  { id: 7, title: "Workshops and webinars", domain: "Marketing" },
  { id: 8, title: "Paid promotions (Meta campaigns)", domain: "Marketing" },
  { id: 9, title: "Review collections", domain: "Social Media" },
  { id: 10, title: "H.R recruitment", domain: "HR" },
  { id: 11, title: "Amcurio marketing", domain: "Branding" },
  { id: 12, title: "LinkedIn articles", domain: "Social Media" },
  { id: 13, title: "Fees collections follow up", domain: "Sales" },
  { id: 14, title: "Testimonial videos", domain: "Social Media" },
  { id: 15, title: "Regular meetings", domain: "HR" },
  { id: 16, title: "CRM updation", domain: "Sales" },
  { id: 17, title: "Students feedback followup", domain: "Training" },
  { id: 18, title: "Placement training", domain: "Placement" },
  { id: 19, title: "YouTube maintenance", domain: "Social Media" },
  { id: 21, title: "Intern certificates, experience certificates followup", domain: "HR" },
  { id: 22, title: "Offer letters process", domain: "HR" },
  { id: 23, title: "Telecalling for lead generation", domain: "Sales" },
  { id: 24, title: "Profenaa Charitable Trust", domain: "Branding" },
  { id: 25, title: "Kalviyin Kural", domain: "Branding" },
  { id: 26, title: "Youth Leadership Parliament", domain: "Branding" },
];

const clean = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

/**
 * The catalog as the admin sees it right now: the built-in list plus everything the admin
 * added, minus whatever was deleted from the form (a deleted project takes all of its work
 * items with it).
 */
async function current() {
  const state = await TechCatalogState.findOne({ key: STATE_KEY }).lean();
  const goneDomains = new Set(state?.removedDomains || []);
  const goneItems = new Set(state?.removedItemIds || []);
  const customDomains = (state?.customDomains || []).filter((d) => !DOMAINS.some((b) => same(b, d)));
  const renamed = new Map((state?.renamedItems || []).map((r) => [r.id, r.title]));

  const domains = [...DOMAINS.filter((d) => !goneDomains.has(d)), ...customDomains];
  const items = [
    ...ITEMS.filter((i) => !goneItems.has(i.id) && !goneDomains.has(i.domain)).map((i) => ({ ...i, title: renamed.get(i.id) || i.title })),
    ...(state?.customItems || []).filter((i) => !goneItems.has(i.id) && domains.includes(i.domain)).map((i) => ({ id: i.id, title: i.title, domain: i.domain })),
  ];
  // customDomains = the ones the admin added (the form shows a remove button on those)
  return { domains, items, customDomains: customDomains.filter((d) => domains.includes(d)) };
}

/**
 * Add a project (domain) to the catalog for good. Adding a name that already exists (any
 * case) just returns the existing one; adding back a built-in one that was deleted restores it.
 * Returns the stored name.
 */
async function addDomain(rawName) {
  const name = clean(rawName, 60);
  if (!name) return null;
  const { domains } = await current();
  const existing = domains.find((d) => same(d, name));
  if (existing) return existing;

  const builtIn = DOMAINS.find((d) => same(d, name));
  if (builtIn) {
    await TechCatalogState.updateOne({ key: STATE_KEY }, { $pull: { removedDomains: builtIn } }, { upsert: true });
    return builtIn;
  }
  await TechCatalogState.updateOne({ key: STATE_KEY }, { $addToSet: { customDomains: name } }, { upsert: true });
  return name;
}

/**
 * Add a work item to a project (domain) for good. The domain must already be in the catalog.
 * The same title in the same project is not added twice - the existing one is returned.
 * Custom ids start at 1001, so they never clash with a built-in id. Returns { id, title, domain },
 * or null if the title is empty or the domain is not in the catalog.
 */
async function addItem(rawTitle, rawDomain) {
  const title = clean(rawTitle, 200);
  if (!title) return null;
  const { domains, items } = await current();
  const domain = domains.find((d) => same(d, clean(rawDomain, 60)));
  if (!domain) return null;

  const existing = items.find((i) => i.domain === domain && same(i.title, title));
  if (existing) return existing;

  // atomic counter: two admins adding at the same moment can never get the same id
  const state = await TechCatalogState.findOneAndUpdate({ key: STATE_KEY }, { $inc: { customIdCounter: 1 } }, { upsert: true, returnDocument: "after" });
  const item = { id: CUSTOM_ID_BASE + state.customIdCounter, title, domain };
  await TechCatalogState.updateOne({ key: STATE_KEY }, { $push: { customItems: item } });
  return item;
}

/**
 * Give a work item a new name for good (built-in or added). Its id, project and place in the list
 * stay the same; projects that already used it keep the name they were created with.
 * Returns the updated { id, title, domain }, null if the id is not in the catalog / the title is
 * empty, or "DUPLICATE" if another work item in the same project already has that name.
 */
async function renameItem(id, rawTitle) {
  const title = clean(rawTitle, 200);
  if (!title) return null;
  const { items } = await current();
  const item = items.find((i) => i.id === id);
  if (!item) return null;
  if (items.some((i) => i.id !== id && i.domain === item.domain && same(i.title, title))) return "DUPLICATE";

  if (ITEMS.some((i) => i.id === id)) {
    const hit = await TechCatalogState.updateOne({ key: STATE_KEY, "renamedItems.id": id }, { $set: { "renamedItems.$.title": title } });
    if (!hit.matchedCount) await TechCatalogState.updateOne({ key: STATE_KEY }, { $push: { renamedItems: { id, title } } }, { upsert: true });
  } else {
    await TechCatalogState.updateOne({ key: STATE_KEY, "customItems.id": id }, { $set: { "customItems.$.title": title } });
  }
  return { id, title, domain: item.domain };
}

/** Delete a project (domain) from the catalog. Returns false if it is not in the current catalog. */
async function removeDomain(name) {
  const { domains } = await current();
  const domain = domains.find((d) => d === name);
  if (!domain) return false;
  if (DOMAINS.includes(domain)) {
    await TechCatalogState.updateOne({ key: STATE_KEY }, { $addToSet: { removedDomains: domain } }, { upsert: true });
  } else {
    await TechCatalogState.updateOne({ key: STATE_KEY }, { $pull: { customDomains: domain, customItems: { domain } } });
  }
  return true;
}

/** Delete one work item from the catalog. Returns false if it is not in the current catalog. */
async function removeItem(id) {
  const { items } = await current();
  if (!items.some((i) => i.id === id)) return false;
  if (ITEMS.some((i) => i.id === id)) {
    await TechCatalogState.updateOne({ key: STATE_KEY }, { $addToSet: { removedItemIds: id } }, { upsert: true });
  } else {
    await TechCatalogState.updateOne({ key: STATE_KEY }, { $pull: { customItems: { id } } });
  }
  return true;
}

/**
 * Turn the ids the admin ticked into the items to store on the project.
 * Duplicates are dropped; the catalog order is kept. Returns null if any id is not in `list`
 * (pass the current() items so deleted ones are rejected; defaults to the built-in list).
 * Every stored item carries a real numeric itemId.
 */
function resolveItems(ids, list = ITEMS) {
  if (!Array.isArray(ids)) return null;
  const byId = new Map(list.map((i) => [i.id, i]));
  const wanted = new Set();
  for (const raw of ids) {
    const id = Number(raw);
    if (!byId.has(id)) return null;
    wanted.add(id);
  }
  return list.filter((i) => wanted.has(i.id)).map((i) => ({ itemId: i.id, title: i.title, domain: i.domain }));
}

/** The domains that actually appear in a list of items: built-in ones in catalog order, then any added ones */
const domainsOf = (items) => {
  const present = [...new Set(items.map((i) => i.domain))];
  return [...DOMAINS.filter((d) => present.includes(d)), ...present.filter((d) => !DOMAINS.includes(d))];
};

module.exports = { DOMAINS, ITEMS, current, addDomain, addItem, renameItem, removeDomain, removeItem, resolveItems, domainsOf };