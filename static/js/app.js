const socket = io();
const editor = document.getElementById("editor");
const preview = document.getElementById("preview");
const currentUserEl = document.getElementById("current-user");
const onlineUsersEl = document.getElementById("online-users");
const connectionStatusEl = document.getElementById("connection-status");
const historyBtn = document.getElementById("history-btn");
const historyPanel = document.getElementById("history-panel");
const closeHistoryBtn = document.getElementById("close-history");
const historySlider = document.getElementById("history-slider");
const versionNumberEl = document.getElementById("version-number");
const playBtn = document.getElementById("play-btn");
const pauseBtn = document.getElementById("pause-btn");
const cursorOverlay = document.getElementById("cursor-overlay");

let currentUserId = null;
let currentUsername = null;
let currentUserColor = null;
let docVersion = 0;
let content = "";
let isLocalChange = false;
let users = {};
let remoteCursors = {};
let historyOperations = [];
let initialHistoryContent = "";
let isReplaying = false;
let replayInterval = null;
let isPlaying = false;

socket.on("connect", () => {
  connectionStatusEl.textContent = "已连接";
  connectionStatusEl.className = "status-connected";
  socket.emit("join", { doc_id: "default" });
});

socket.on("disconnect", () => {
  connectionStatusEl.textContent = "已断开";
  connectionStatusEl.className = "status-disconnected";
});

socket.on("joined", (data) => {
  currentUserId = data.user_id;
  currentUsername = data.username;
  currentUserColor = data.color;
  content = data.content;
  docVersion = data.version;
  users = data.users;

  currentUserEl.textContent = `你是: ${currentUsername}`;
  currentUserEl.style.backgroundColor = currentUserColor;

  editor.value = content;
  updatePreview(content);
  updateOnlineUsers();
});

socket.on("user_joined", (data) => {
  users[data.user_id] = {
    username: data.username,
    color: data.color,
    cursor: 0,
  };
  updateOnlineUsers();
});

socket.on("user_left", (data) => {
  delete users[data.user_id];
  if (remoteCursors[data.user_id]) {
    remoteCursors[data.user_id].remove();
    delete remoteCursors[data.user_id];
  }
  updateOnlineUsers();
});

socket.on("operation", (data) => {
  if (data.user_id !== currentUserId && !isReplaying) {
    content = OT.apply(content, data.op);
    docVersion = data.version;
    isLocalChange = true;
    editor.value = content;
    isLocalChange = false;
    updatePreview(content);
  }
});

socket.on("cursor_update", (data) => {
  if (data.user_id !== currentUserId && users[data.user_id]) {
    users[data.user_id].cursor = data.position;
    updateRemoteCursor(data.user_id);
  }
});

socket.on("history", (data) => {
  historyOperations = data.operations;
  initialHistoryContent = data.initial_content;
  historySlider.max = historyOperations.length;
  historySlider.value = 0;
  versionNumberEl.textContent = `0/${historyOperations.length}`;
});

editor.addEventListener("input", () => {
  if (isLocalChange || isReplaying) return;

  const newContent = editor.value;
  const op = OT.diff(content, newContent);

  if (op.length > 0) {
    socket.emit("operation", {
      doc_id: "default",
      user_id: currentUserId,
      op: op,
      version: docVersion,
    });

    content = newContent;
    docVersion++;
    updatePreview(content);
  }
});

editor.addEventListener("selectionchange", () => {
  if (isReplaying) return;
  const position = editor.selectionStart;
  socket.emit("cursor_move", {
    doc_id: "default",
    user_id: currentUserId,
    position: position,
  });
});

editor.addEventListener("click", () => {
  if (isReplaying) return;
  const position = editor.selectionStart;
  socket.emit("cursor_move", {
    doc_id: "default",
    user_id: currentUserId,
    position: position,
  });
});

editor.addEventListener("keyup", () => {
  if (isReplaying) return;
  const position = editor.selectionStart;
  socket.emit("cursor_move", {
    doc_id: "default",
    user_id: currentUserId,
    position: position,
  });
});

historyBtn.addEventListener("click", () => {
  historyPanel.classList.remove("hidden");
  socket.emit("get_history", { doc_id: "default" });
  isReplaying = true;
  editor.readOnly = true;
});

