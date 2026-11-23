import './styles.css'
import { mountApp } from './app/app'

const root = document.getElementById('app')
if (!root) throw new Error('缺少 #app 挂载点')
mountApp(root).catch((err) => {
  root.replaceChildren()
  const pre = document.createElement('pre')
  pre.style.color = '#dc2626'
  pre.style.padding = '24px'
  pre.textContent = `启动失败：${err instanceof Error ? err.stack ?? err.message : String(err)}`
  root.append(pre)
})
