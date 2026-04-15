# Markdown 协同编辑器

一个基于 Python Flask 和 WebSocket 的在线 Markdown 协同编辑器，支持多人实时编辑同一篇文档。

## 功能特性

- ✅ **实时协同编辑**：多人同时编辑同一篇文档，操作实时同步
- ✅ **OT 算法**：使用 Operational Transformation 算法解决并发编辑冲突，确保最终一致性
- ✅ **实时预览**：左侧编辑区域，右侧实时渲染 Markdown 预览
- ✅ **多用户光标**：每个用户有随机颜色的光标，可实时看到其他用户的编辑位置
- ✅ **历史回放**：完整记录所有编辑操作，支持时间轴回放编辑过程
- ✅ **用户状态显示**：显示当前用户名和在线人数

## 技术栈

- **后端**：Python Flask + Flask-SocketIO
- **前端**：原生 HTML/CSS/JavaScript
- **WebSocket**：Socket.IO
- **Markdown 渲染**：marked.js
- **OT 算法**：自定义实现 Operational Transformation

## 安装和运行

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 启动服务器

```bash
python app.py
```

### 3. 访问应用

在浏览器中打开：`http://localhost:5000`

## 测试协同编辑

1. 打开第一个浏览器标签页，访问 `http://localhost:5000`
2. 打开第二个浏览器标签页（或另一个浏览器），同样访问 `http://localhost:5000`
3. 在任意一个编辑器中输入内容，另一个页面会实时同步
4. 尝试在两个标签页中同时编辑不同位置的文本，OT 算法会保证最终一致性

## 项目结构

```
.
├── app.py                 # Flask 后端服务器，包含 SocketIO 和 OT 算法实现
├── requirements.txt       # Python 依赖包
├── README.md             # 项目文档
├── templates/
│   └── index.html        # 前端 HTML 页面
└── static/
    ├── style.css         # 前端样式文件
    └── app.js            # 前端 JavaScript 逻辑
```

## 核心功能说明

### OT (Operational Transformation) 算法

OT 算法用于处理并发编辑冲突。当两个用户同时编辑时：

1. 每个客户端生成本地操作并立即应用
2. 操作发送到服务器进行转换
3. 服务器对并发操作进行转换，确保所有客户端最终状态一致
4. 支持插入和删除两种操作类型的变换

### 远程光标显示

- 每个用户分配一个唯一的颜色
- 光标位置实时同步到所有客户端
- 光标旁边显示用户名，便于识别

### 历史回放功能

1. 点击页面底部的"历史回放"按钮
2. 使用时间轴滑块可以跳转到任意历史版本
3. 点击"播放"自动回放完整编辑过程
4. 回放过程中显示：操作用户、操作时间、操作类型
5. 回放时编辑器自动变为只读状态

## 依赖说明

- **Flask**: Web 框架
- **Flask-SocketIO**: WebSocket 支持
- **eventlet**: 异步网络库，用于 SocketIO 后端
- **python-socketio**: SocketIO Python 实现
- **markdown**: Markdown 处理库

## 浏览器兼容性

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## 注意事项

- 文档内容存储在服务器内存中，重启服务器会丢失数据
- 服务器记录所有操作历史，长时间运行可能占用较多内存
- 生产环境建议使用更稳定的部署方式（如 Gunicorn + Nginx）

## 扩展建议

- 添加用户身份验证
- 持久化存储文档到数据库
- 支持多文档管理
- 添加评论和批注功能
- 支持导出为 PDF/HTML
- 添加代码高亮支持
