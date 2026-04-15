class OTEngine {
  constructor() {
    this.document = "";
    this.version = 0;
    this.pendingOps = [];
  }

  transform(op1, op2) {
    if (op1.type === "insert" && op2.type === "insert") {
      if (op1.position <= op2.position) {
        return {
          type: "insert",
          position: op2.position + op1.text.length,
          text: op2.text,
        };
      } else {
        return op2;
      }
    } else if (op1.type === "insert" && op2.type === "delete") {
      if (op1.position <= op2.position) {
        return {
          type: "delete",
          position: op2.position + op1.text.length,
          length: op2.length,
        };
      } else if (op1.position >= op2.position + op2.length) {
        return op2;
      } else {
        return {
          type: "delete",
          position: op2.position,
          length: op2.length + op1.text.length,
        };
      }
    } else if (op1.type === "delete" && op2.type === "insert") {
      if (op1.position >= op2.position) {
        return op2;
      } else if (op1.position + op1.length <= op2.position) {
        return {
          type: "insert",
          position: op2.position - op1.length,
          text: op2.text,
        };
      } else {
        return { type: "insert", position: op1.position, text: op2.text };
      }
    } else if (op1.type === "delete" && op2.type === "delete") {
      if (op1.position >= op2.position + op2.length) {
        return { type: "delete", position: op2.position, length: op2.length };
      } else if (op1.position + op1.length <= op2.position) {
        return {
          type: "delete",
          position: op2.position - op1.length,
          length: op2.length,
        };
      } else if (op1.position <= op2.position) {
        const overlap =
          Math.min(op1.position + op1.length, op2.position + op2.length) -
          op2.position;
        return {
          type: "delete",
          position: op2.position - op1.length,
          length: Math.max(0, op2.length - overlap),
        };
      } else {
        const overlap =
          Math.min(op2.position + op2.length, op1.position + op1.length) -
          op1.position;
        return {
          type: "delete",
          position: op2.position,
          length: Math.max(0, op2.length - overlap),
        };
      }
    }
    return op2;
  }

  apply(op) {
    if (op.type === "insert") {
      this.document =
        this.document.slice(0, op.position) +
        op.text +
        this.document.slice(op.position);
    } else if (op.type === "delete") {
      this.document =
        this.document.slice(0, op.position) +
        this.document.slice(op.position + op.length);
    }
    return this.document;
  }
}

class MarkdownEditor {
  constructor() {
    this.socket = io();
    this.otEngine = new OTEngine();
    this.userId = null;
    this.username = null;
    this.color = null;
    this.users = {};
    this.historyData = null;
    this.isPlaying = false;
    this.playbackInterval = null;
    this.isInPlayback = false;
    this.isComposing = false;
    this.canvas = null;
    this.ctx = null;

    this.editor = document.getElementById("editor");
    this.preview = document.getElementById("preview");
    this.cursorsLayer = document.getElementById("cursorsLayer");
    this.currentUserEl = document.getElementById("currentUser");
    this.onlineCountEl = document.getElementById("onlineCount");
    this.historyBtn = document.getElementById("historyBtn");
    this.historyModal = document.getElementById("historyModal");
    this.timelineSlider = document.getElementById("timelineSlider");
    this.closeBtn = document.querySelector(".close");
    this.playBtn = document.getElementById("playBtn");
    this.pauseBtn = document.getElementById("pauseBtn");
    this.resetBtn = document.getElementById("resetBtn");

    this.init();
  }

  init() {
    this.setupCanvas();
    this.setupSocket();
    this.setupEditor();
    this.setupModal();
    this.setupPlayback();
  }

  setupCanvas() {
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d");
    this.ctx.font = "14px Consolas, Monaco, 'Courier New', monospace";
  }

