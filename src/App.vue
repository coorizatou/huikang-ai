<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import ConversationList from './components/ConversationList.vue'
import PromptTable from './components/PromptTable.vue'
import newMsg from './components/newMsg.vue'
import { tsCountStore, msgCountStore } from './stores/counter'

const store = tsCountStore()
const msgStore = msgCountStore()

// 侧边栏
const drawer = ref(false)

// 提示词
const ts = ref(false)
const tsChange = () => {
  ts.value = !ts.value
}
const addTs = async () => {
  const content = store.newTs.trim()
  if (!content) {
    ElMessage.warning('请先输入提示词')
    return
  }
  try {
    await store.addPrompt(content)
    store.newTs = ''
  } catch (error) {
    ElMessage.error(`添加失败：${error.message}`)
  }
}

// 系统提示词：数据库里每条一行，空行忽略
const systemInstruction = computed(() =>
  store.prompts
    .map(item => item.content)
    .filter(Boolean)
    .join('\n')
)

// 当前会话的消息（由 store 从后端加载）
const messages = computed(() => msgStore.messages)

// 切换 / 新建会话时收起抽屉并滚到底部
watch(() => msgStore.currentId, () => {
  drawer.value = false
  nextTick(scrollToBottom)
})

const formatTime = (iso) => (iso ? new Date(iso).toLocaleString() : '')

// 输入框
const input = ref('')

async function main() {
  if (msgStore.sending) return

  const text = input.value.trim()
  if (!text) {
    ElMessage.warning('请输入内容')
    return
  }

  input.value = ''
  await nextTick()
  scrollToBottom()

  try {
    await msgStore.sendMessage(text, systemInstruction.value)
    await nextTick()
    scrollToBottom()
  } catch (error) {
    // 服务端没有落库，把输入还原，改完直接重试即可
    input.value = text
    console.error('❌ 出错了:', error)
    ElMessage.error(`发送失败：${error?.message || '未知错误'}`)
  }
}

async function deleteMessage(id) {
  try {
    await msgStore.removeMessage(id)
  } catch (error) {
    ElMessage.error(`删除失败：${error?.message || '未知错误'}`)
  }
}

async function copyMessage(text) {
  try {
    await navigator.clipboard.writeText(text ?? '')
    ElMessage.success('复制成功')
  } catch {
    ElMessage.error('复制失败')
  }
}

// 滚动到页面底部
const kaiwa = ref(null)
function scrollToBottom() {
  const el = kaiwa.value
  if (!el) return
  el.scrollTop = el.scrollHeight
}

// 刷新界面
function refreshPage() {
  window.location.reload()
}

onMounted(async () => {
  try {
    await Promise.all([msgStore.init(), store.init()])
    await nextTick()
    scrollToBottom()
  } catch (error) {
    console.error(error)
    ElMessage.error(error?.message || '初始化失败')
  }
})
</script>

<template>
  <div class="index">

    <div style="text-align: center;width: 100%;">
      <div style="background-color: whitesmoke;">慧康ai</div>
    </div>


    <!-- 对话框 -->
    <div class="kaiwa" ref="kaiwa" style="flex: 1;  overflow-y: auto;">
      <div v-for="item in messages" :key="item.id">

        <!-- 用户信息 -->
        <div v-if="item.role === 'user'">
          <div class="time"><span>{{ formatTime(item.createdAt) }}</span></div>
          <div class="usermsg">
            <div>
              <div>
                <span>{{ item.content }}</span>
              </div>
              <div style="margin-top: 10px;text-align: right;"><el-icon @click="deleteMessage(item.id)">
                  <Remove />
                </el-icon></div>
            </div>
            <img src="./assets/ai-micro/chat_user.png" style="width: 33px; height: 33px;">
          </div>
        </div>

        <!-- ai回复 -->
        <div v-else>
          <div class="time"><span>{{ formatTime(item.createdAt) }}</span></div>

          <div class="aimsg">
            <img src="./assets/ai-micro/chat_ai.png" style="height: 33px;width: 33px;">

            <div class="aimsgR">
              <!--文字 -->
              <div>
                <span>{{ item.content }}</span>
              </div>
              <!-- 功能图标 -->
              <div style="margin: 10px 0 0 5px;">
                <el-icon @click="copyMessage(item.content)" style="margin-right: 10px;">
                  <DocumentCopy />
                </el-icon>

                <el-icon @click="deleteMessage(item.id)">
                  <Remove />
                </el-icon>
              </div>

            </div>
          </div>
        </div>

      </div>
    </div>


    <!-- 侧边栏 -->
    <el-drawer v-model="drawer" title="会话历史" :with-header="true" direction="ltr" size="320px">
      <ConversationList />
    </el-drawer>

    <!-- 提示词 -->
    <div v-if="ts" class="systemInstruction" style="box-shadow: var(--el-box-shadow-dark);">
      <div class="ts1">修改提示词</div>
      <hr>
      <div class="ts2">
        <div class="ts2Left">
          <PromptTable />
        </div>
        <div class="ts2Right">
          <div style="padding: 12px;">
            <el-input v-model="store.newTs" style="width: 100%;" placeholder="输入新的提示词" @keyup.enter="addTs" />
          </div>
        </div>
      </div>
      <hr>
      <div class="ts3">
        <el-button color="#67C23A" style="color: aliceblue;" @click="tsChange">保存并返回</el-button>
        <el-button @click="addTs" color="#67C23A" style="color: aliceblue;">保存</el-button>
        <el-button style="border-color: #409EFF;color: #409EFF;" @click="tsChange">关闭</el-button>
        <span style="font-size: 12px;line-height: 32px;">修改说明</span>
      </div>
    </div>


    <!-- 底部 -->
    <div position="bottom" :offset="0" style="max-width: 90vw;margin: 0 auto;">

      <newMsg></newMsg>

      <div class="bottom">
        <div class="btn" style="padding: 5px; margin: 0px 10px;">
          <el-button @click="drawer = true" style="border: none;"><el-icon>
              <Calendar />
            </el-icon>历史对话</el-button>
          <el-button @click="refreshPage" style="border: none;"><el-icon>
              <Refresh />
            </el-icon>刷新</el-button>
          <el-button @click="scrollToBottom" style="border: none;"><el-icon>
              <ArrowDown />
            </el-icon>到底部</el-button>
          <el-button @click="tsChange" style="border: none;"><el-icon>
              <Edit />
            </el-icon>修改提示词</el-button>
          <el-button style="border: none;"><el-icon>
              <Microphone />
            </el-icon>语音录入</el-button>
        </div>
        <hr>

        <div style="padding: 10px; display: flex; margin: 0px 10px; gap: 5px;">
          <el-input v-model="input" style="width: 100%" placeholder="请输入内容，Enter 发送" @keyup.enter="main" />
          <el-button class="msgBtn" color="#626aef" :loading="msgStore.sending" @click="main">发送</el-button>
        </div>
      </div>
    </div>

  </div>
