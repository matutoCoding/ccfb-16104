// 设置页：渲染与扫描精度
import { store } from '../store'
import { badge, clear, field, h, numInput } from '../dom'

export function settingsPage(container: HTMLElement): () => void {
  function render(): void {
    const s = store.state.settings
    clear(container)
    const update = (patch: Partial<typeof s>) => void store.updateSettings({ ...s, ...patch })
    container.append(
      h('div', { class: 'panel', style: 'max-width:640px;width:100%' },
        h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, '推演与渲染设置')),
        h('div', { class: 'panel-body' },
          field('粘连扫描体素 mm（越小证书越紧、计算越慢）', numInput(s.gridCell, 0.5, 0.5, 8, (v) => update({ gridCell: v }))),
          field('渲染分辨率比例（0.6~1.5，低配置可降）', numInput(s.rayScale, 0.1, 0.5, 1.5, (v) => update({ rayScale: v }))),
          field('光线步进最大步数', numInput(s.maxSteps, 8, 32, 192, (v) => update({ maxSteps: Math.round(v) }))),
          h('div', { class: 'section-title' }, '性能说明'),
          h('p', { class: 'field-hint' }, '片元着色器用均匀网格 DDA 加速，60 个面团在 1080p 下目标 ≥30 FPS；实际帧率显示在推演页 HUD。粘连判定在 CPU 侧做体素扫描，证书间隙 = 采样最小值 − L·h√3/2，为真实间隙的严格下界。'),
          h('div', { style: 'margin-top:16px' }, badge('数据保存在浏览器 IndexedDB', 'neutral')),
        ),
      ),
    )
  }
  return store.sub(render)
}
