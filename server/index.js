import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { DB_FILE, db, now, withTransaction } from './db.js'
import { complete, getModel } from './deepseek.js'

const PORT = Number(process.env.PORT || 3000)
const HOST = process.env.HOST || '127.0.0.1'

const app = express()
app.use(express.json({ limit: '5mb' }))

const httpError = (status, message) => Object.assign(new Error(message), { status, expose: true })
const badRequest = (message) => httpError(400, message)
const notFound = (message) => httpError(404, message)

const toConversation = (row) => ({
  id: row.id,
  title: row.title,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  messageCount: row.message_count ?? 0,
  lastMessageAt: row.last_message_at ?? null,
})

const toMessage = (row) => ({
  id: row.id,
  role: row.role,
  content: row.content,
  createdAt: row.created_at,
})

const toPrompt = (row) => ({
  id: row.id,
  content: row.content,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const parseId = (value) => {
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0) throw badRequest('非法的 id')
  return id
}

const getConversation = (id) => {
  const row = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id)
  if (!row) throw notFound('会话不存在')
  return row
}

const getMessage = (id) => {
  const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(id)
  if (!row) throw notFound('消息不存在')
  return row
}

const normalizeTime = (value) => {
  if (!value) return now()
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? now() : date.toISOString()
}

// 让 sqlite 的 snake_case 直接映射成前端用的 camelCase
const conversationQuery = `
  SELECT c.id, c.title, c.created_at, c.updated_at,
         COUNT(m.id) AS message_count,
         MAX(m.created_at) AS last_message_at
  FROM conversations c
  LEFT JOIN messages m ON m.conversation_id = c.id
  GROUP BY c.id
`

app.get('/api/health', (req, res) => {
  const { c } = db.prepare('SELECT COUNT(*) AS c FROM conversations').get()
  const { p } = db.prepare('SELECT COUNT(*) AS p FROM prompts').get()
  res.json({ ok: true, model: getModel(), conversations: c, prompts: p })
})

app.get('/api/conversations', (req, res) => {
  const rows = db.prepare(`${conversationQuery} ORDER BY c.updated_at DESC, c.id DESC`).all()
  res.json(rows.map(toConversation))
})

app.post('/api/conversations', (req, res) => {
  const title = String(req.body?.title ?? '').trim() || '新对话'
  if (title.length > 120) throw badRequest('标题不能超过 120 个字符')

  const createdAt = now()
  const info = db
    .prepare('INSERT INTO conversations (title, created_at, updated_at) VALUES (?, ?, ?)')
    .run(title, createdAt, createdAt)

  const row = getConversation(Number(info.lastInsertRowid))
  res.status(201).json(toConversation({ ...row, message_count: 0, last_message_at: null }))
})

app.delete('/api/conversations/:id', (req, res) => {
  const id = parseId(req.params.id)
  const info = db.prepare('DELETE FROM conversations WHERE id = ?').run(id)
  if (info.changes === 0) throw notFound('会话不存在')
  res.status(204).end()
})

app.get('/api/conversations/:id/messages', (req, res) => {
  const id = parseId(req.params.id)
  getConversation(id)
  const rows = db
    .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY id')
    .all(id)
  res.json(rows.map(toMessage))
})

app.post('/api/conversations/:id/messages', async (req, res) => {
  const id = parseId(req.params.id)
  getConversation(id)

  const content = String(req.body?.content ?? '').trim()
  if (!content) throw badRequest('消息内容不能为空')
  if (content.length > 20000) throw badRequest('单条消息不能超过 20000 个字符')

  const systemInstruction = String(req.body?.systemInstruction ?? '').trim()

  const history = db
    .prepare('SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY id')
    .all(id)

  const messages = []
  if (systemInstruction) messages.push({ role: 'system', content: systemInstruction })
  for (const item of history) messages.push({ role: item.role, content: item.content })
  messages.push({ role: 'user', content })

  // 先拿到模型回复，成功后再一个事务写入两条消息，失败不会留下半截对话
  const reply = await complete(messages)

  const { userId, aiId } = withTransaction(() => {
    const userInfo = db
      .prepare('INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)')
      .run(id, 'user', content, now())
    const aiInfo = db
      .prepare('INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)')
      .run(id, 'assistant', reply, now())
    db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now(), id)
    return { userId: Number(userInfo.lastInsertRowid), aiId: Number(aiInfo.lastInsertRowid) }
  })

  res.json({
    userMessage: toMessage(getMessage(userId)),
    aiMessage: toMessage(getMessage(aiId)),
  })
})

