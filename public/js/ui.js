// AIM — UI controller. Wires buddy list, chat panes, and polling.

import { Client } from "./client.js";
import { Sounds } from "./sounds.js";
import { Realtime } from "./realtime.js";

const USER_COLORS = ["--user-1","--user-2","--user-3","--user-4","--user-5","--user-6","--user-7","--user-8"];

const state = {
  me: null,
  rooms: [],
  motd: null,
  serverName: "AIM Server",
  activeRoom: null,
  openRooms: new Set(),
  roomState: {},
};

function $(sel, root = document) { return root.querySelector(sel); }
function $$(sel, root = document) { return [...root.querySelectorAll(sel)]; }

function userColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return `var(${USER_COLORS[h % USER_COLORS.length]})`;
}

function hhmm(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function highlightMentions(text) {
  return escapeHtml(text).replace(
    /(^|[\s(])@([A-Za-z0-9_][A-Za-z0-9_-]{0,38})/g,
    (_, prefix, name) => `${prefix}<span class="mention">@${name}</span>`,
  );
}

export async function bootChat() {
  if (!Client.getToken()) {
    location.href = "/";
    return;
  }
  try {
    const me = await Client.me();
    state.me = me;
    state.rooms = me.rooms;
    state.motd = me.motd;
    state.serverName = me.server_name;
  } catch (e) {
    console.error("auth failed", e);
    Client.clearToken();
    location.href = "/";
    return;
  }

  renderBuddyList();
  renderEmptyChat();
  Sounds.signon();
  await startRealtime();
  setupComposeHandlers();
  setupToolbar();
}

async function startRealtime() {
  for (const room of state.rooms) {
    Realtime.subscribe(room, () => refreshRoom(room));
  }
  await Realtime.init(state.me.realtime);
}

function renderBuddyList() {
  $("#serverName").textContent = state.serverName;
  $("#meName").textContent = state.me.name;
  $("#meRole").textContent = state.me.role;
  if (state.motd) {
    $("#motd").textContent = state.motd;
    $("#motd").classList.remove("hidden");
  }

  const roomList = $("#roomList");
  roomList.innerHTML = "";
  for (const room of state.rooms) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="dot"></span> #${escapeHtml(room)}`;
    li.dataset.room = room;
    li.addEventListener("dblclick", () => openRoom(room));
    li.addEventListener("click", () => openRoom(room));
    roomList.appendChild(li);
  }
}

function renderEmptyChat() {
  $("#chatPane .window-body").innerHTML = `
    <div class="chat-empty">
      <div style="text-align:center">
        <div class="aim-brand" style="justify-content:center">
          <img src="img/logo.png" alt="AIM"/>
        </div>
        <p>Double-click a room in your Buddy List to start chatting.</p>
      </div>
    </div>`;
  $("#chatPane .title-bar-text").textContent = "AIM";
}

function openRoom(room) {
  state.activeRoom = room;
  state.openRooms.add(room);
  if (!state.roomState[room]) {
    state.roomState[room] = { messages: [], lastSinceIso: null, pins: [], pinIndex: new Set() };
  }
  $$("#roomList li").forEach((li) =>
    li.classList.toggle("active", li.dataset.room === room),
  );
  renderChatWindow();
  refreshRoom(room, { initial: true });
  refreshPins(room);
}

function renderChatWindow() {
  const room = state.activeRoom;
  if (!room) return renderEmptyChat();
  const body = $("#chatPane .window-body");
  body.innerHTML = `
    <div class="pin-bar hidden" id="pinBar"></div>
    <div class="transcript" id="transcript"></div>
    <div class="compose-toolbar">
      <button title="Bold (cosmetic)"><b>B</b></button>
      <button title="Italic (cosmetic)"><i>I</i></button>
      <button title="Underline (cosmetic)"><u>U</u></button>
      <span class="sep"></span>
      <button title="Color (cosmetic)" style="color:#c00">A</button>
      <span class="sep"></span>
      <button id="searchBtn" title="Search this room">🔍</button>
      <span class="spacer" style="flex:1"></span>
    </div>
    <div class="compose">
      <textarea id="composer" placeholder="Type your message..."></textarea>
      <button id="sendBtn">Send</button>
    </div>`;
  $("#chatPane .title-bar-text").textContent = `${room} — Chat`;

  $("#sendBtn").addEventListener("click", sendMessage);
  $("#composer").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  $("#searchBtn").addEventListener("click", openSearchDialog);
  renderTranscript();
}

function renderTranscript() {
  const room = state.activeRoom;
  if (!room) return;
  const st = state.roomState[room];
  const t = $("#transcript");
  if (!t) return;
  t.innerHTML = "";
  for (const m of st.messages) {
    const div = document.createElement("div");
    div.className = "msg";
    if (m.author === state.me.name) div.classList.add("own");
    const pinned = st.pinIndex.has(m.sha) ? "pinned" : "";
    div.innerHTML = `
      <span class="author" style="color:${userColor(m.author)}">${escapeHtml(m.author)}</span>
      <span class="body">${highlightMentions(m.text)}</span>
      <span class="ts">${hhmm(m.sent_at)}</span>
      ${m.edited_at ? '<span class="edited">(edited)</span>' : ""}
      <span class="star ${pinned}" data-sha="${m.sha}" title="Pin/unpin">★</span>`;
    t.appendChild(div);
  }
  const star = t.querySelectorAll(".star");
  star.forEach((el) => el.addEventListener("click", togglePin));
  t.scrollTop = t.scrollHeight;
}

async function refreshRoom(room, { initial = false } = {}) {
  const st = state.roomState[room];
  try {
    const opts = {};
    if (st.lastSinceIso) opts.since = st.lastSinceIso;
    const res = await Client.readRoom(room, opts);
    const newMessages = res.messages || [];
    if (newMessages.length > 0) {
      const existingShas = new Set(st.messages.map((m) => m.sha + ":" + m.path));
      for (const m of newMessages) {
        const k = m.sha + ":" + m.path;
        if (!existingShas.has(k)) st.messages.push(m);
      }
      st.messages.sort((a, b) => a.sent_at.localeCompare(b.sent_at));
      const last = st.messages[st.messages.length - 1];
      if (last) {
        const lastDate = new Date(last.sent_at);
        lastDate.setSeconds(lastDate.getSeconds() + 1);
        st.lastSinceIso = lastDate.toISOString();
      }
      if (!initial && room === state.activeRoom) Sounds.message();
      if (room === state.activeRoom) renderTranscript();
    }
  } catch (e) {
    console.error(`refreshRoom(${room}) failed:`, e);
  }
}

async function refreshPins(room) {
  try {
    const res = await Client.listPins(room);
    const st = state.roomState[room];
    st.pins = res.pins || [];
    st.pinIndex = new Set(st.pins.map((p) => p.sha));
    if (room === state.activeRoom) {
      const bar = $("#pinBar");
      if (bar) {
        if (st.pins.length === 0) {
          bar.classList.add("hidden");
        } else {
          bar.classList.remove("hidden");
          bar.textContent = `📌 ${st.pins.length} pinned — click to view`;
        }
      }
      renderTranscript();
    }
  } catch (e) {
    console.error("refreshPins failed:", e);
  }
}

async function sendMessage() {
  const composer = $("#composer");
  const text = composer.value.trim();
  if (!text) return;
  const room = state.activeRoom;
  const sendBtn = $("#sendBtn");
  sendBtn.disabled = true;
  composer.disabled = true;
  try {
    Sounds.send();
    await Client.send(room, text, crypto.randomUUID());
    composer.value = "";
    await refreshRoom(room);
  } catch (e) {
    Sounds.error();
    alert("Failed to send: " + e.message);
  } finally {
    sendBtn.disabled = false;
    composer.disabled = false;
    composer.focus();
  }
}

async function togglePin(e) {
  e.stopPropagation();
  const sha = e.currentTarget.dataset.sha;
  const room = state.activeRoom;
  const st = state.roomState[room];
  try {
    if (st.pinIndex.has(sha)) {
      await Client.unpin(room, sha);
    } else {
      await Client.pin(room, sha);
    }
    await refreshPins(room);
  } catch (err) {
    alert("Pin operation failed: " + err.message);
  }
}

function setupComposeHandlers() {
  // Placeholder for future toolbar handlers
}

function setupToolbar() {
  $("#signoffBtn").addEventListener("click", () => {
    Sounds.signoff();
    Realtime.stop();
    Client.clearToken();
    setTimeout(() => (location.href = "/"), 400);
  });
  $("#muteBtn").addEventListener("click", () => {
    const muted = Sounds.toggle();
    $("#muteBtn").textContent = muted ? "🔇" : "🔊";
  });
  $("#muteBtn").textContent = Sounds.isMuted() ? "🔇" : "🔊";

  $("#statusPill").addEventListener("click", () => {
    const options = ["Available", "Away", "Invisible"];
    const cur = $("#statusPill .label").textContent;
    const next = options[(options.indexOf(cur) + 1) % options.length];
    $("#statusPill .label").textContent = next;
    const dot = $("#statusPill .dot");
    dot.style.background = next === "Available" ? "#2ecc40" : next === "Away" ? "#f1c40f" : "#888";
  });
}

function openSearchDialog() {
  const q = prompt("Search messages in this room:");
  if (!q) return;
  Client.search(q, state.activeRoom).then((res) => {
    const list = (res.results || [])
      .map((r) => `[${hhmm(r.sent_at)}] ${r.author}: ${r.text}`)
      .join("\n");
    alert(list || "No matches found.");
  }).catch((e) => alert("Search failed: " + e.message));
}

// Sign-on page handler
export function bootSignOn() {
  if (Client.getToken()) {
    // Try to validate token quickly
    Client.me()
      .then(() => (location.href = "/chat"))
      .catch(() => Client.clearToken());
  }
  $("#signonForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const token = $("#tokenInput").value.trim();
    if (!token) return;
    Client.setToken(token);
    try {
      await Client.me();
      location.href = "/chat";
    } catch (err) {
      Client.clearToken();
      $("#signonError").textContent = err.message;
      $("#signonError").classList.remove("hidden");
    }
  });
}
