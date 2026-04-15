from flask import Flask, render_template
from flask_socketio import SocketIO, emit, join_room, leave_room
import uuid
import json
from datetime import datetime

app = Flask(__name__)
app.config['SECRET_KEY'] = 'markdown-collab-secret'
socketio = SocketIO(app, cors_allowed_origins="*")

class OTEngine:
    def __init__(self):
        self.document = ""
        self.version = 0
        self.operations = []
        self.users = {}
    
    def transform(self, op1, op2):
        if op1['type'] == 'insert' and op2['type'] == 'insert':
            if op1['position'] <= op2['position']:
                return {'type': 'insert', 'position': op2['position'] + len(op1['text']), 'text': op2['text']}
            else:
                return op2
        elif op1['type'] == 'insert' and op2['type'] == 'delete':
            if op1['position'] <= op2['position']:
                return {'type': 'delete', 'position': op2['position'] + len(op1['text']), 'length': op2['length']}
            elif op1['position'] >= op2['position'] + op2['length']:
                return op2
            else:
                return {'type': 'delete', 'position': op2['position'], 'length': op2['length'] + len(op1['text'])}
        elif op1['type'] == 'delete' and op2['type'] == 'insert':
            if op1['position'] >= op2['position']:
                return op2
            elif op1['position'] + op1['length'] <= op2['position']:
                return {'type': 'insert', 'position': op2['position'] - op1['length'], 'text': op2['text']}
            else:
                return {'type': 'insert', 'position': op1['position'], 'text': op2['text']}
        elif op1['type'] == 'delete' and op2['type'] == 'delete':
            if op1['position'] >= op2['position'] + op2['length']:
                return {'type': 'delete', 'position': op2['position'], 'length': op2['length']}
            elif op1['position'] + op1['length'] <= op2['position']:
                return {'type': 'delete', 'position': op2['position'] - op1['length'], 'length': op2['length']}
            elif op1['position'] <= op2['position']:
                overlap = min(op1['position'] + op1['length'], op2['position'] + op2['length']) - op2['position']
                return {'type': 'delete', 'position': op2['position'] - op1['length'], 'length': max(0, op2['length'] - overlap)}
            else:
                overlap = min(op2['position'] + op2['length'], op1['position'] + op1['length']) - op1['position']
                return {'type': 'delete', 'position': op2['position'], 'length': max(0, op2['length'] - overlap)}
        return op2
    
    def apply_operation(self, op):
        if op['type'] == 'insert':
            self.document = self.document[:op['position']] + op['text'] + self.document[op['position']:]
        elif op['type'] == 'delete':
            self.document = self.document[:op['position']] + self.document[op['position'] + op['length']:]
        return self.document
    
    def add_operation(self, op, user_id, username):
        self.operations.append({
            'op': op,
            'user_id': user_id,
            'username': username,
            'timestamp': datetime.now().isoformat(),
            'version': self.version
        })
        self.version += 1
        return self.version - 1

ot_engine = OTEngine()
user_colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F']
user_names = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Henry']

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('join')
def handle_join(data):
    user_id = str(uuid.uuid4())
    color_idx = len(ot_engine.users) % len(user_colors)
    name_idx = len(ot_engine.users) % len(user_names)
    username = data.get('username', f"{user_names[name_idx]}_{len(ot_engine.users)+1}")
    color = user_colors[color_idx]
    
    ot_engine.users[user_id] = {
        'username': username,
        'color': color,
        'cursor': 0
    }
    
    join_room('document')
    emit('init', {
        'user_id': user_id,
        'username': username,
        'color': color,
        'document': ot_engine.document,
        'version': ot_engine.version,
        'users': {uid: {'username': u['username'], 'color': u['color'], 'cursor': u['cursor']} 
                  for uid, u in ot_engine.users.items()}
    })
    emit('user_joined', {
        'user_id': user_id,
        'username': username,
        'color': color
    }, room='document', include_self=False)

@socketio.on('disconnect')
def handle_disconnect():
    user_id = None
    for uid in list(ot_engine.users.keys()):
        if uid not in [sid for sid in socketio.server.manager.get_participants('/', 'document')]:
            user_id = uid
            break
    
    if user_id and user_id in ot_engine.users:
        username = ot_engine.users[user_id]['username']
        del ot_engine.users[user_id]
        leave_room('document')
        emit('user_left', {'user_id': user_id, 'username': username}, room='document')

@socketio.on('operation')
def handle_operation(data):
    user_id = data['user_id']
    op = data['operation']
    client_version = data['version']
    
    while client_version < ot_engine.version:
        server_op = ot_engine.operations[client_version]['op']
        op = ot_engine.transform(server_op, op)
        client_version += 1
    
    ot_engine.apply_operation(op)
    version = ot_engine.add_operation(op, user_id, ot_engine.users[user_id]['username'])
    
    emit('operation', {
        'operation': op,
        'version': version,
        'user_id': user_id
    }, room='document', include_self=False)
    
    emit('ack', {'version': version}, room=user_id)

@socketio.on('cursor_move')
def handle_cursor_move(data):
    user_id = data['user_id']
    position = data['position']
    if user_id in ot_engine.users:
        ot_engine.users[user_id]['cursor'] = position
        emit('cursor_update', {
            'user_id': user_id,
            'position': position
        }, room='document', include_self=False)

@socketio.on('get_history')
def handle_get_history():
    emit('history', {
        'operations': ot_engine.operations,
        'final_document': ot_engine.document
    })

if __name__ == '__main__':
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)
