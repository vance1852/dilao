const socket = io();

let userId = null;
let username = null;
let userColor = null;
let version = 0;
let content = '';
let users = {};
let outgoingOps = [];
let pendingOp = null;
let ignoreChanges = false;
let lastCursorPosition = 0;
let cursorUpdateTimeout = null;

let historyOperations = [];
let initialHistoryContent = '';
let isPlaying = false;
let playInterval = null;
let currentHistoryStep = 0;

const editor = document.getElementById('editor');
const preview = document.getElementById('preview');
const usernameEl = document.getElementById('username');
const userListEl = document.getElementById('user-list');
const cursorsLayer = document.getElementById('cursors-layer');
const historyBtn = document.getElementById('history-btn');
const historyModal = document.getElementById('history-modal');
const closeModal = document.getElementById('close-modal');
const timelineSlider = document.getElementById('timeline-slider');
const playBtn = document.getElementById('play-btn');
const pauseBtn = document.getElementById('pause-btn');
const resetBtn = document.getElementById('reset-btn');
const currentStepEl = document.getElementById('current-step');
const totalStepsEl = document.getElementById('total-steps');
const replayEditor = document.getElementById('replay-editor');

marked.setOptions({
    breaks: true,
    gfm: true
});

function renderPreview() {
    preview.innerHTML = marked.parse(content);
}

function updateUserList() {
    userListEl.innerHTML = '';
    Object.values(users).forEach(user => {
        const badge = document.createElement('div');
        badge.className = 'user-badge';
        badge.innerHTML = `
            <span class="user-color" style="background: ${user.color}"></span>
            <span>${user.name}</span>
        `;
        userListEl.appendChild(badge);
    });
}

function transformInsertVsInsert(op1, op2) {
    if (op1.position <= op2.position) {
        return {
            type: 'insert',
            position: op2.position + 1,
            char: op2.char
        };
    }
    return op2;
}

function transformInsertVsDelete(insertOp, deleteOp) {
    if (insertOp.position <= deleteOp.position) {
        return {
            type: 'delete',
            position: deleteOp.position + 1,
            length: deleteOp.length
        };
    } else if (insertOp.position >= deleteOp.position + deleteOp.length) {
        return deleteOp;
    } else {
        return {
            type: 'delete',
            position: deleteOp.position,
            length: deleteOp.length + 1
        };
    }
}

function transformDeleteVsInsert(deleteOp, insertOp) {
    if (insertOp.position < deleteOp.position) {
        return {
            type: 'delete',
            position: deleteOp.position + 1,
            length: deleteOp.length
        };
    } else if (insertOp.position >= deleteOp.position + deleteOp.length) {
        return deleteOp;
    } else {
        const beforeLength = insertOp.position - deleteOp.position;
        const afterLength = deleteOp.length - beforeLength;
        return {
            type: 'delete',
            position: deleteOp.position,
            length: beforeLength + afterLength + 1
        };
    }
}

function transformDeleteVsDelete(op1, op2) {
    if (op1.position + op1.length <= op2.position) {
        return {
            type: 'delete',
            position: op2.position - op1.length,
            length: op2.length
        };
    } else if (op2.position + op2.length <= op1.position) {
        return op2;
    } else {
        const start = Math.min(op1.position, op2.position);
        const end = Math.max(op1.position + op1.length, op2.position + op2.length);
        const overlapStart = Math.max(op1.position, op2.position);
        const overlapEnd = Math.min(op1.position + op1.length, op2.position + op2.length);
        const overlap = overlapEnd - overlapStart;
        const newLength = (end - start) - overlap;
        if (newLength > 0) {
            return {
                type: 'delete',
                position: start,
                length: newLength
            };
        }
        return null;
    }
}

function transform(serverOp, clientOp) {
    if (!clientOp) return null;
    
    if (serverOp.type === 'insert' && clientOp.type === 'insert') {
        return transformInsertVsInsert(serverOp, clientOp);
    } else if (serverOp.type === 'insert' && clientOp.type === 'delete') {
        return transformInsertVsDelete(serverOp, clientOp);
    } else if (serverOp.type === 'delete' && clientOp.type === 'insert') {
        return transformDeleteVsInsert(serverOp, clientOp);
    } else if (serverOp.type === 'delete' && clientOp.type === 'delete') {
        return transformDeleteVsDelete(serverOp, clientOp);
    }
    return clientOp;
}