  setupSocket() {
    this.socket.on("connect", () => {
      document.getElementById("status").textContent = "已连接";
      this.socket.emit("join", {});
    });

    this.socket.on("disconnect", () => {
      document.getElementById("status").textContent = "已断开";
    });

    this.socket.on("init", (data) => {
      this.userId = data.user_id;
      this.username = data.username;
      this.color = data.color;
      this.otEngine.document = data.document;
      this.otEngine.version = data.version;
      this.users = data.users;

      this.editor.value = data.document;
      this.updatePreview();
      this.updateUserInfo();
      this.renderCursors();
    });

    this.socket.on("user_joined", (data) => {
      this.users[data.user_id] = {
        username: data.username,
        color: data.color,
        cursor: 0,
      };
      this.updateUserInfo();
      this.renderCursors();
    });

    this.socket.on("user_left", (data) => {
      delete this.users[data.user_id];
      this.removeCursor(data.user_id);
      this.updateUserInfo();
    });

    this.socket.on("operation", (data) => {
      if (data.user_id !== this.userId) {
        let remoteOp = data.operation;

        for (let i = 0; i < this.otEngine.pendingOps.length; i++) {
          remoteOp = this.otEngine.transform(
            this.otEngine.pendingOps[i],
            remoteOp,
          );
        }

        for (let i = 0; i < this.otEngine.pendingOps.length; i++) {
          this.otEngine.pendingOps[i] = this.otEngine.transform(
            remoteOp,
            this.otEngine.pendingOps[i],
          );
        }

        this.otEngine.apply(remoteOp);
        this.otEngine.version = data.version;

        const cursorPos = this.editor.selectionStart;
        const newCursorPos = this.adjustCursorPosition(cursorPos, remoteOp);

        this.adjustAllCursors(remoteOp);

        this.editor.value = this.otEngine.document;
        this.editor.setSelectionRange(newCursorPos, newCursorPos);
        this.updatePreview();
        this.renderCursors();
      }
    });

    this.socket.on("ack", (data) => {
      this.otEngine.version = data.version;
      if (this.otEngine.pendingOps.length > 0) {
        this.otEngine.pendingOps.shift();
      }
      if (this.otEngine.pendingOps.length > 0) {
        this.sendOperation(this.otEngine.pendingOps[0]);
      }
    });

    this.socket.on("cursor_update", (data) => {
      if (data.user_id !== this.userId && this.users[data.user_id]) {
        this.users[data.user_id].cursor = data.position;
        this.renderCursors();
      }
    });

    this.socket.on("history", (data) => {
      this.historyData = data;
      this.setupTimeline(data.operations.length);
    });
  }

  adjustCursorPosition(cursorPos, op) {
    if (op.type === "insert") {
      if (op.position <= cursorPos) {
        return cursorPos + op.text.length;
      }
    } else if (op.type === "delete") {
      if (op.position + op.length <= cursorPos) {
        return cursorPos - op.length;
      } else if (op.position < cursorPos) {
        return op.position;
      }
    }
    return cursorPos;
  }

  adjustAllCursors(op) {
    for (const userId in this.users) {
      if (userId !== this.userId) {
        this.users[userId].cursor = this.adjustCursorPosition(
          this.users[userId].cursor,
          op,
        );
      }
    }
  }

  setupEditor() {
    this.editor.addEventListener("compositionstart", () => {
      this.isComposing = true;
    });

    this.editor.addEventListener("compositionend", () => {
      this.isComposing = false;
      this.handleInput();
    });

    this.editor.addEventListener("input", () => {
      if (!this.isComposing) {
        this.handleInput();
      }
    });

    this.editor.addEventListener("click", () => this.sendCursorPosition());
    this.editor.addEventListener("keyup", () => this.sendCursorPosition());
    this.editor.addEventListener("keydown", () =>
      setTimeout(() => this.sendCursorPosition(), 0),
    );
    this.editor.addEventListener("select", () => this.sendCursorPosition());
    this.editor.addEventListener("scroll", () => this.renderCursors());
  }

  handleInput() {
    if (this.isInPlayback) return;

    const newValue = this.editor.value;
    const oldValue = this.otEngine.document;

    let start = 0;
    while (
      start < oldValue.length &&
      start < newValue.length &&
      oldValue[start] === newValue[start]
    ) {
      start++;
    }

    let oldEnd = oldValue.length;
    let newEnd = newValue.length;
    while (
      oldEnd > start &&
      newEnd > start &&
      oldValue[oldEnd - 1] === newValue[newEnd - 1]
    ) {
      oldEnd--;
      newEnd--;
    }

    if (oldEnd > start) {
      const deleteOp = {
        type: "delete",
        position: start,
        length: oldEnd - start,
      };
      this.otEngine.apply(deleteOp);
      this.submitOperation(deleteOp);
    }

    if (newEnd > start) {
      const insertOp = {
        type: "insert",
        position: start,
        text: newValue.slice(start, newEnd),
      };
      this.otEngine.apply(insertOp);
      this.submitOperation(insertOp);
    }

    this.updatePreview();
  }

  submitOperation(op) {
    this.otEngine.pendingOps.push(op);
    if (this.otEngine.pendingOps.length === 1) {
      this.sendOperation(op);
    }
  }

  sendOperation(op) {
    this.socket.emit("operation", {
      user_id: this.userId,
      operation: op,
      version: this.otEngine.version,
    });
  }

  sendCursorPosition() {
    if (this.isInPlayback) return;
    this.socket.emit("cursor_move", {
      user_id: this.userId,
      position: this.editor.selectionStart,
    });
  }

  updatePreview() {
    this.preview.innerHTML = marked.parse(this.otEngine.document || "");
  }

  updateUserInfo() {
    this.currentUserEl.textContent = `用户: ${this.username}`;
    this.currentUserEl.style.background = this.color;
    this.onlineCountEl.textContent = `在线: ${Object.keys(this.users).length}人`;
  }

