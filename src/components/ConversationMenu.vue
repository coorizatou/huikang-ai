<script setup>
import { ref } from 'vue'
import { ElMessage, ElMessageBox, ClickOutside as vClickOutside } from 'element-plus'
import { msgCountStore } from '@/stores/counter'

const store = msgCountStore()

const buttonRef = ref()
const popoverRef = ref()

const props = defineProps({
    id: {
        type: Number,
        required: true,
    },
    title: {
        type: String,
        default: '',
    },
})

const hidePopover = () => popoverRef.value?.hide()

const changeConversation = () => {
    hidePopover()
    store.selectConversation(props.id).catch((error) => ElMessage.error(error.message))
}

const removeConversation = async () => {
    hidePopover()
    try {
        await ElMessageBox.confirm(
            `删除「${props.title || '这个对话'}」后无法恢复，确定吗？`,
            '删除对话',
            {
                type: 'warning',
                confirmButtonText: '删除',
                cancelButtonText: '取消',
            }
        )
    } catch {
        return
    }

    try {
        await store.removeConversation(props.id)
        ElMessage.success('已删除')
    } catch (error) {
        ElMessage.error(`删除失败：${error.message}`)
    }
}
</script>

<template>
    <el-button color="#FFFFFF" type="info" round ref="buttonRef" v-click-outside="hidePopover">
        <el-icon>
            <More />
        </el-icon>
    </el-button>

    <el-popover ref="popoverRef" :virtual-ref="buttonRef" trigger="click" virtual-triggering>
        <div class="naka">
            <el-button @click="changeConversation" color="#EBEEF5">変わる</el-button>
            <el-button color="red" style="margin: 0;" @click="removeConversation">Remove</el-button>
        </div>
    </el-popover>
</template>

<style scoped>
.naka {
    display: flex;
    gap: 10px;
    flex-direction: column;
    /* width: 100px; */
}

.naka button {
    padding: 8px 0;
    /* width: 90px; */
}

.el-popper {
    width: 50px;
}
</style>
