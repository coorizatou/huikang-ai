<script setup>
import { ElMessage, ElMessageBox } from 'element-plus'
import { msgCountStore } from '@/stores/counter'

const store = msgCountStore()

const open = () => {
    ElMessageBox.prompt('新对话标题', '创建新对话', {
        confirmButtonText: '保存',
        cancelButtonText: '取消',
        inputPlaceholder: '例如：日语练习',
        inputValidator: (value) => (value && value.trim() ? true : '标题不能为空'),
    })
        .then(async ({ value }) => {
            try {
                await store.createConversation(value)
                ElMessage({
                    type: 'success',
                    message: `已创建：${value.trim()}`,
                })
            } catch (error) {
                ElMessage.error(`创建失败：${error.message}`)
            }
        })
        .catch(() => {
            // 用户取消，不再弹提示
        })
}
</script>

<template>
    <el-button @click="open" color="#626aef"
        style="margin: 0px 50% 10px 50%;transform: translateX(-50%);gap: 5px;display: flex;"><el-icon>
            <ChatSquare />
        </el-icon><span>添加新对话</span>
    </el-button>
</template>

<style scoped></style>
