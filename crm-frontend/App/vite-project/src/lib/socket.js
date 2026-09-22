// One Socket.IO connection per role, authenticated with the same JWT the REST calls use.
import { io } from "socket.io-client";
import { API_ORIGIN, getToken } from "./api";

const sockets = {};

export function getSocket(role) {
  const token = getToken(role);
  if (!token) return null;
  let s = sockets[role];
  if (s && s.auth?.token !== token) {
    s.disconnect();
    s = null;
  }
  if (!s) {
    s = io(API_ORIGIN, { auth: { token }, transports: ["websocket", "polling"], reconnectionDelayMax: 10000 });
    sockets[role] = s;
  }
  return s;
}

/** subscribe(role, "notification", handler) -> unsubscribe */
export function subscribe(role, event, handler) {
  const s = getSocket(role);
  if (!s) return () => {};
  s.on(event, handler);
  return () => s.off(event, handler);
}
