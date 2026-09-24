// =====================================================================
// TECHNOLOGIES PROJECTS - the catalog the admin picks from
//
//   6 domains  ->  23 work items. Every item belongs to exactly one domain.
//
// This file is the ONE place the list lives: the admin form loads it from
// GET /api/Project/technology-catalog, and createTechnologyProject validates
// against it. To move an item to another domain, rename one, or add a new one,
// change it here only (keep each item's `id` - old projects store it).
// =====================================================================

const DOMAINS = ["Sales", "Training", "Marketing", "Placement", "HR", "Social Media"];

const ITEMS = [
  { id: 1, title: "Students Training", domain: "Training" },
  { id: 2, title: "Informatic and promotional video", domain: "Marketing" },
  { id: 3, title: "Social media management", domain: "Social Media" },
  { id: 4, title: "College visits", domain: "Sales" },
  { id: 5, title: "Enquiry generation", domain: "Sales" },
  { id: 6, title: "Promotion Poster creation", domain: "Marketing" },
  { id: 7, title: "Workshop and webinars", domain: "Marketing" },
  { id: 8, title: "Paid promotions (Meta campaigns)", domain: "Marketing" },
  { id: 9, title: "Review collection", domain: "Social Media" },
  { id: 10, title: "H.R recruitment", domain: "HR" },
  { id: 11, title: "Am curio marketing", domain: "Marketing" },
  { id: 12, title: "LinkedIn articles", domain: "Social Media" },
  { id: 13, title: "Fees collection follow up", domain: "Sales" },
  { id: 14, title: "Testimonial videos", domain: "Social Media" },
  { id: 15, title: "Regular meetings", domain: "HR" },
  { id: 16, title: "CRM updation", domain: "Sales" },
  { id: 17, title: "Student feedback followup", domain: "Training" },
  { id: 18, title: "Placement training", domain: "Placement" },
  { id: 19, title: "YouTube maintenance", domain: "Social Media" },
  { id: 20, title: "Certification and ID card follow up", domain: "Training" },
  { id: 21, title: "Intern certificate, experience certificate followup", domain: "HR" },
  { id: 22, title: "Offer letter process", domain: "HR" },
  { id: 23, title: "Telecalling for existing students in groups", domain: "Sales" },
];

const byId = new Map(ITEMS.map((i) => [i.id, i]));

/**
 * Turn the ids the admin ticked into the items to store on the project.
 * Duplicates are dropped; the catalog order is kept. Returns null if any id is not in the catalog.
 */
function resolveItems(ids) {
  if (!Array.isArray(ids)) return null;
  const wanted = new Set();
  for (const raw of ids) {
    const id = Number(raw);
    if (!byId.has(id)) return null;
    wanted.add(id);
  }
  return ITEMS.filter((i) => wanted.has(i.id)).map((i) => ({ itemId: i.id, title: i.title, domain: i.domain }));
}

/** The domains that actually appear in a list of items, in catalog order */
const domainsOf = (items) => DOMAINS.filter((d) => items.some((i) => i.domain === d));

module.exports = { DOMAINS, ITEMS, resolveItems, domainsOf };