import { spawn } from 'node:child_process'

// 同时启动 API 服务和 Vite 开发服务器，Ctrl+C 一起退出
const children = []
let stopping = false

const stop = (code) => {
  if (stopping) return
  stopping = true
  for (const child of children) child.kill()
  process.exit(code)
}

process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))

const run = (args) => {
  const child = spawn(process.execPath, args, { stdio: 'inherit' })
  children.push(child)
  child.on('exit', (code) => {
    if (!stopping) stop(code ?? 0)
  })
}

run(['--env-file-if-exists=.env.local', '--disable-warning=ExperimentalWarning', 'server/index.js'])
run(['node_modules/vite/bin/vite.js'])
