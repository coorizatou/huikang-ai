<script setup>
import { ElMessage } from 'element-plus'
import { tsCountStore } from '@/stores/counter';

const store = tsCountStore()

const formatDate = (iso) => (iso ? new Date(iso).toLocaleDateString() : '')

const removePrompt = async (id) => {
    try {
        await store.removePrompt(id)
        ElMessage.success('已删除')
    } catch (error) {
        ElMessage.error(`删除失败：${error.message}`)
    }
}
</script>

<template>
    <el-table :data="store.prompts" v-loading="store.loading" style="width: 100%" max-height="50vh"
        empty-text="还没有提示词">
        <el-table-column label="日期" min-width="130">
            <template #default="scope">{{ formatDate(scope.row.createdAt) }}</template>
        </el-table-column>
        <el-table-column prop="content" label="提示词" min-width="220" show-overflow-tooltip />
        <el-table-column label="操作" width="90" fixed="right">
            <template #default="scope">
                <el-button link type="danger" size="small" @click.prevent="removePrompt(scope.row.id)">删除</el-button>
            </template>
        </el-table-column>
    </el-table>
</template>
