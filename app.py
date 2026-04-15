from flask import Flask, render_template
from flask_socketio import SocketIO, emit, join_room, leave_room
import uuid
import time
import random

app = Flask(__name__)
app.config['SECRET_KEY'] = 'markdown-collab-secret'
socketio = SocketIO(app, cors_allowed_origins="*")

DOCUMENT_ROOM = 'main-document'

class Operation:
    def __init__(self, op_type, position, char=None, length=None, user_id=None, timestamp=None):
        self.type = op_type
        self.position = position
        self.char = char
        self.length = length
        self.user_id = user_id
        self.timestamp = timestamp or time.time()
    
    def to_dict(self):
        return {
            'type': self.type,
            'position': self.position,
            'char': self.char,
            'length': self.length,
            'user_id': self.user_id,
            'timestamp': self.timestamp
        }
    
    @classmethod
    def from_dict(cls, data):
        return cls(
            op_type=data['type'],
            position=data['position'],
            char=data.get('char'),
            length=data.get('length'),
            user_id=data.get('user_id'),
            timestamp=data.get('timestamp')
        )

def transform_insert_vs_insert(op1, op2):
    if op1.position <= op2.position:
        return Operation('insert', op2.position + 1, char=op2.char, user_id=op2.user_id)
    else:
        return Operation('insert', op2.position, char=op2.char, user_id=op2.user_id)

def transform_insert_vs_delete(insert_op, delete_op):
    if insert_op.position <= delete_op.position:
        return Operation('delete', delete_op.position + 1, length=delete_op.length, user_id=delete_op.user_id)
    elif insert_op.position >= delete_op.position + delete_op.length:
        return Operation('delete', delete_op.position, length=delete_op.length, user_id=delete_op.user_id)
    else:
        return Operation('delete', delete_op.position, length=delete_op.length + 1, user_id=delete_op.user_id)

def transform_delete_vs_insert(delete_op, insert_op):
    if insert_op.position < delete_op.position:
        return Operation('delete', delete_op.position + 1, length=delete_op.length, user_id=delete_op.user_id)
    elif insert_op.position >= delete_op.position + delete_op.length:
        return Operation('delete', delete_op.position, length=delete_op.length, user_id=delete_op.user_id)
    else:
        before_length = insert_op.position - delete_op.position
        after_length = delete_op.length - before_length
        return Operation('delete', delete_op.position, length=before_length + after_length + 1, user_id=delete_op.user_id)

def transform_delete_vs_delete(op1, op2):
    if op1.position + op1.length <= op2.position:
        return Operation('delete', op2.position - op1.length, length=op2.length, user_id=op2.user_id)
    elif op2.position + op2.length <= op1.position:
        return Operation('delete', op2.position, length=op2.length, user_id=op2.user_id)
    else:
        start = min(op1.position, op2.position)
        end = max(op1.position + op1.length, op2.position + op2.length)
        overlap_start = max(op1.position, op2.position)
        overlap_end = min(op1.position + op1.length, op2.position + op2.length)
        overlap = overlap_end - overlap_start
        new_length = (end - start) - overlap
        if new_length > 0:
            return Operation('delete', start, length=new_length, user_id=op2.user_id)
        else:
            return None

def transform(server_op, client_op):
    if server_op is None:
        return client_op
    if client_op is None:
        return None
    
    if server_op.type == 'insert' and client_op.type == 'insert':
        return transform_insert_vs_insert(server_op, client_op)
    elif server_op.type == 'insert' and client_op.type == 'delete':
        return transform_insert_vs_delete(server_op, client_op)
    elif server_op.type == 'delete' and client_op.type == 'insert':
        return transform_delete_vs_insert(server_op, client_op)
    elif server_op.type == 'delete' and client_op.type == 'delete':
        return transform_delete_vs_delete(server_op, client_op)
    return client_op

class Document:
    def __init__(self):
        self.content = '# 欢迎使用 Markdown 协同编辑器\n\n开始编辑吧！'
        self.operations = []
        self.version = 0
        self.users = {}
    
    def apply_operation(self, op):
        if op.type == 'insert':
            self.content = self.content[:op.position] + op.char + self.content[op.position:]
        elif op.type == 'delete':
            self.content = self.content[:op.position] + self.content[op.position + op.length:]
        self.operations.append(op.to_dict())
        self.version += 1
        return True

document = Document()
user_colors = {}
user_names = {}

def generate_color():
    colors = [
        '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
        '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
    ]
    return random.choice(colors)

def generate_username():
    adjectives = ['快乐', '聪明', '勇敢', '温柔', '敏捷', '冷静', '热情', '神秘']
    nouns = ['猫咪', '小狗', '兔子', '熊猫', '狐狸', '老虎', '狮子', '海豚']
    return random.choice(adjectives) + random.choice(nouns) + str(random.randint(1, 99))

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('connect')
def handle_connect():
    user_id = str(uuid.uuid4())
    color = generate_color()
    username = generate_username()
    user_colors[user_id] = color
    user_names[user_id] = username
    
    join_room(DOCUMENT_ROOM)
    
    emit('init', {
        'user_id': user_id,
        'content': document.content,
        'version': document.version,
        'color': color,
        'username': username,
        'users': [{'id': uid, 'color': user_colors[uid], 'name': user_names[uid], 'cursor': document.users.get(uid, 0)} for uid in document.users]
    })
    
    document.users[user_id] = 0
    
    emit('user_joined', {
        'user_id': user_id,
        'color': color,
        'username': username,
        'position': 0
    }, room=DOCUMENT_ROOM, include_self=False)

@socketio.on('disconnect')
def handle_disconnect():
    from flask import request
    user_id = request.sid
    if user_id in document.users:
        del document.users[user_id]
    if user_id in user_colors:
        del user_colors[user_id]
    if user_id in user_names:
        del user_names[user_id]
    leave_room(DOCUMENT_ROOM)
    emit('user_left', {'user_id': user_id}, room=DOCUMENT_ROOM)

@socketio.on('operation')
def handle_operation(data):
    user_id = data['user_id']
    client_version = data['version']
    op_data = data['operation']
    
    op = Operation.from_dict(op_data)
    
    while document.version > client_version:
        server_op_data = document.operations[client_version]
        server_op = Operation.from_dict(server_op_data)
        op = transform(server_op, op)
        client_version += 1
        if op is None:
            break
    
    if op is not None:
        document.apply_operation(op)
        emit('operation', {
            'operation': op.to_dict(),
            'version': document.version,
            'user_id': user_id
        }, room=DOCUMENT_ROOM, include_self=False)
    
    emit('ack', {
        'version': document.version
    })

@socketio.on('cursor_move')
def handle_cursor_move(data):
    user_id = data['user_id']
    position = data['position']
    document.users[user_id] = position
    emit('cursor_update', {
        'user_id': user_id,
        'position': position,
        'color': user_colors.get(user_id, '#000000'),
        'username': user_names.get(user_id, '未知用户')
    }, room=DOCUMENT_ROOM, include_self=False)

@socketio.on('get_history')
def handle_get_history():
    emit('history', {
        'operations': document.operations,
        'initial_content': '# 欢迎使用 Markdown 协同编辑器\n\n开始编辑吧！'
    })

if __name__ == '__main__':
    socketio.run(app, debug=False, host='0.0.0.0', port=5001)
