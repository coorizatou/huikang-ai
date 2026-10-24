import OpenAI from 'openai'

const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat'
const BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'
const API_KEY = process.env.DEEPSEEK_API_KEY

let client = null

export const getModel = () => MODEL

/**
 * 调用 DeepSeek（OpenAI 兼容接口），返回纯文本回复。
 * 消息格式：[{ role: 'system' | 'user' | 'assistant', content: string }]
 */
export async function complete(messages) {
  if (!API_KEY) {
    const error = new Error('服务端没有配置 DEEPSEEK_API_KEY，请在 .env.local 里填写后重启 server')
    error.status = 500
    throw error
  }

  if (!client) {
    client = new OpenAI({ apiKey: API_KEY, baseURL: BASE_URL })
  }

  const completion = await client.chat.completions.create({
    model: MODEL,
    messages,
    stream: false,
  })

  const content = completion.choices?.[0]?.message?.content
  if (!content) {
    const error = new Error('模型返回了空内容')
    error.status = 502
    throw error
  }
  return content
}
