// Read-only display of a Technologies project's domains and work items.
// Used by the admin's project details and by the staff dashboard / My Tasks, so both sides
// see the same thing. `items` is [{ itemId, title, domain }], `domains` is ["Sales", ...].
import React from "react";
import { ListChecks } from "lucide-react";
import { DOMAIN_STYLE } from "./projectApi";

export function DomainChips({ domains = [], className = "" }) {
  if (!domains.length) return null;
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {domains.map((d) => (
        <span key={d} className={`rounded-full border px-2.5 py-0.5 text-[10px] font-black ${DOMAIN_STYLE[d] || "bg-slate-50 text-slate-600 border-slate-200"}`}>
          {d}
        </span>
      ))}
    </div>
  );
}

/** The allocated work items, grouped under their domain. */
export function WorkItemList({ items = [], domains, className = "" }) {
  if (!items.length) return null;
  const groups = (domains?.length ? domains : [...new Set(items.map((i) => i.domain))]).map((d) => [d, items.filter((i) => i.domain === d)]).filter(([, list]) => list.length);
  return (
    <div className={className}>
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-slate-500">
        <ListChecks size={14} className="text-teal-600" />
        Work allocated ({items.length})
      </p>
      <div className="space-y-3">
        {groups.map(([domain, list]) => (
          <div key={domain}>
            <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-black ${DOMAIN_STYLE[domain] || "bg-slate-50 text-slate-600 border-slate-200"}`}>{domain}</span>
            <ul className="mt-1.5 space-y-1">
              {list.map((i) => (
                <li key={i.itemId} className="flex items-start gap-2 text-xs font-semibold text-slate-700">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded bg-teal-100 text-[9px] font-black text-teal-700">{i.itemId}</span>
                  <span className="break-words">{i.title}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}