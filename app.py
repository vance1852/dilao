from flask import Flask, render_template
from flask_socketio import SocketIO, emit, join_room, leave_room
import uuid
import json
from datetime import datetime
from ot import OT
import random

app = Flask(__name__)
app.config['SECRET_KEY'] = 'markdown-collab-secret'
socketio = SocketIO(app, cors_allowed_origins="*")

# 存储文档数据
documents = {
    'default': {
        'content': '# 欢迎使用在线Markdown协同编辑器\n\n开始编辑你的文档吧！',
        'version': 0,
        'operations': [],
        'users': {}
    }
}

# 生成随机用户名
user_names = ['用户' + str(i) for i in range(1000)]
random.shuffle(user_names)
name_index = 0

# 生成随机颜色
def generate_random_color():
    colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2']
    return random.choice(colors)

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('join')
def handle_join(data):
    global name_index
    doc_id = data.get('doc_id', 'default')
    user_id = str(uuid.uuid4())
    
    if doc_id not in documents:
        documents[doc_id] = {
            'content': '# 新文档\n\n开始编辑吧！',
            'version': 0,
            'operations': [],
            'users': {}
        }
    
    username = user_names[name_index % len(user_names)]
    name_index += 1
    color = generate_random_color()
    
    documents[doc_id]['users'][user_id] = {
        'username': username,
        'color': color,
        'cursor': 0
    }
    
    join_room(doc_id)
    
    emit('joined', {
        'user_id': user_id,
        'username': username,
        'color': color,
        'content': documents[doc_id]['content'],
        'version': documents[doc_id]['version'],
        'users': documents[doc_id]['users']
    })
    
    emit('user_joined', {
        'user_id': user_id,
        'username': username,
        'color': color
    }, room=doc_id, include_self=False)

@socketio.on('operation')
def handle_operation(data):
    doc_id = data.get('doc_id', 'default')
    user_id = data.get('user_id')
    op = data.get('op')
    version = data.get('version')
    
    if doc_id not in documents:
        return
    
    doc = documents[doc_id]
    
    # 应用OT变换
    if version < doc['version']:
        for i in range(version, doc['version']):
            op = OT.transform(op, doc['operations'][i]['op'])
    
    # 应用操作到文档
    doc['content'] = OT.apply(doc['content'], op)
    doc['version'] += 1
    
    # 记录操作
    doc['operations'].append({
        'op': op,
        'user_id': user_id,
        'timestamp': datetime.now().isoformat()
    })
    
    # 广播操作给其他用户
    emit('operation', {
        'op': op,
        'version': doc['version'],
        'user_id': user_id
    }, room=doc_id, include_self=False)

@socketio.on('cursor_move')
def handle_cursor_move(data):
    doc_id = data.get('doc_id', 'default')
    user_id = data.get('user_id')
    position = data.get('position')
    
    if doc_id not in documents or user_id not in documents[doc_id]['users']:
        return
    
    documents[doc_id]['users'][user_id]['cursor'] = position
    
    emit('cursor_update', {
        'user_id': user_id,
        'position': position
    }, room=doc_id, include_self=False)

@socketio.on('get_history')
def handle_get_history(data):
    doc_id = data.get('doc_id', 'default')
    
    if doc_id not in documents:
        return
    
    doc = documents[doc_id]
    
    emit('history', {
        'operations': doc['operations'],
        'initial_content': doc['operations'][0]['op'] if doc['operations'] else doc['content'],
        'total_versions': doc['version']
    })

@socketio.on('leave')
def handle_leave(data):
    doc_id = data.get('doc_id', 'default')
    user_id = data.get('user_id')
    
    if doc_id not in documents or user_id not in documents[doc_id]['users']:
        return
    
    leave_room(doc_id)
    username = documents[doc_id]['users'][user_id]['username']
    del documents[doc_id]['users'][user_id]
    
    emit('user_left', {
        'user_id': user_id,
        'username': username
    }, room=doc_id)

if __name__ == '__main__':
    socketio.run(app, debug=False, host='0.0.0.0', port=5005)
