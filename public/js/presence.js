// AIM — presence heartbeat. Sends a status ping to /api/presence every 30s
// while the user is signed in. Server expires entries after 60s.

import { Client } from "./client.js";

const HEARTBEAT_MS = 30_000;
const STORAGE_KEY = "aim.status";

export const Presence = {
  status: localStorage.getItem(STORAGE_KEY) || "available",
  timer: null,
  visibilityHandler: null,

  async start() {
    await this._beat();
    this.timer = setInterval(() => this._beat(), HEARTBEAT_MS);

    this.visibilityHandler = () => {
      if (document.visibilityState === "visible") this._beat();
    };
    document.addEventListener("visibilitychange", this.visibilityHandler);
  },

  setStatus(status) {
    if (!["available", "away", "invisible"].includes(status)) return;
    this.status = status;
    localStorage.setItem(STORAGE_KEY, status);
    this._beat();
  },

  async stop() {
    if (this.timer) clearInterval(this.timer);
    if (this.visibilityHandler) document.removeEventListener("visibilitychange", this.visibilityHandler);
    try {
      await Client.clearPresence();
    } catch {
      // best effort
    }
  },

  async _beat() {
    try {
      await Client.heartbeat(this.status);
    } catch (e) {
      console.warn("[aim/presence] heartbeat failed:", e.message);
    }
  },
};
