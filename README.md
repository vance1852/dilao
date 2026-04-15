# 在线Markdown协同编辑器

一个支持多人实时协同编辑的Markdown编辑器，使用OT(Operational Transformation)算法解决并发编辑冲突。

## 技术栈

- **后端**: Python Flask + Flask-SocketIO (WebSocket通信)
- **前端**: 原生HTML/CSS/JavaScript
- **核心算法**: OT (Operational Transformation) 操作变换
- **Markdown渲染**: marked.js

## 功能特性

✅ 多人实时协同编辑同一文档
✅ OT算法解决并发冲突，保证最终一致性
✅ 多用户实时光标同步，带用户名显示
✅ 左侧纯文本编辑区，右侧实时Markdown预览
✅ 编辑历史回放功能，可查看完整编辑过程
✅ 支持多个浏览器标签页模拟多用户测试

## 安装与启动

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 启动服务

```bash
python app.py
```

服务启动后，访问 `http://localhost:5000` 即可使用编辑器。

## 测试协同编辑功能

1. 打开第一个浏览器标签页，访问 `http://localhost:5000`，你会获得一个随机用户名和颜色
2. 打开第二个浏览器标签页，同样访问 `http://localhost:5000`，这会作为第二个用户
3. 在任意一个标签页的编辑区输入内容，你会看到另一个标签页实时同步更新
4. 同时在两个标签页的不同位置输入文字，OT算法会自动处理冲突，保证内容一致，不会丢字或乱序
5. 你可以在每个编辑器中看到另一个用户的彩色光标和用户名
6. 点击页面底部的"历史回放"按钮，可以打开时间轴，拖动滑块查看文档从创建到当前的完整编辑过程

## 项目结构

```
.
├── app.py                 # 后端Flask主应用
├── ot.py                  # 服务端OT算法实现
├── requirements.txt       # Python依赖列表
├── templates/
│   └── index.html         # 前端页面
└── static/
    ├── css/
    │   └── style.css      # 样式文件
    └── js/
        ├── ot.js          # 客户端OT算法实现
        └── app.js         # 前端逻辑
```

## OT算法说明

本项目实现了基于操作变换的OT算法，支持两种操作类型：
- `insert`: 在指定位置插入文本
- `delete`: 删除指定长度的文本
- `retain`: 保留指定长度的文本不做修改

当多个用户同时编辑时，服务端会对并发操作进行变换，确保所有客户端最终的文档状态一致。
