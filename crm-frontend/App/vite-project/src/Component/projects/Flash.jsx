// The banner for success / error messages (they close themselves after 3 seconds, see useFlash.js, and have a close button).
import React from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";

export function FlashBanner({ flash, onClose, className = "" }) {
  if (!flash) return null;
  const ok = flash.kind === "success";
  return (
    <div
      role={ok ? "status" : "alert"}
      className={`flex items-center gap-3 rounded-xl border px-4 py-3 shadow-sm ${ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"} ${className}`}
    >
      {ok ? <CheckCircle2 size={18} className="shrink-0" /> : <AlertCircle size={18} className="shrink-0" />}
      <span className="flex-1 text-sm font-semibold">{flash.message}</span>
      <button type="button" onClick={onClose} className="shrink-0 rounded-lg p-1 hover:bg-black/5" aria-label="Close message">
        <X size={16} />
      </button>
    </div>
  );
}
