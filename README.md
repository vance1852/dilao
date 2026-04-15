# Markdown 协同编辑器

一个支持多人实时协同编辑的在线 Markdown 编辑器，使用 OT (Operational Transformation) 算法解决并发编辑冲突。

## 功能特性

- ✅ **实时协同编辑**：多人同时编辑同一篇文档，操作实时同步
- ✅ **OT 算法**：通过操作变换保证并发编辑时所有客户端最终一致
- ✅ **实时预览**：左侧编辑 Markdown，右侧实时渲染预览
- ✅ **远程光标**：看到其他用户的光标位置和用户名，不同用户有不同颜色
- ✅ **历史回放**：完整记录所有编辑操作，支持时间轴回放编辑过程
- ✅ **自动生成用户名**：每个用户自动分配随机用户名和颜色

## 技术栈

**后端**：

- Python Flask
- Flask-SocketIO (WebSocket 通信)
- Eventlet (异步服务器)

**前端**：

- 原生 HTML/CSS/JavaScript
- Socket.IO 客户端
- Marked.js (Markdown 渲染)

## 安装和运行

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 启动服务

```bash
python app.py
```

### 3. 访问应用

在浏览器中打开：`http://localhost:5001`

## 测试协同编辑

1. 打开第一个浏览器标签页，访问 `http://localhost:5000`
2. 打开第二个浏览器标签页（或使用另一台设备/浏览器），同样访问 `http://localhost:5000`
3. 在任意一个标签页中编辑文档，另一个标签页会实时同步更新
4. 可以看到对方的彩色光标和用户名在编辑器中移动

## 项目结构

```
.
├── app.py                 # Flask 后端主文件，包含 OT 算法
├── requirements.txt       # Python 依赖
├── README.md             # 项目文档
├── templates/
│   └── index.html        # 前端 HTML 页面
└── static/
    ├── css/
    │   └── style.css     # 样式文件
    └── js/
        └── client.js     # 前端 JavaScript 逻辑
```

## OT 算法说明

本项目实现了 Operational Transformation 算法来处理并发编辑冲突：

### 支持的操作类型

- **insert(position, char)**：在指定位置插入字符
- **delete(position, length)**：从指定位置删除指定长度的文本

### 变换规则

1. **插入 vs 插入**：如果两个插入操作在同一位置，按时间戳排序，后到达的操作位置 +1
2. **插入 vs 删除**：如果插入操作在删除操作之前，删除操作的位置相应后移
3. **删除 vs 删除**：处理重叠或相邻的删除操作，避免重复删除

## 历史回放功能

点击页面右上角的"历史回放"按钮，可以：

- 查看完整的编辑历史时间轴
- 拖动滑块快速跳转到任意时间点
- 点击"播放"自动回放整个编辑过程
- 暂停、重置回放

## 注意事项

- 文档内容和历史记录仅保存在内存中，重启服务后会丢失
- 目前只支持单文档协同
- 光标位置计算基于等宽字体，不同字体可能有轻微偏差

## 开发说明

如需修改代码：

- 后端代码在 `app.py` 中
- 前端样式在 `static/css/style.css` 中
- 前端逻辑在 `static/js/client.js` 中
- HTML 模板在 `templates/index.html` 中
