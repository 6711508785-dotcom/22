import { Client } from "https://esm.sh/colyseus.js@0.16.22";

const $ = (id) => document.getElementById(id);
const SERVER_URL = window.WFOH_SERVER_URL ||
  (location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "ws://localhost:2567"
    : "wss://YOUR-MULTIPLAYER-SERVER.example.com");

let client;
let room = null;
let role = null;
let joined = false;
let previousStatus = "waiting";
let previousMission = 1;
let paused = false;

function status(message, error = false) {
  const el = $("mp-status");
  if (el) {
    el.textContent = message;
    el.style.color = error ? "#fecaca" : "#bae6fd";
  }
}
function setBusy(button, busy) {
  if (button) button.disabled = busy;
}
function getClient() {
  if (!client) {
    if (SERVER_URL.includes("YOUR-MULTIPLAYER-SERVER")) {
      throw new Error("ยังไม่ได้ตั้งค่า URL ของเซิร์ฟเวอร์ Multiplayer");
    }
    client = new Client(SERVER_URL);
  }
  return client;
}
function showGameEntry(name, number) {
  $("mp-gateway").hidden = true;
  $("input-name").value = name || "";
  $("input-no").value = number || "";
  if (window.showScreen) showScreen("screen-register");
}
function playerRecords(state) {
  const rows = [];
  if (state?.players?.forEach) {
    state.players.forEach((p, id) => rows.push({
      id, name: p.name, number: p.number, role: p.role,
      x: p.x, y: p.y, z: p.z, rotY: p.rotY,
      appearanceJson: p.appearanceJson, score: p.score
    }));
  }
  return rows;
}
function renderRoster(state) {
  const rows = playerRecords(state);
  const count = rows.length;
  $("mp-player-count").textContent = `ผู้เล่น ${count} / 50 คน`;
  $("mp-dock-count").textContent = `${count} / 50 คน`;
  const list = $("mp-player-list");
  list.innerHTML = rows.map((p, i) =>
    `<div>${i + 1}. ${escapeHtml(p.name)} ${p.role === "teacher" ? "👩‍🏫" : ""}</div>`
  ).join("");
  if (window.WFOHBridge) window.WFOHBridge.setRemotePlayers(rows, room?.sessionId);
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[c]));
}
function bindRoomEvents(joinedRoom) {
  joinedRoom.onStateChange((state) => {
    renderRoster(state);
    if (state.status !== previousStatus || state.missionId !== previousMission) {
      previousStatus = state.status;
      previousMission = state.missionId;
      paused = state.status === "paused" || state.status === "ended";
      if (window.WFOHNet) window.WFOHNet.isPaused = paused;
      if (window.WFOHBridge) window.WFOHBridge.showServerStatus(state.status, state.missionId);
      if (state.status === "playing") status(`เกมกำลังเล่น • ภารกิจ ${state.missionId}`);
      if (state.status === "paused") status("ครูหยุดเกมชั่วคราว");
      if (state.status === "ended") status("ครูจบเกมแล้ว");
    }
  });
  joinedRoom.onMessage("chat", (message) => {
    if (window.showToast) showToast(`${message.name}: ${message.text}`);
  });
  joinedRoom.onMessage("teacher:left", () => {
    status("ครูออกจากห้องแล้ว ห้องถูกปิด", true);
    if (window.showToast) showToast("ครูออกจากห้องแล้ว", true);
  });
  joinedRoom.onLeave((code) => {
    joined = false;
    room = null;
    $("mp-teacher-dock").hidden = true;
    status(`การเชื่อมต่อห้องสิ้นสุด (รหัส ${code})`, true);
  });
}
async function createRoom() {
  const button = $("mp-create-room");
  setBusy(button, true);
  status("กำลังสร้างห้องเรียน...");
  try {
    const name = $("mp-teacher-name").value.trim() || "ครูผู้ควบคุม";
    const teacherPin = $("mp-teacher-pin").value;
    if (!teacherPin) throw new Error("กรุณากรอกรหัสผ่านครู");
    room = await getClient().create("classroom", { role: "teacher", teacherPin, name });
    role = "teacher";
    joined = true;
    bindRoomEvents(room);
    $("mp-room-code-display").textContent = room.id;
    $("mp-room-info").hidden = false;
    $("mp-teacher-dock").hidden = false;
    status("สร้างห้องสำเร็จ ส่งรหัสนี้ให้นักเรียนเข้าร่วม");
    $("mp-enter-game").textContent = "เข้าสู่เกมในฐานะครู";
  } catch (error) {
    status(error?.message || "สร้างห้องไม่สำเร็จ ตรวจสอบ PIN และ URL เซิร์ฟเวอร์", true);
  } finally { setBusy(button, false); }
}
async function joinRoom() {
  const button = $("mp-join-room");
  setBusy(button, true);
  status("กำลังเชื่อมต่อห้องเรียน...");
  try {
    const name = $("mp-student-name").value.trim();
    const number = $("mp-student-number").value.trim();
    const code = $("mp-room-code").value.trim();
    if (!name || !code) throw new Error("กรุณากรอกชื่อและรหัสห้อง");
    room = await getClient().joinById(code, { role: "student", name, number });
    role = "student";
    joined = true;
    bindRoomEvents(room);
    $("mp-room-code-display").textContent = code;
    $("mp-room-info").hidden = false;
    $("mp-enter-game").textContent = "เข้าสู่เกม 3D";
    status("เข้าห้องสำเร็จ รอครูเริ่มเกม");
  } catch (error) {
    const msg = error?.message || "เข้าห้องไม่สำเร็จ";
    status(`${msg} • ตรวจรหัสห้อง ห้องอาจเต็ม หรือครูยังไม่ได้สร้างห้อง`, true);
  } finally { setBusy(button, false); }
}
function teacherAction(action, extra = {}) {
  if (!room || role !== "teacher") return status("เฉพาะครูเจ้าของห้องเท่านั้น", true);
  room.send("teacher:control", { action, ...extra });
}
function enterGame() {
  if (!joined) return;
  const name = role === "teacher"
    ? ($("mp-teacher-name").value.trim() || "ครูผู้ควบคุม")
    : $("mp-student-name").value.trim();
  const number = role === "teacher" ? "ครูผู้ควบคุม" : $("mp-student-number").value.trim();
  showGameEntry(name, number);
}
function selectTab(which) {
  const teacher = which === "teacher";
  $("mp-teacher-panel").hidden = !teacher;
  $("mp-student-panel").hidden = teacher;
  $("mp-tab-teacher").classList.toggle("active", teacher);
  $("mp-tab-student").classList.toggle("active", !teacher);
  $("mp-room-info").hidden = true;
  status(teacher ? "ครูสามารถสร้างห้องใหม่ได้" : "กรอกรหัสที่ครูแจ้งเพื่อเข้าร่วม");
}
$("mp-tab-teacher").addEventListener("click", () => selectTab("teacher"));
$("mp-tab-student").addEventListener("click", () => selectTab("student"));
$("mp-create-room").addEventListener("click", createRoom);
$("mp-join-room").addEventListener("click", joinRoom);
$("mp-enter-game").addEventListener("click", enterGame);
$("mp-start-game").addEventListener("click", () => teacherAction("start"));
$("mp-pause-game").addEventListener("click", () => teacherAction("pause"));
$("mp-resume-game").addEventListener("click", () => teacherAction("resume"));
$("mp-end-game").addEventListener("click", () => teacherAction("end"));
$("mp-set-mission").addEventListener("click", () => teacherAction("mission", {
  missionId: Number($("mp-mission-select").value)
}));

window.WFOHNet = {
  isPaused: false,
  sendPosition(data) {
    if (!room || !joined) return;
    room.send("player:move", {
      x: data.x, y: data.y, z: data.z, rotY: data.rotY,
      appearanceJson: JSON.stringify(data.appearance || {}),
      score: data.score
    });
  },
  sendChat(text) {
    if (room && joined) room.send("player:chat", { text });
  },
  sendScore(score) {
    if (room && joined) room.send("player:score", { score });
  },
  getRoomId() { return room?.id || null; },
  getRole() { return role; }
};

// Students and teachers enter the same game world after joining the room.
// The original game remains responsible for character creation and missions.
status("เลือกบทบาทเพื่อเริ่มต้น: ครูสร้างห้อง หรือนักเรียนกรอกรหัสห้อง");
