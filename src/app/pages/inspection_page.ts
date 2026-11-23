// 出炉检查页：末态测量、尺寸偏差、粘连标红、整盘良率
import { store, type AppState } from '../store'
import { badge, button, clear, emptyState, h } from '../dom'
import { createViewport, type Viewport } from '../viewport'
import { SimEngine, runTimeline } from '../../sim/engine'
import { inspect, type InspectionReport } from '../../sim/inspection'
import { frameToScene } from '../scene_adapter'

export function inspectionPage(container: HTMLElement): () => void {
  let unsub = () => {}
  let viewport: Viewport | null = null
  let report: InspectionReport | null = null

  function render(state: AppState): void {
    clear(container)
    const plan = state.layouts.find((l) => l.id === state.selectedLayoutId)
    const tray = state.trays.find((t) => t.id === plan?.trayId)
    if (!plan || !tray) {
      container.append(emptyState('没有可检查的方案', '先准备摆盘方案并完成推演。'))
      return
    }
    const engine = new SimEngine()
    engine.load(state.recipes, tray, plan, state.settings.gridCell)
    const total = engine.proofDuration + engine.bakeDuration
    const finalFrame = engine.buildFrame(total)
    const { events } = runTimeline(engine, 10)
    report = inspect(finalFrame.instances, engine.recipes, [], events, state.settings.gridCell)

    viewport = createViewport()
    const markers = events.filter((e) => e.bId !== '__rim__').map((e) => e.point)
    viewport.setScene(frameToScene(finalFrame, tray, engine.recipes, markers))

    const main = h('div', { class: 'panel panel-wide' },
      h('div', { class: 'panel-head' },
        h('h2', { class: 'panel-title' }, '出炉末态视图（红点=粘连位置）'),
        h('div', { class: 'btn-row' },
          badge(`合格 ${report.passed}/${report.total}`, report.yieldRate > 0.9 ? 'success' : 'warning'),
          badge(`${events.filter((e) => e.bId !== '__rim__').length} 处粘连`, events.length ? 'danger' : 'success'),
        ),
      ),
      h('div', { style: 'flex:1;min-height:0;padding:16px;display:flex' }, viewport.root),
    )

    const stat = (value: string, label: string, tone: '' | 'danger' | 'success' = '') =>
      h('div', { class: `stat-card ${tone === 'danger' ? 'row-danger' : tone === 'success' ? 'row-success' : ''}` },
        h('div', { class: 'stat-value' }, value), h('div', { class: 'stat-label' }, label))

    const side = h('div', { class: 'panel panel-side' },
      h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, '出炉检查')),
      h('div', { class: 'panel-body' },
        h('div', { class: 'stat-grid', style: 'grid-template-columns:1fr 1fr' },
          stat(String(report.total), '一盘总数'),
          stat(String(report.passed), '合格品', report.yieldRate > 0.9 ? 'success' : 'danger'),
          stat(`${(report.yieldRate * 100).toFixed(1)}%`, '合格率'),
          stat(String(report.contacts), '粘连处', report.contacts ? 'danger' : 'success'),
        ),
        h('table', { class: 'data' },
          h('thead', {}, h('tr', {}, h('th', {}, '面团'), h('th', {}, '长'), h('th', {}, '宽'), h('th', {}, '高'), h('th', {}, '判定'))),
          h('tbody', {}, ...report.measures.map((m, i) =>
            h('tr', { class: m.pass ? 'row-success' : 'row-danger' },
              h('td', {}, `#${i + 1}`),
              h('td', {}, m.length.toFixed(1)),
              h('td', {}, m.width.toFixed(1)),
              h('td', {}, m.height.toFixed(1)),
              h('td', {}, m.pass ? badge('合格', 'success') : badge(m.rimOver ? '越挡边' : '粘连', 'danger')),
            ),
          )),
        ),
        h('div', { style: 'margin-top:16px' }, button('重新测量', 'ghost', () => render(store.state))),
      ),
    )
    container.append(side, main)
  }

  unsub = store.sub(render)
  return () => { unsub(); viewport?.dispose() }
}