closeHistoryBtn.addEventListener("click", () => {
  historyPanel.classList.add("hidden");
  isReplaying = false;
  editor.readOnly = false;
  isLocalChange = true;
  editor.value = content;
  isLocalChange = false;
  updatePreview(content);
  stopReplay();
});

historySlider.addEventListener("input", () => {
  const version = parseInt(historySlider.value);
  versionNumberEl.textContent = `${version}/${historyOperations.length}`;
  replayToVersion(version);
});

playBtn.addEventListener("click", () => {
  startReplay();
});

pauseBtn.addEventListener("click", () => {
  stopReplay();
});

function updatePreview(content) {
  preview.innerHTML = marked.parse(content);
}

function updateOnlineUsers() {
  onlineUsersEl.innerHTML = "";
  for (const userId in users) {
    if (userId === currentUserId) continue;
    const user = users[userId];
    const badge = document.createElement("div");
    badge.className = "user-badge";
    badge.style.backgroundColor = user.color;
    badge.textContent = user.username.charAt(2);
    badge.dataset.username = user.username;
    onlineUsersEl.appendChild(badge);
  }
}

function getCaretPosition(textarea, position) {
  const computedStyle = window.getComputedStyle(textarea);
  const lineHeight = parseFloat(computedStyle.lineHeight);
  const paddingLeft = parseFloat(computedStyle.paddingLeft);
  const paddingTop = parseFloat(computedStyle.paddingTop);

  const textBefore = textarea.value.slice(0, position);
  const lines = textBefore.split("\n");
  const lineNumber = lines.length - 1;
  const lastLineText = lines[lineNumber];

  const span = document.createElement("span");
  span.style.font = computedStyle.font;
  span.style.whiteSpace = "pre-wrap";
  span.style.visibility = "hidden";
  span.style.position = "absolute";
  span.textContent = lastLineText;
  document.body.appendChild(span);

  const columnWidth = span.offsetWidth;
  document.body.removeChild(span);

  return {
    top: lineNumber * lineHeight + paddingTop,
    left: columnWidth + paddingLeft,
    height: lineHeight,
  };
}

function updateRemoteCursor(userId) {
  const user = users[userId];
  if (!user) return;

  let cursor = remoteCursors[userId];
  if (!cursor) {
    cursor = document.createElement("div");
    cursor.className = "remote-cursor";
    cursor.style.backgroundColor = user.color;
    cursor.dataset.username = user.username;
    cursor.style.setProperty("--cursor-color", user.color);
    cursorOverlay.appendChild(cursor);
    remoteCursors[userId] = cursor;
  }

  const position = user.cursor;
  const pos = getCaretPosition(editor, position);

  cursor.style.top = `${pos.top}px`;
  cursor.style.left = `${pos.left}px`;
  cursor.style.height = `${pos.height}px`;
}

function replayToVersion(version) {
  let replayContent =
    "# 欢迎使用在线Markdown协同编辑器\n\n开始编辑你的文档吧！";
  for (let i = 0; i < version; i++) {
    replayContent = OT.apply(replayContent, historyOperations[i].op);
  }
  isLocalChange = true;
  editor.value = replayContent;
  isLocalChange = false;
  updatePreview(replayContent);
}

function startReplay() {
  if (isPlaying) return;

  isPlaying = true;
  playBtn.classList.add("hidden");
  pauseBtn.classList.remove("hidden");

  let currentVersion = parseInt(historySlider.value);

  replayInterval = setInterval(() => {
    if (currentVersion >= historyOperations.length) {
      stopReplay();
      return;
    }
    currentVersion++;
    historySlider.value = currentVersion;
    versionNumberEl.textContent = `${currentVersion}/${historyOperations.length}`;
    replayToVersion(currentVersion);
  }, 200);
}

function stopReplay() {
  isPlaying = false;
  playBtn.classList.remove("hidden");
  pauseBtn.classList.add("hidden");
  if (replayInterval) {
    clearInterval(replayInterval);
    replayInterval = null;
  }
}

window.addEventListener("beforeunload", () => {
  socket.emit("leave", {
    doc_id: "default",
    user_id: currentUserId,
  });
});