  renderCursors() {
    this.cursorsLayer.innerHTML = "";

    for (const [userId, user] of Object.entries(this.users)) {
      if (userId === this.userId) continue;

      const cursorEl = document.createElement("div");
      cursorEl.className = "remote-cursor";
      cursorEl.id = `cursor-${userId}`;
      cursorEl.style.background = user.color;

      const labelEl = document.createElement("div");
      labelEl.className = "cursor-label";
      labelEl.textContent = user.username;
      labelEl.style.background = user.color;
      cursorEl.appendChild(labelEl);

      const pos = this.getCursorPosition(user.cursor);
      cursorEl.style.left = pos.x + "px";
      cursorEl.style.top = pos.y + "px";

      this.cursorsLayer.appendChild(cursorEl);
    }
  }

  getCursorPosition(charIndex) {
    const text = this.otEngine.document.slice(0, charIndex);
    const lines = text.split("\n");
    const lineHeight = 22.4;

    const lineIndex = lines.length - 1;
    const currentLineText = lines[lineIndex];

    let colWidth = 0;
    if (currentLineText.length > 0) {
      colWidth = this.ctx.measureText(currentLineText).width;
    }

    const scrollTop = this.editor.scrollTop;
    const scrollLeft = this.editor.scrollLeft;

    return {
      x: 16 + colWidth - scrollLeft,
      y: 16 + lineIndex * lineHeight - scrollTop,
    };
  }

  removeCursor(userId) {
    const cursor = document.getElementById(`cursor-${userId}`);
    if (cursor) {
      cursor.remove();
    }
  }

  setupModal() {
    this.historyBtn.addEventListener("click", () => {
      this.socket.emit("get_history");
      this.historyModal.classList.add("show");
    });

    this.closeBtn.addEventListener("click", () => {
      this.stopPlayback();
      this.exitPlayback();
      this.historyModal.classList.remove("show");
    });

    window.addEventListener("click", (e) => {
      if (e.target === this.historyModal) {
        this.stopPlayback();
        this.exitPlayback();
        this.historyModal.classList.remove("show");
      }
    });
  }

  setupTimeline(totalOps) {
    this.timelineSlider.max = totalOps;
    this.timelineSlider.value = 0;
    document.getElementById("totalSteps").textContent = totalOps;
    document.getElementById("currentStep").textContent = "0";
  }

  setupPlayback() {
    this.timelineSlider.addEventListener("input", (e) => {
      this.playToStep(parseInt(e.target.value));
    });

    this.playBtn.addEventListener("click", () => this.startPlayback());
    this.pauseBtn.addEventListener("click", () => this.stopPlayback());
    this.resetBtn.addEventListener("click", () => this.resetPlayback());
  }

  playToStep(step) {
    if (!this.historyData) return;

    this.isInPlayback = true;
    this.editor.classList.add("readonly");
    this.editor.readOnly = true;

    let doc = "";
    let lastOp = null;

    for (let i = 0; i < step; i++) {
      const opData = this.historyData.operations[i];
      doc = this.applyOpToString(doc, opData.op);
      lastOp = opData;
    }

    this.editor.value = doc;
    this.preview.innerHTML = marked.parse(doc || "");
    document.getElementById("currentStep").textContent = step;

    if (lastOp) {
      document.getElementById("opUser").textContent = lastOp.username;
      document.getElementById("opTime").textContent = new Date(
        lastOp.timestamp,
      ).toLocaleString();
      document.getElementById("opType").textContent =
        lastOp.op.type === "insert" ? "插入文本" : "删除文本";
    } else {
      document.getElementById("opUser").textContent = "-";
      document.getElementById("opTime").textContent = "-";
      document.getElementById("opType").textContent = "-";
    }
  }

  applyOpToString(doc, op) {
    if (op.type === "insert") {
      return doc.slice(0, op.position) + op.text + doc.slice(op.position);
    } else if (op.type === "delete") {
      return doc.slice(0, op.position) + doc.slice(op.position + op.length);
    }
    return doc;
  }

  startPlayback() {
    if (this.isPlaying) return;
    this.isPlaying = true;

    const currentStep = parseInt(this.timelineSlider.value);
    const maxStep = parseInt(this.timelineSlider.max);

    if (currentStep >= maxStep) {
      this.timelineSlider.value = 0;
    }

    this.playbackInterval = setInterval(() => {
      const current = parseInt(this.timelineSlider.value);
      const max = parseInt(this.timelineSlider.max);

      if (current < max) {
        this.timelineSlider.value = current + 1;
        this.playToStep(current + 1);
      } else {
        this.stopPlayback();
      }
    }, 500);
  }

  stopPlayback() {
    this.isPlaying = false;
    if (this.playbackInterval) {
      clearInterval(this.playbackInterval);
      this.playbackInterval = null;
    }
  }

  resetPlayback() {
    this.stopPlayback();
    this.timelineSlider.value = 0;
    this.playToStep(0);
  }

  exitPlayback() {
    this.isInPlayback = false;
    this.editor.classList.remove("readonly");
    this.editor.readOnly = false;
    this.editor.value = this.otEngine.document;
    this.updatePreview();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new MarkdownEditor();
});