function applyOp(op, targetContent) {
    if (op.type === 'insert') {
        return targetContent.slice(0, op.position) + op.char + targetContent.slice(op.position);
    } else if (op.type === 'delete') {
        return targetContent.slice(0, op.position) + targetContent.slice(op.position + op.length);
    }
    return targetContent;
}

function applyOpLocally(op) {
    content = applyOp(op, content);
    ignoreChanges = true;
    editor.value = content;
    ignoreChanges = false;
    renderPreview();
}

function sendOp(op) {
    if (pendingOp) {
        outgoingOps.push(op);
        return;
    }
    pendingOp = op;
    socket.emit('operation', {
        user_id: userId,
        version: version,
        operation: op
    });
}

function processOutgoingOps() {
    if (outgoingOps.length > 0 && !pendingOp) {
        const op = outgoingOps.shift();
        sendOp(op);
    }
}

function getCursorPosition() {
    return editor.selectionStart;
}

function updateCursorPosition() {
    const position = getCursorPosition();
    if (position !== lastCursorPosition) {
        lastCursorPosition = position;
        socket.emit('cursor_move', {
            user_id: userId,
            position: position
        });
    }
}

function debouncedCursorUpdate() {
    if (cursorUpdateTimeout) {
        clearTimeout(cursorUpdateTimeout);
    }
    cursorUpdateTimeout = setTimeout(updateCursorPosition, 50);
}

function getCaretCoordinates(position) {
    const text = content.substring(0, position);
    const lines = text.split('\n');
    const lineNumber = lines.length - 1;
    const charInLine = lines[lineNumber].length;
    
    const lineHeight = 22.4;
    const charWidth = 8.4;
    
    return {
        top: lineNumber * lineHeight,
        left: charInLine * charWidth
    };
}

function updateRemoteCursors() {
    cursorsLayer.innerHTML = '';
    Object.entries(users).forEach(([uid, user]) => {
        if (uid === userId) return;
        
        const cursor = document.createElement('div');
        cursor.className = 'remote-cursor';
        cursor.style.background = user.color;
        
        const label = document.createElement('div');
        label.className = 'remote-cursor-label';
        label.style.background = user.color;
        label.textContent = user.name;
        
        const coords = getCaretCoordinates(user.cursor);
        cursor.style.top = coords.top + 15 + 'px';
        cursor.style.left = coords.left + 15 + 'px';
        label.style.top = '-20px';
        label.style.left = '0';
        
        cursor.appendChild(label);
        cursorsLayer.appendChild(cursor);
    });
}

let lastValue = '';
editor.addEventListener('input', (e) => {
    if (ignoreChanges) return;
    
    const newValue = editor.value;
    const oldValue = lastValue;
    lastValue = newValue;
    
    let i = 0;
    while (i < oldValue.length && i < newValue.length && oldValue[i] === newValue[i]) {
        i++;
    }
    
    const commonPrefix = i;
    
    let j = 0;
    while (
        commonPrefix + j < oldValue.length &&
        commonPrefix + j < newValue.length &&
        oldValue[oldValue.length - 1 - j] === newValue[newValue.length - 1 - j]
    ) {
        j++;
    }
    
    const deletedLength = oldValue.length - commonPrefix - j;
    const insertedText = newValue.substring(commonPrefix, newValue.length - j);
    
    if (deletedLength > 0) {
        const deleteOp = {
            type: 'delete',
            position: commonPrefix,
            length: deletedLength
        };
        applyOpLocally(deleteOp);
        sendOp(deleteOp);
    }
    
    for (let k = 0; k < insertedText.length; k++) {
        const insertOp = {
            type: 'insert',
            position: commonPrefix + k,
            char: insertedText[k]
        };
        applyOpLocally(insertOp);
        sendOp(insertOp);
    }
    
    debouncedCursorUpdate();
});

