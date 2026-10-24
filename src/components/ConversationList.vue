<script setup>
import { ElMessage } from 'element-plus'
import { msgCountStore } from '@/stores/counter';
import ConversationMenu from './ConversationMenu.vue';

const store = msgCountStore()

const selectConversation = async (id) => {
    try {
        await store.selectConversation(id)
    } catch (error) {
        ElMessage.error(error.message)
    }
}
</script>

<template>
    <div>
        <div class="msgHis" v-for="item in store.conversations" :key="item.id">
            <div class="msgHis1">
                <span :class="{ active: item.id === store.currentId }" @click="selectConversation(item.id)">{{ item.title }}</span>
                <ConversationMenu :id="item.id" :title="item.title" />
            </div>
        </div>
    </div>
</template>

<style scoped>
.msgHis {
    flex-direction: column;
    /* padding: 10px; */
    margin-bottom: 15px;
    gap: 20px;
}

.msgHis1 {
    display: flex;
    gap: 10px;
}

.msgHis1 span {
    flex: 1;
    /* width: 70px; */
    border: 1px solid #CDD0D6;
    line-height: 27px;
    border-radius: 15px;
    padding: 5px;
    font-size: 15px;
    cursor: pointer;
}

.msgHis1 span:hover {
    background-color: #E4E7ED;
    border: 1px solid white;
}

.msgHis1 span.active {
    border-color: #626aef;
    color: #626aef;
    background-color: #f0f2ff;
}
</style>
