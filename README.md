# 慧康ai

基于 **Vue 3 + Vite + Element Plus + Pinia** 的 AI 对话前端，配一个 **Express + SQLite** 的本地后端。会话和消息保存在 SQLite，DeepSeek 的 key 只在服务端使用。

## 架构

```
浏览器 (Vue 3)
   │  /api/*
   ▼
Node 服务 (Express, 127.0.0.1:3000)  ──▶  DeepSeek API
   │
   ▼
SQLite 文件 (data/app.db)
```

开发时 Vite 把 `/api` 反向代理到 3000；构建后 `npm start` 由同一个 Node 服务托管 `dist` 和接口，只需要一个端口。

## 功能

- 多会话：新建、切换、删除，数据存在 SQLite
- 消息：发送、删除、复制，Enter 发送，自动滚到底部
- 提示词：存在 SQLite，表格增删；发送时按插入顺序拼成 system prompt
- 发送失败不会留下半截对话：输入框自动还原，可直接重试
- 首次启动会把旧版 localStorage 里的会话和提示词自动迁移进数据库

## 启动

```sh
npm install
```

在项目根目录创建 `.env.local`（已被 `.gitignore` 忽略）：

```ini
DEEPSEEK_API_KEY=sk-你的key
# 可选，默认 https://api.deepseek.com
DEEPSEEK_BASE_URL=
# 可选，默认 deepseek-chat
DEEPSEEK_MODEL=
```

然后一条命令同时启动前后端：

```sh
npm run dev:all     # API + 前端，Ctrl+C 一起退出
```

也可以分开跑（两个终端）：

```sh
npm run server      # API  → http://127.0.0.1:3000
npm run dev         # 前端 → http://localhost:5174
```

## 构建与生产

```sh
npm run build       # 产物在 dist/
npm start           # 3000 端口同时提供页面和 API
npm run lint        # ESLint
```

生产模式下直接访问 **http://127.0.0.1:3000** 即可。

## 数据库

- 文件：`data/app.db`（WAL 模式，另有 `-wal` / `-shm` 临时文件）
- 备份：停服务后复制整个 `data/` 目录
- 重置：删掉 `data/` 再启动，会重新建库
- 迁移：首次打开页面时，浏览器里旧版的 `localStorage["msg"]`（会话）和 `localStorage["ts"]`（提示词）会各导入一次，成功后删除对应 key

表结构：

| 表 | 字段 |
| --- | --- |
| `conversations` | `id`, `title`, `created_at`, `updated_at` |
| `messages` | `id`, `conversation_id`, `role`（user/assistant）, `content`, `created_at` |
| `prompts` | `id`, `content`, `created_at`, `updated_at` |

时间统一存 ISO 8601（UTC），前端转本地时区显示。

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查 |
| GET | `/api/conversations` | 会话列表（含消息数、最后消息时间） |
| POST | `/api/conversations` | 新建会话，body `{ title }` |
| DELETE | `/api/conversations/:id` | 删除会话（级联删消息） |
| GET | `/api/conversations/:id/messages` | 会话消息 |
| POST | `/api/conversations/:id/messages` | 发消息，body `{ content, systemInstruction }`，返回 `{ userMessage, aiMessage }` |
| DELETE | `/api/messages/:id` | 删除单条消息 |
| GET | `/api/prompts` | 提示词列表（按插入顺序） |
| POST | `/api/prompts` | 新增提示词，body `{ content }` |
| DELETE | `/api/prompts/:id` | 删除提示词 |
| POST | `/api/import` | 一次性导入旧会话（数据库非空时跳过） |
| POST | `/api/prompts/import` | 一次性导入旧提示词（数据库非空时跳过） |

## 目录结构

```
server/
├── index.js            # Express 路由、静态托管、错误处理
├── db.js               # SQLite 连接、建表、事务
└── deepseek.js         # 服务端模型调用（key 只在这里读）
scripts/
└── dev.mjs             # 同时启动前端和后端
src/
├── App.vue             # 主界面：消息列表、抽屉、提示词弹层、发送逻辑
├── api/chat.js         # 后端接口封装
├── stores/counter.js   # ts（提示词，走后端）+ msg（会话，走后端）
└── components/
    ├── newMsg.vue              # 新建对话
    ├── PromptTable.vue         # 提示词表格
    ├── ConversationList.vue    # 会话列表
    └── ConversationMenu.vue    # 会话行右侧菜单（切换 / 删除）
```

## 已知限制

- 单用户、仅监听 `127.0.0.1`，没有登录和权限；不要直接暴露到公网
- 回复是一次性返回，没有流式输出
- 没有 markdown 渲染，纯文本展示
- 提示词目前只支持新增和删除，不支持编辑；顺序即 system prompt 的拼接顺序