editor.addEventListener('click', debouncedCursorUpdate);
editor.addEventListener('keyup', debouncedCursorUpdate);

socket.on('init', (data) => {
    userId = data.user_id;
    username = data.username;
    userColor = data.color;
    content = data.content;
    version = data.version;
    lastValue = content;
    
    editor.value = content;
    usernameEl.textContent = username;
    usernameEl.style.background = userColor;
    usernameEl.style.color = 'white';
    usernameEl.style.borderRadius = '4px';
    usernameEl.style.padding = '2px 8px';
    
    data.users.forEach(user => {
        users[user.id] = {
            id: user.id,
            name: user.name,
            color: user.color,
            cursor: user.cursor
        };
    });
    
    updateUserList();
    updateRemoteCursors();
    renderPreview();
});

socket.on('operation', (data) => {
    let op = data.operation;
    const opVersion = data.version;
    
    while (version < opVersion - 1) {
        version++;
    }
    
    if (pendingOp) {
        op = transform(pendingOp, op);
        for (let i = 0; i < outgoingOps.length; i++) {
            op = transform(outgoingOps[i], op);
        }
    }
    
    if (op) {
        applyOpLocally(op);
        lastValue = content;
    }
    
    version = opVersion;
    updateRemoteCursors();
});

socket.on('ack', (data) => {
    version = data.version;
    pendingOp = null;
    processOutgoingOps();
});

socket.on('user_joined', (data) => {
    users[data.user_id] = {
        id: data.user_id,
        name: data.username,
        color: data.color,
        cursor: data.position
    };
    updateUserList();
    updateRemoteCursors();
});

socket.on('user_left', (data) => {
    delete users[data.user_id];
    updateUserList();
    updateRemoteCursors();
});

socket.on('cursor_update', (data) => {
    if (users[data.user_id]) {
        users[data.user_id].cursor = data.position;
        users[data.user_id].name = data.username;
        users[data.user_id].color = data.color;
        updateRemoteCursors();
    }
});

socket.on('history', (data) => {
    historyOperations = data.operations;
    initialHistoryContent = data.initial_content;
    totalStepsEl.textContent = historyOperations.length;
    timelineSlider.max = historyOperations.length;
    timelineSlider.value = 0;
    currentStepEl.textContent = '0';
    replayEditor.textContent = initialHistoryContent;
});

historyBtn.addEventListener('click', () => {
    historyModal.classList.remove('hidden');
    socket.emit('get_history');
});

closeModal.addEventListener('click', () => {
    historyModal.classList.add('hidden');
    stopPlayback();
});

historyModal.addEventListener('click', (e) => {
    if (e.target === historyModal) {
        historyModal.classList.add('hidden');
        stopPlayback();
    }
});

function replayToStep(step) {
    let replayContent = initialHistoryContent;
    for (let i = 0; i < step && i < historyOperations.length; i++) {
        replayContent = applyOp(historyOperations[i], replayContent);
    }
    replayEditor.textContent = replayContent;
    currentStepEl.textContent = step;
    timelineSlider.value = step;
    currentHistoryStep = step;
}

timelineSlider.addEventListener('input', (e) => {
    const step = parseInt(e.target.value);
    replayToStep(step);
});

function startPlayback() {
    if (isPlaying) return;
    isPlaying = true;
    playBtn.textContent = '⏸ 暂停';
    playInterval = setInterval(() => {
        if (currentHistoryStep >= historyOperations.length) {
            stopPlayback();
            return;
        }
        currentHistoryStep++;
        replayToStep(currentHistoryStep);
    }, 100);
}

function stopPlayback() {
    isPlaying = false;
    playBtn.textContent = '▶ 播放';
    if (playInterval) {
        clearInterval(playInterval);
        playInterval = null;
    }
}

playBtn.addEventListener('click', () => {
    if (isPlaying) {
        stopPlayback();
    } else {
        if (currentHistoryStep >= historyOperations.length) {
            currentHistoryStep = 0;
        }
        startPlayback();
    }
});

resetBtn.addEventListener('click', () => {
    stopPlayback();
    currentHistoryStep = 0;
    replayToStep(0);
});

pauseBtn.addEventListener('click', stopPlayback);