</template>

<style>
* {
  margin: 0;
  padding: 0;
  /* background-color: whitesmoke; */
}

.index {
  /* max-height: 100vh; */
  height: 100vh;
  display: flex;
  flex-direction: column;
}

body {
  background-color: whitesmoke;
}

.bottom {
  background-color: white;
  width: 90vw;
  margin: 0 auto;
  margin-bottom: 8px;
  min-height: 50px;
  border-radius: 5px;
}


.btn .el-button {
  /* color: rgb(33, 33, 6); */
  border: none;
  padding: 0px 10px;
}

.btn span {
  font-size: 13px;
  line-height: 13px;
}


.kaiwa {
  scroll-behavior: smooth;
}

.usermsg {
  /* text-align: right; */
  /* border: 1px solid black; */
  margin: 5px 0;
  padding: 10px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.usermsg span {
  text-align: center;
  background-color: rgb(198, 226, 255);
  border-radius: 5px;
  padding: 10px;
  display: inline-block;
  max-width: 60vw;
}

.aimsg {
  /* border: 1px solid black; */
  margin: 5px 0;
  text-align: left;
  padding: 5px;
  display: flex;
  gap: 10px;
}

.aimsgR {
  margin: 5px;
}

.aimsg span {
  background-color: white;
  padding: 10px;
  border-radius: 5px;
  font-weight: 500;
  /* text-align: center; */
  display: inline-block;
  max-width: 60vw;
  /* max-width: 500px; */
  white-space: normal;
}


/* 提示词 */
.systemInstruction {
  position: fixed;
  width: 90vw;
  min-width: 900px;
  /* height: 50px; */
  background-color: rgb(222, 222, 222);
  top: 50%;
  left: 50%;
  border-radius: 15px;
  /* border: 1px solid black; */
  z-index: 100;
  transform: translate3d(-50%, -50%, 0)
}

.ts1 {
  text-align: center;
  font-size: 16px;
  font-weight: 700;
  padding: 16px;
  /* background-color: rgb(171, 171, 171); */
}

.ts2 {
  height: 50vh;
  display: flex;
  background-color: aliceblue;
}

.ts2Left {
  width: 43vw;
  min-width: 430px;
  border-right: 1px solid #8480803e;
}

.ts2Right {
  min-width: 470px;
  width: 47vw;
}

.ts3 {
  padding: 10px;
  display: flex;
  justify-content: space-around;
}



@media (max-width: 600px) {
  .aimsg span {
    max-width: 60%;
  }

  .systemInstruction {
    min-width: 900px;
  }
}

/* 输入框 */
.el-input__wrapper {
  border: none !important;
  box-shadow: none !important;
}

/* 发送按钮 */
.msgBtn {
  background-color: aqua;
  color: aliceblue;
}

.time {
  text-align: center;
  font-size: 12px;
  color: rgb(144, 143, 142);
}
</style>
