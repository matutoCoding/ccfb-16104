// 膨胀推演页：醒发→烘烤时间轴播放，粘连事件检测与红色标记
import { store, type AppState } from '../store'
import { badge, button, clear, emptyState, h } from '../dom'
import { createViewport, type Viewport } from '../viewport'
import { SimEngine, runTimeline } from '../../sim/engine'
import type { ContactEvent } from '../../types'
import { frameToScene } from '../scene_adapter'

export function simulationPage(container: HTMLElement): () => void {
  let unsub = () => {}
  let viewport: Viewport | null = null
  let engine: SimEngine | null = null
  let events: ContactEvent[] = []
  let curT = 0
  let playing = false
  let raf = 0
  let lastTick = 0
  let fpsTimer = 0
  let disposed = false

  function render(state: AppState): void {
    stopPlay()
    clear(container)
    const plan = state.layouts.find((l) => l.id === state.selectedLayoutId)
    const tray = state.trays.find((t) => t.id === plan?.trayId)
    if (!plan || !tray) {
      container.append(emptyState('没有可推演的方案', '先在摆盘编辑页准备一个摆盘方案。'))
      return
    }
    engine = new SimEngine()
    engine.load(state.recipes, tray, plan, state.settings.gridCell)
    curT = 0
    events = []

    viewport = createViewport()
    const fpsBadge = badge('FPS —', 'neutral') as HTMLElement
    const phaseBadge = badge('醒发 00:00', 'neutral') as HTMLElement
    const contactBadge = badge('未检测粘连', 'success') as HTMLElement
    const countBadge = badge(`${plan.doughs.length} 个面团`, 'neutral') as HTMLElement

    const slider = h('input', { type: 'range', min: 0, max: 1000, value: 0, class: 'sim-slider' }) as HTMLInputElement
    slider.addEventListener('input', () => {
      stopPlay()
      seek(Number(slider.value) / 1000, phaseBadge, contactBadge)
    })

    const playBtn = button('播放', 'primary', () => togglePlay(playBtn, slider, phaseBadge, contactBadge))
    const analyzeBtn = button('全时间轴粘连检测', 'ghost', () => analyze(contactBadge, eventList))
    const eventList = h('div', { class: 'panel-body', style: 'padding-top:0' })

    const side = h('div', { class: 'panel panel-side' },
      h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, '膨胀推演')),
      h('div', { class: 'panel-body' },
        h('div', { class: 'section-title' }, '时间轴'),
        h('p', { class: 'field-hint' }, `醒发 ${fmt(engine.proofDuration)} → 烘烤 ${fmt(engine.bakeDuration)}`),
        h('div', { class: 'btn-row' }, playBtn, analyzeBtn),
        h('div', { class: 'section-title' }, '粘连事件'),
      ),
      eventList,
    )

    const main = h('div', { class: 'panel panel-wide' },
      h('div', { class: 'panel-head' },
        h('h2', { class: 'panel-title' }, '隐式曲面光线步进视图'),
        h('div', { class: 'btn-row' }, phaseBadge, contactBadge, countBadge, fpsBadge),
      ),
      h('div', { style: 'flex:1;min-height:0;padding:16px;display:flex' }, viewport.root),
      h('div', { class: 'timeline' },
        h('span', {}, '入盘'),
        slider,
        h('span', {}, '出炉'),
        h('span', { class: 'timeline-time' }, '00:00 / 00:00'),
      ),
    )
    container.append(side, main)
    seek(0, phaseBadge, contactBadge)
    const fpsTimerLocal = window.setInterval(() => {
      if (viewport) fpsBadge.textContent = `FPS ${viewport.renderer.fps.toFixed(0)}`
    }, 500)
    fpsTimer = fpsTimerLocal
  }

  function seek(u: number, phaseBadge: HTMLElement, contactBadge: HTMLElement): void {
    if (!engine || !viewport) return
    const total = engine.proofDuration + engine.bakeDuration
    curT = u * total
    const frame = engine.buildFrame(curT)
    const markers = eventsAt(events, curT)
    const state = store.state
    const tray = state.trays.find((t) => t.id === engine?.plan?.trayId)!
    viewport.setScene(frameToScene(frame, tray, engine.recipes, markers))
    const timeEl = container.querySelector('.timeline-time') as HTMLElement
    if (timeEl) timeEl.textContent = `${fmt(curT)} / ${fmt(total)}`
    const phase = frame.phase === 'proof' ? '醒发' : '烘烤'
    phaseBadge.textContent = `${phase} ${fmt(frame.phaseTime)}`
    phaseBadge.className = `badge ${frame.phase === 'proof' ? 'badge-warning' : 'badge-danger'}`
    const happened = events.filter((e) => e.time <= curT).length
    if (events.length === 0) {
      contactBadge.textContent = '未运行检测'
      contactBadge.className = 'badge badge-neutral'
    } else if (happened === 0) {
      contactBadge.textContent = '当前无粘连'
      contactBadge.className = 'badge badge-success'
    } else {
      contactBadge.textContent = `已粘连 ${happened} 处`
      contactBadge.className = 'badge badge-danger'
    }
  }

  function togglePlay(playBtn: HTMLButtonElement, slider: HTMLInputElement, phaseBadge: HTMLElement, contactBadge: HTMLElement): void {
    if (playing) { stopPlay(); return }
    playing = true
    playBtn.textContent = '暂停'
    lastTick = performance.now()
    const tick = (now: number) => {
      if (!playing || disposed || !engine) return
      const dt = (now - lastTick) / 1000
      lastTick = now
      // 播放速率：全程 60 秒放完
      const total = engine.proofDuration + engine.bakeDuration
      curT = Math.min(total, curT + dt * (total / 60))
      const u = curT / total
      slider.value = String(Math.round(u * 1000))
      seek(u, phaseBadge, contactBadge)
      if (curT >= total) { stopPlay(); playBtn.textContent = '重播'; curT = 0; return }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
  }

  function stopPlay(): void {
    playing = false
    cancelAnimationFrame(raf)
    const btn = container.querySelector('.btn-primary') as HTMLButtonElement | null
    if (btn && btn.textContent === '暂停') btn.textContent = '播放'
  }

  async function analyze(contactBadge: HTMLElement, listEl: HTMLElement): Promise<void> {
    if (!engine) return
    contactBadge.textContent = '检测中…'
    contactBadge.className = 'badge badge-warning'
    await new Promise((r) => setTimeout(r, 30))
    const res = runTimeline(engine, 14)
    events = res.events
    listEl.replaceChildren(...events.length === 0
      ? [h('p', { class: 'field-hint' }, '全时间轴未发现粘连，任意截面两面团间均有正的保证间隙。')]
      : events.map((e) => h('div', { class: 'list-item', style: 'cursor:default' },
          h('div', { class: 'list-item-title' }, `${e.phase === 'proof' ? '醒发' : '烘烤'} ${fmt(e.time)} 粘连`),
          h('div', { class: 'list-item-sub' }, `${e.aId.slice(-6)} ↔ ${e.bId === '__rim__' ? '挡边' : e.bId.slice(-6)} · 重叠 ${Math.abs(e.gap).toFixed(1)}mm`),
        )))
    const slider = container.querySelector('.sim-slider') as HTMLInputElement
    const phaseBadge = container.querySelectorAll('.badge')[0] as HTMLElement
    seek(Number(slider.value) / 1000, phaseBadge, contactBadge)
  }

  function eventsAt(list: ContactEvent[], t: number): [number, number, number][] {
    return list.filter((e) => e.time <= t).map((e) => e.point)
  }

  function fmt(sec: number): string {
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  unsub = store.sub(render)
  return () => {
    disposed = true
    stopPlay()
    window.clearInterval(fpsTimer)
    unsub()
    viewport?.dispose()
  }
}