app.delete('/api/messages/:id', (req, res) => {
  const id = parseId(req.params.id)
  const row = getMessage(id)
  db.prepare('DELETE FROM messages WHERE id = ?').run(id)
  db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now(), row.conversation_id)
  res.status(204).end()
})

app.get('/api/prompts', (req, res) => {
  const rows = db.prepare('SELECT * FROM prompts ORDER BY id').all()
  res.json(rows.map(toPrompt))
})

app.post('/api/prompts', (req, res) => {
  const content = String(req.body?.content ?? '').trim()
  if (!content) throw badRequest('提示词不能为空')
  if (content.length > 2000) throw badRequest('提示词不能超过 2000 个字符')

  const at = now()
  const info = db
    .prepare('INSERT INTO prompts (content, created_at, updated_at) VALUES (?, ?, ?)')
    .run(content, at, at)

  const row = db.prepare('SELECT * FROM prompts WHERE id = ?').get(Number(info.lastInsertRowid))
  res.status(201).json(toPrompt(row))
})

app.delete('/api/prompts/:id', (req, res) => {
  const id = parseId(req.params.id)
  const row = db.prepare('SELECT id FROM prompts WHERE id = ?').get(id)
  if (!row) throw notFound('提示词不存在')
  db.prepare('DELETE FROM prompts WHERE id = ?').run(id)
  res.status(204).end()
})

// 一次性迁移：把旧版 localStorage 里的提示词导入数据库
app.post('/api/prompts/import', (req, res) => {
  const { c } = db.prepare('SELECT COUNT(*) AS c FROM prompts').get()
  if (c > 0) {
    res.json({ imported: 0, skipped: true })
    return
  }

  const list = Array.isArray(req.body?.prompts) ? req.body.prompts : []
  const result = withTransaction(() => {
    let imported = 0
    for (const item of list) {
      const content = String(item?.content ?? '').trim()
      if (!content) continue
      db.prepare('INSERT INTO prompts (content, created_at, updated_at) VALUES (?, ?, ?)')
        .run(content, normalizeTime(item?.createdAt), now())
      imported += 1
    }
    return { imported }
  })

  res.json({ imported: result.imported, skipped: false })
})

// 一次性迁移：把浏览器 localStorage 里的旧会话导入数据库
app.post('/api/import', (req, res) => {
  const { c } = db.prepare('SELECT COUNT(*) AS c FROM conversations').get()
  if (c > 0) {
    res.json({ imported: 0, messages: 0, skipped: true })
    return
  }

  const list = Array.isArray(req.body?.conversations) ? req.body.conversations : []
  if (!list.length) {
    res.json({ imported: 0, messages: 0, skipped: false })
    return
  }

  const result = withTransaction(() => {
    let conversations = 0
    let messages = 0

    for (const item of list) {
      const title = String(item?.title ?? '').trim().slice(0, 120) || '导入会话'
      const conversationInfo = db
        .prepare('INSERT INTO conversations (title, created_at, updated_at) VALUES (?, ?, ?)')
        .run(title, now(), now())
      const conversationId = Number(conversationInfo.lastInsertRowid)
      conversations += 1

      for (const message of Array.isArray(item?.messages) ? item.messages : []) {
        const role = message?.role === 'assistant' || message?.role === 'model' ? 'assistant' : 'user'
        const content = String(message?.content ?? '').trim()
        if (!content) continue
        db.prepare('INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)')
          .run(conversationId, role, content, normalizeTime(message?.createdAt))
        messages += 1
      }
    }

    return { conversations, messages }
  })

  res.json({ imported: result.conversations, messages: result.messages, skipped: false })
})

// 未知的 /api 路径返回 JSON，而不是 HTML
app.use('/api', (req, res) => {
  res.status(404).json({ error: '接口不存在' })
})

// 有 dist 时顺便托管生产构建，`npm start` 一个端口就能用
const distDir = path.resolve('dist')
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next()
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

// eslint-disable-next-line no-unused-vars -- Express 靠 4 个参数识别错误中间件
app.use((err, req, res, next) => {
  const status = Number(err.status) || 500
  if (status >= 500) console.error('[api]', err)
  const message = err.expose || status < 500 ? err.message : '服务器内部错误'
  res.status(status).json({ error: message })
})

const server = app.listen(PORT, HOST, () => {
  console.log(`[api] http://${HOST}:${PORT}`)
  console.log(`[api] model: ${getModel()}`)
  console.log(`[api] db: ${DB_FILE}`)
})

const shutdown = () => {
  server.close(() => process.exit(0))
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
