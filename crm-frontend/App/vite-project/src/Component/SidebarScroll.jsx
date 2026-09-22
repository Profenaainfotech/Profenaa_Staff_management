// The scrolling middle part of a sidebar: slim themed scrollbar, and a soft fade at the top / bottom
// edge that shows there are more menu items to scroll to.
//
//   <SidebarScroll theme="light">...menu...</SidebarScroll>     (white admin sidebar)
//   <SidebarScroll theme="dark">...menu...</SidebarScroll>      (dark staff sidebar)
//
// Put it between a fixed header and a fixed footer inside a flex-column sidebar of a fixed height.
import React, { useCallback, useEffect, useRef, useState } from "react";
import "./SidebarScroll.css";

export default function SidebarScroll({ theme = "light", className = "", children }) {
  const ref = useRef(null);
  const [edge, setEdge] = useState({ top: false, bottom: false });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const top = el.scrollTop > 2;
    const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 2;
    setEdge((cur) => (cur.top === top && cur.bottom === bottom ? cur : { top, bottom }));
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const frame = requestAnimationFrame(update);
    window.addEventListener("resize", update);
    // the menu can change height (badges, a different window size), so watch it as well
    const watcher = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    if (watcher) {
      watcher.observe(el);
      if (el.firstElementChild) watcher.observe(el.firstElementChild);
    }
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
      watcher?.disconnect();
    };
  }, [update]);

  return (
    <div className={`sbs sbs--${theme} ${className}`}>
      <div ref={ref} onScroll={update} className="sbs-scroll" data-sidebar-scroll="">
        <div className="sbs-content">{children}</div>
      </div>
      <div className={`sbs-fade sbs-fade--top${edge.top ? " sbs-fade--on" : ""}`} aria-hidden="true" />
      <div className={`sbs-fade sbs-fade--bottom${edge.bottom ? " sbs-fade--on" : ""}`} aria-hidden="true" />
    </div>
  );
}
