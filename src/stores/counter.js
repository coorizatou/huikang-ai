import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { ElMessage } from 'element-plus'
import * as chatApi from '@/api/chat'

// 旧版数据在 localStorage 里的 key
const LEGACY_CONVERSATIONS_KEY = 'msg'
const LEGACY_PROMPTS_KEY = 'ts'

const toIsoTime = (value) => {
    if (!value) return undefined
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

// 提示词（数据在 SQLite）
export const tsCountStore = defineStore(`ts`, () => {
    const prompts = ref([])
    const newTs = ref('')
    const loading = ref(false)

    let initialized = false

    const addPrompt = async (content) => {
        const text = String(content ?? '').trim()
        if (!text) return null
        const prompt = await chatApi.createPrompt(text)
        prompts.value.push(prompt)
        return prompt
    }

    const removePrompt = async (id) => {
        await chatApi.removePrompt(id)
        prompts.value = prompts.value.filter((item) => item.id !== id)
    }

    // 把旧版 localStorage 里的提示词一次性导入数据库
    const importLegacyPrompts = async () => {
        const raw = localStorage.getItem(LEGACY_PROMPTS_KEY)
        if (!raw) return

        let data = null
        try {
            data = JSON.parse(raw)
        } catch {
            data = null
        }

        const list = Array.isArray(data?.tableData) ? data.tableData : []
        const payload = list
            .map((item) => ({
                content: String(item?.name ?? '').trim(),
                createdAt: toIsoTime(item?.date),
            }))
            .filter((item) => item.content)

        if (!payload.length) {
            localStorage.removeItem(LEGACY_PROMPTS_KEY)
            return
        }

        try {
            const result = await chatApi.importPrompts(payload)
            localStorage.removeItem(LEGACY_PROMPTS_KEY)
            if (result && !result.skipped && result.imported) {
                ElMessage.success(`已迁移 ${result.imported} 条提示词`)
            }
        } catch (error) {
            // 后端不可用时不删本地数据，下次启动可重试
            console.warn('迁移提示词失败：', error)
        }
    }

    const init = async () => {
        if (initialized) return
        loading.value = true
        try {
            await importLegacyPrompts()
            prompts.value = await chatApi.listPrompts()
            initialized = true
        } finally {
            loading.value = false
        }
    }

    return { prompts, newTs, loading, init, addPrompt, removePrompt }
})

// 聊天记录（数据在 SQLite，这里只缓存当前界面需要的内容）
export const msgCountStore = defineStore(`msg`, () => {
    const conversations = ref([])
    const currentId = ref(null)
    const messages = ref([])
    const loading = ref(false)
    const sending = ref(false)

    let initialized = false

    const currentConversation = computed(
        () => conversations.value.find((item) => item.id === currentId.value) ?? null
    )

    const sortConversations = () => {
        conversations.value.sort(
            (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime() || b.id - a.id
        )
    }

    const loadConversations = async () => {
        conversations.value = await chatApi.listConversations()
    }

    const loadMessages = async (id) => {
        messages.value = await chatApi.listMessages(id)
    }

    const selectConversation = async (id) => {
        if (id === currentId.value) return
        currentId.value = id
        messages.value = []
        await loadMessages(id)
    }

    const createConversation = async (title) => {
        const conversation = await chatApi.createConversation(String(title ?? '').trim() || '新对话')
        conversations.value.unshift(conversation)
        currentId.value = conversation.id
        messages.value = []
        return conversation
    }

    const removeConversation = async (id) => {
        await chatApi.removeConversation(id)
        conversations.value = conversations.value.filter((item) => item.id !== id)

        if (currentId.value !== id) return

        if (conversations.value.length) {
            currentId.value = conversations.value[0].id
            await loadMessages(currentId.value)
        } else {
            await createConversation('新对话')
        }
    }

    const touchConversation = (id) => {
        const conversation = conversations.value.find((item) => item.id === id)
        if (!conversation) return
        conversation.updatedAt = new Date().toISOString()
        sortConversations()
    }

    /**
     * 发送消息：先把用户消息乐观显示出来，服务端成功后用数据库里的记录替换，
     * 失败则撤回这条临时消息（输入框由调用方还原）。
     */
    const sendMessage = async (content, systemInstruction) => {
        if (!currentId.value) throw new Error('还没有选中会话')

        const conversationId = currentId.value
        const tempId = `temp-${Date.now()}`
        messages.value.push({
            id: tempId,
            role: 'user',
            content,
            createdAt: new Date().toISOString(),
        })

        sending.value = true
        try {
            const result = await chatApi.sendMessage(conversationId, content, systemInstruction)
            const index = messages.value.findIndex((item) => item.id === tempId)
            if (index >= 0) messages.value.splice(index, 1, result.userMessage)
            else messages.value.push(result.userMessage)

            messages.value.push(result.aiMessage)
            touchConversation(conversationId)
            return result.aiMessage
        } catch (error) {
            messages.value = messages.value.filter((item) => item.id !== tempId)
            throw error
        } finally {
            sending.value = false
        }
    }

    const removeMessage = async (id) => {
        await chatApi.removeMessage(id)
        messages.value = messages.value.filter((item) => item.id !== id)
    }

    /** 把旧版 localStorage 里的会话一次性导入 SQLite */
    const importLegacyData = async () => {
        const raw = localStorage.getItem(LEGACY_CONVERSATIONS_KEY)
        if (!raw) return

        let data = null
        try {
            data = JSON.parse(raw)
        } catch {
            data = null
        }
        if (!data) {
            localStorage.removeItem(LEGACY_CONVERSATIONS_KEY)
            return
        }

        const lists = Array.isArray(data.msgHis)
            ? data.msgHis
            : Array.isArray(data.msghis)
                ? data.msghis
                : []
        const names = Array.isArray(data.msgListName) ? data.msgListName : []

        const payload = lists
            .map((list, index) => ({
                title: names[index] || `会话 ${index + 1}`,
                messages: (Array.isArray(list) ? list : [])
                    .map((message) => ({
                        role: message?.role === 'model' ? 'assistant' : message?.role,
                        content: Array.isArray(message?.parts)
                            ? message.parts.map((part) => part?.text ?? '').join('')
                            : String(message?.content ?? ''),
                        createdAt: toIsoTime(message?.time),
                    }))
                    .filter((message) => message.content?.trim()),
            }))
            .filter((conversation) => conversation.messages.length)

        if (!payload.length) {
            localStorage.removeItem(LEGACY_CONVERSATIONS_KEY)
            return
        }

        try {
            const result = await chatApi.importConversations(payload)
            localStorage.removeItem(LEGACY_CONVERSATIONS_KEY)
            if (result && !result.skipped && result.imported) {
                ElMessage.success(`已把 ${result.imported} 个本地会话迁移到数据库`)
            }
        } catch (error) {
            // 后端暂时不可用时不删本地数据，下次启动可重试
            console.warn('迁移旧会话失败：', error)
        }
    }

    const init = async () => {
        if (initialized) return
        loading.value = true
        try {
            await importLegacyData()
            await loadConversations()

            if (conversations.value.length) {
                currentId.value = conversations.value[0].id
                await loadMessages(currentId.value)
            } else {
                await createConversation('新对话')
            }

            initialized = true
        } finally {
            loading.value = false
        }
    }

    return {
        conversations,
        currentId,
        messages,
        loading,
        sending,
        currentConversation,
        init,
        loadConversations,
        loadMessages,
        selectConversation,
        createConversation,
        removeConversation,
        sendMessage,
        removeMessage,
    }
})
