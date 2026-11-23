// 容量试摆页：同产品多种摆法，找不粘连前提下每盘最大容量
import { store, type AppState } from '../store'
import { badge, button, clear, emptyState, h } from '../dom'
import type { SweepRequest, SweepResult } from '../sweep_worker'
import type { SweepRow } from '../sweep_core'
import { uid } from '../../db/idb'

export function sweepPage(container: HTMLElement): () => void {
  let unsub = () => {}
  let worker: Worker | null = null

  function render(state: AppState): void {
    clear(container)
    const tray = state.trays.find((t) => t.id === state.selectedTrayId)
    if (!tray || state.recipes.length === 0) {
      container.append(emptyState('缺少配方或盘型', '先在基础数据页准备好配方和盘型。'))
      return
    }
    const resultBox = h('div', { class: 'panel-body' })
    const progress = badge('待运行', 'neutral') as HTMLElement
    const run = () => {
      worker?.terminate()
      worker = new Worker(new URL('../sweep_worker.ts', import.meta.url), { type: 'module' })
      const req: SweepRequest = {
        recipes: state.recipes,
        tray,
        gaps: [4, 6, 8, 10, 12, 16, 20, 28],
        margins: [Math.max(8, 10), 16],
        cell: state.settings.gridCell,
      }
      progress.textContent = '计算中…'
      progress.className = 'badge badge-warning'
      resultBox.replaceChildren(h('p', { class: 'field-hint' }, '正在逐组合做带证书的间隙扫描…'))
      worker.postMessage(req)
      worker.onmessage = (ev: MessageEvent) => {
        if (ev.data.type === 'done') {
          progress.textContent = '完成'
          progress.className = 'badge badge-success'
          showResult(ev.data.result as SweepResult, resultBox, state)
        }
      }
      worker.onerror = (e) => {
        progress.textContent = '失败'
        progress.className = 'badge badge-danger'
        resultBox.replaceChildren(h('p', { class: 'field-hint' }, `Worker 错误：${e.message}`))
      }
    }

    const side = h('div', { class: 'panel panel-side' },
      h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, '容量试摆')),
      h('div', { class: 'panel-body' },
        h('p', { class: 'field-hint' }, `盘型：${tray.name}（${tray.width}×${tray.depth}）`),
        h('p', { class: 'field-hint' }, `枚举 8 档间距 × 2 档边距 × 行列/梅花，共 32 种摆法，在醒发末态用体素证书判定粘连。`),
        h('div', { class: 'btn-row' }, button('开始试摆', 'primary', run), progress),
      ),
    )
    const main = h('div', { class: 'panel panel-wide' },
      h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, '试摆结果（按保证间隙排序）')),
      resultBox,
    )
    container.append(side, main)
  }

  function showResult(result: SweepResult, box: HTMLElement, state: AppState): void {
    const rows = [...result.rows].sort((a, b) => {
      if (a.contact !== b.contact) return a.contact ? 1 : -1
      return b.count - a.count
    })
    const best = result.best
    const saveBest = () => {
      if (!result.bestPlan) return
      const plan = { ...result.bestPlan, id: uid('plan') }
      void store.savePlan(plan).then(() => alert(`已保存「${plan.name}」，可到摆盘/推演页查看。`))
    }
    box.replaceChildren(
      best
        ? h('div', { class: 'stat-grid', style: 'grid-template-columns:1fr 1fr' },
            h('div', { class: 'stat-card row-success' },
              h('div', { class: 'stat-value' }, String(best.count)),
              h('div', { class: 'stat-label' }, `不粘连最大容量 · ${best.mode === 'grid' ? '行列' : '梅花'} · 间距 ${best.gap}mm`),
            ),
            h('div', { class: 'stat-card' },
              h('div', { class: 'stat-value' }, `${best.minCertifiedGap.toFixed(1)}mm`),
              h('div', { class: 'stat-label' }, '最小保证间隙（任意截面均有空隙）'),
            ),
          )
        : h('p', { class: 'field-hint' }, '所有摆法在醒发末态都粘连，需要加大间距或换大盘。'),
      best ? button('把最优摆法存为方案', 'primary', saveBest) : '',
      h('table', { class: 'data', style: 'margin-top:16px' },
        h('thead', {}, h('tr', {},
          h('th', {}, '模式'), h('th', {}, '间距'), h('th', {}, '边距'), h('th', {}, '个数'), h('th', {}, '保证间隙'), h('th', {}, '结论'),
        )),
        h('tbody', {}, ...rows.map((r: SweepRow) =>
          h('tr', { class: r.contact ? 'row-danger' : 'row-success' },
            h('td', {}, r.mode === 'grid' ? '行列' : '梅花'),
            h('td', {}, `${r.gap}mm`),
            h('td', {}, `${r.margin}mm`),
            h('td', {}, String(r.count)),
            h('td', {}, r.minCertifiedGap > 100 ? '—' : `${r.minCertifiedGap.toFixed(1)}mm`),
            h('td', {}, r.contact ? badge('粘连', 'danger') : badge('安全', 'success')),
          ),
        )),
      ),
    )
    void state
  }

  unsub = store.sub(render)
  return () => { unsub(); worker?.terminate() }
}
