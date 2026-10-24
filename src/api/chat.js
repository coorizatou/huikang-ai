const BASE = '/api'

async function request(path, options = {}) {
  let response
  try {
    response = await fetch(`${BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    })
  } catch {
    throw new Error('无法连接后端服务，请确认已运行 npm run server')
  }

  if (!response.ok) {
    let message = `请求失败（HTTP ${response.status}）`
    try {
      const data = await response.json()
      if (data?.error) message = data.error
    } catch {
      // 响应不是 JSON 时保留默认提示
    }
    throw new Error(message)
  }

  if (response.status === 204) return null
  return response.json()
}

export const listConversations = () => request('/conversations')

export const createConversation = (title) =>
  request('/conversations', {
    method: 'POST',
    body: JSON.stringify({ title }),
  })

export const removeConversation = (id) =>
  request(`/conversations/${id}`, { method: 'DELETE' })

export const listMessages = (id) => request(`/conversations/${id}/messages`)

export const sendMessage = (id, content, systemInstruction) =>
  request(`/conversations/${id}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content, systemInstruction }),
  })

export const removeMessage = (id) => request(`/messages/${id}`, { method: 'DELETE' })

export const listPrompts = () => request('/prompts')

export const createPrompt = (content) =>
  request('/prompts', {
    method: 'POST',
    body: JSON.stringify({ content }),
  })

export const removePrompt = (id) => request(`/prompts/${id}`, { method: 'DELETE' })

export const importPrompts = (prompts) =>
  request('/prompts/import', {
    method: 'POST',
    body: JSON.stringify({ prompts }),
  })

export const importConversations = (conversations) =>
  request('/import', {
    method: 'POST',
    body: JSON.stringify({ conversations }),
  })
