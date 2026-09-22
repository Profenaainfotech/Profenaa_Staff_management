// Success / error messages that disappear by themselves after 3 seconds.
//   const { flash, success, error, clear } = useFlash();
//   <FlashBanner flash={flash} onClose={clear} />   (see Flash.jsx)
import { useCallback, useEffect, useRef, useState } from "react";

export const FLASH_MS = 3000;

export function useFlash(ms = FLASH_MS) {
  const [flash, setFlash] = useState(null); // { kind: "success" | "error", message, id }
  const timer = useRef(null);
  const clear = useCallback(() => {
    clearTimeout(timer.current);
    setFlash(null);
  }, []);
  const show = useCallback(
    (kind, message) => {
      clearTimeout(timer.current);
      setFlash({ kind, message, id: Date.now() });
      timer.current = setTimeout(() => setFlash(null), ms); // the newest message always gets its full time
    },
    [ms]
  );
  useEffect(() => () => clearTimeout(timer.current), []);
  return { flash, success: (m) => show("success", m), error: (m) => show("error", m), clear };
}
