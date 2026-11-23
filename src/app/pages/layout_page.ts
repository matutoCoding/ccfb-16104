// 摆盘编辑页：拖拽面团、行列/梅花自动排满、实时最小间距提示
import { store, type AppState } from '../store'
import { badge, button, clear, emptyState, field, h, numInput, selectInput } from '../dom'
import { createViewport, type Viewport } from '../viewport'
import { SimEngine, getTemplate } from '../../sim/engine'
import { makeInstance } from '../../sim/instance'
import { doughObject, gapBetween } from '../../sim/contact'
import { arrange } from '../../sim/layout_solver'
import { uid } from '../../db/idb'
import { viewMatrix } from '../../render/camera'
import type { LayoutPlan, PlacedDough } from '../../types'
import { frameToScene } from '../scene_adapter'
export function layoutPage(container: HTMLElement): () => void {
  let unsub = () => {}
  let viewport: Viewport | null = null
  let plan: LayoutPlan | null = null
  let gapMode: 'grid' | 'stagger' = 'grid'
  let gapValue = 12
  let margin = 12
  let selectedId: string | null = null
  let disposers: (() => void)[] = []

  function render(state: AppState): void {
    plan = state.layouts.find((l) => l.id === state.selectedLayoutId) ?? null
    clear(container)
    disposers.forEach((d) => d())
    disposers = []
    if (!plan || !state.trays.length || !state.recipes.length) {
      container.append(emptyState('还没有摆盘方案', '先在配方页和盘型页准备数据，或使用系统预置方案。'))
      return
    }
    const tray = state.trays.find((t) => t.id === plan!.trayId) ?? state.trays[0]
    const side = buildSidePanel(state)
    const viewWrap = buildView(state, tray.id)
    container.append(side, viewWrap)
    updateScene()
  }

  function buildSidePanel(state: AppState): HTMLElement {
    const recipeOptions: [string, string][] = state.recipes.map((r) => [r.id, r.name])
    const save = (next: PlacedDough[]) => {
      if (!plan) return
      plan = { ...plan, doughs: next }
      void store.savePlan(plan)
    }
    const addDough = (recipeId: string) => {
      if (!plan) return
      save([...plan.doughs, { id: uid('dough'), recipeId, x: 0, z: 0, rotation: 0 }])
    }
    const autoFill = () => {
      if (!plan) return
      const tray = state.trays.find((t) => t.id === plan!.trayId)
      if (!tray) return
      const doughs = arrange(tray, state.recipes, { gap: gapValue, margin, rotation: 0, mode: gapMode })
      save(doughs)
    }
    return h('div', { class: 'panel panel-side' },
      h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, '摆盘编辑')),
      h('div', { class: 'panel-body' },
        field('方案名', h('input', {
          class: 'input', value: plan?.name ?? '',
          onInput: (e: Event) => { if (plan) { plan = { ...plan, name: (e.target as HTMLInputElement).value } } },
        })),
        h('div', { class: 'section-title' }, '添加面团'),
        field('选择配方', selectInput(state.selectedRecipeId, recipeOptions, (id) => store.select('recipe', id))),
        button('放一个到盘中心', 'ghost', () => addDough(store.state.selectedRecipeId)),
        h('div', { class: 'section-title' }, '自动排满'),
        field('排布方式', selectInput(gapMode, [['grid', '行列对齐'], ['stagger', '错位梅花']], (v) => { gapMode = v })),
        field('相邻净间距 mm', numInput(gapValue, 1, 0, 80, (v) => { gapValue = v })),
        field('距挡边内缩 mm', numInput(margin, 1, 0, 80, (v) => { margin = v })),
        button('自动排满整盘', 'primary', autoFill),
        h('div', { class: 'section-title' }, '选中面团'),
        selectedPanel(),
        h('div', { class: 'section-title' }, '方案'),
        h('div', { class: 'btn-row' },
          button('保存方案', 'primary', () => { if (plan) void store.savePlan(plan) }),
          button('复制为新方案', 'ghost', () => {
            if (!plan) return
            const copy = { ...plan, id: uid('plan'), name: `${plan.name} 副本`, doughs: plan.doughs.map((d) => ({ ...d, id: uid('dough') })) }
            void store.savePlan(copy)
          }),
          button('清空', 'danger', () => save([])),
        ),
      ),
    )
  }

  function selectedPanel(): HTMLElement {
    const d = plan?.doughs.find((x) => x.id === selectedId)
    if (!d) return h('p', { class: 'field-hint' }, '在视口里点选面团，可精调坐标与朝向。')
    const patch = (p: Partial<PlacedDough>) => {
      if (!plan) return
      const doughs = plan.doughs.map((x) => (x.id === d.id ? { ...x, ...p } : x))
      plan = { ...plan, doughs }
      void store.savePlan(plan)
    }
    return h('div', {},
      field('x 坐标 mm', numInput(d.x, 1, -1000, 1000, (v) => patch({ x: v }))),
      field('z 坐标 mm', numInput(d.z, 1, -1000, 1000, (v) => patch({ z: v }))),
      field('朝向 °', numInput(d.rotation, 1, -180, 180, (v) => patch({ rotation: v }))),
      button('删除该面团', 'danger', () => {
        if (!plan) return
        selectedId = null
        void store.savePlan({ ...plan, doughs: plan.doughs.filter((x) => x.id !== d.id) })
      }),
    )
  }

  function buildView(state: AppState, trayId: string): HTMLElement {
    const tray = state.trays.find((t) => t.id === trayId)!
    viewport = createViewport()
    const gapBadge = badge('最小间隙：计算中', 'neutral') as HTMLElement
    const rimBadge = badge('挡边：计算中', 'neutral') as HTMLElement
    const countBadge = badge(`${plan?.doughs.length ?? 0} 个面团`, 'neutral') as HTMLElement
    const wrap = h('div', { class: 'panel panel-wide' },
      h('div', { class: 'panel-head' },
        h('h2', { class: 'panel-title' }, '盘面 3D 视图（拖动调整，右键旋转视角）'),
        h('div', { class: 'btn-row' }, gapBadge, rimBadge, countBadge),
      ),
      h('div', { style: 'flex:1;min-height:0;padding:16px;display:flex' }, viewport.root),
    )
    disposers.push(() => viewport?.dispose())
    bindPick(viewport, gapBadge, rimBadge)
    void tray
    return wrap
  }

  // 实时间隙：对当前初始（未膨胀）面团两两扫描
  function updateScene(): void {
    if (!viewport || !plan) return
    const state = store.state
    const tray = state.trays.find((t) => t.id === plan!.trayId)
    if (!tray) return
    const engine = new SimEngine()
    engine.load(state.recipes, tray, plan, state.settings.gridCell)
    const frame = engine.buildFrame(0)
    viewport.setScene(frameToScene(frame, tray, engine.recipes))
    requestAnimationFrame(() => updateHud(frame))
  }

  function updateHud(frame: ReturnType<SimEngine['buildFrame']>): void {
    const badges = container.querySelectorAll('.badge')
    if (badges.length < 3) return
    const [gapBadge, rimBadge, countBadge] = badges as unknown as HTMLElement[]
    countBadge.textContent = `${frame.instances.length} 个面团`
    let minGap = Infinity
    let pair = ''
    for (let i = 0; i < frame.instances.length; i++) {
      for (let j = i + 1; j < frame.instances.length; j++) {
        const r = gapBetween(doughObject(frame.instances[i]), doughObject(frame.instances[j]), 4)
        if (r.gap < minGap) { minGap = r.gap; pair = `${frame.instances[i].id}|${frame.instances[j].id}` }
      }
    }
    void pair
    if (!Number.isFinite(minGap)) {
      gapBadge.textContent = '最小间隙：—'
      gapBadge.className = 'badge badge-neutral'
    } else {
      gapBadge.textContent = `最小相邻间隙 ${minGap.toFixed(1)}mm`
      gapBadge.className = `badge ${minGap < 2 ? 'badge-danger' : 'badge-warning'}`
    }
    const tray = store.state.trays.find((t) => t.id === plan?.trayId)
    if (tray && tray.rimHeight > 0) {
      let rimMin = Infinity
      for (const d of frame.instances) {
        const hx = tray.width / 2
        const hz = tray.depth / 2
        const side = Math.min(hx - Math.abs(d.pos[0]), hz - Math.abs(d.pos[2]))
        rimMin = Math.min(rimMin, side - footprint(d))
      }
      rimBadge.textContent = Number.isFinite(rimMin) ? `距挡边 ${rimMin.toFixed(1)}mm` : '挡边：—'
      rimBadge.className = `badge ${rimMin < 2 ? 'badge-danger' : 'badge-success'}`
    } else {
      rimBadge.textContent = '无挡边（网带）'
      rimBadge.className = 'badge badge-neutral'
    }
  }

  function footprint(d: ReturnType<SimEngine['buildFrame']>['instances'][number]): number {
    const t = d.tpl
    return Math.max(Math.abs(t.min[0]), Math.abs(t.max[0]), Math.abs(t.min[2]), Math.abs(t.max[2])) * d.r0
  }

  // 点选 + 拖拽：射线与 y=0 平面求交
  function bindPick(vp: Viewport, gapBadge: HTMLElement, rimBadge: HTMLElement): void {
    const canvas = vp.canvas
    let draggingId: string | null = null
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || !plan) return
      const hit = pickDough(vp, e)
      if (hit) {
        selectedId = hit
        draggingId = hit
        canvas.setPointerCapture(e.pointerId)
        render(store.state)
      } else {
        selectedId = null
      }
    }
    const move = (e: PointerEvent) => {
      if (!draggingId || !plan) return
      const p = rayToPlane(vp, e)
      if (!p) return
      const doughs = plan.doughs.map((d) => (d.id === draggingId ? { ...d, x: Number(p[0].toFixed(1)), z: Number(p[2].toFixed(1)) } : d))
      plan = { ...plan, doughs }
      void store.savePlan(plan)
      void gapBadge; void rimBadge
    }
    const up = () => { draggingId = null }
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    disposers.push(() => {
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
    })
  }

  function rayToPlane(vp: Viewport, e: PointerEvent): [number, number, number] | null {
    const rect = vp.canvas.getBoundingClientRect()
    const uvx = ((e.clientX - rect.left) / rect.width) * 2 - 1
    const uvy = 1 - ((e.clientY - rect.top) / rect.height) * 2
    const { pos, rot } = viewMatrix(vp.cam)
    const aspect = rect.width / rect.height
    const fov = vp.cam.fov
    const dx = uvx * Math.tan(fov / 2) * aspect
    const dy = uvy * Math.tan(fov / 2)
    const rd: [number, number, number] = [
      rot[0] * dx + rot[3] * dy - rot[6],
      rot[1] * dx + rot[4] * dy - rot[7],
      rot[2] * dx + rot[5] * dy - rot[8],
    ]
    if (Math.abs(rd[1]) < 1e-6) return null
    const t = -pos[1] / rd[1]
    if (t < 0) return null
    return [pos[0] + rd[0] * t, 0, pos[2] + rd[2] * t]
  }

  function pickDough(vp: Viewport, e: PointerEvent): string | null {
    const p = rayToPlane(vp, e)
    if (!p || !plan) return null
    let best: string | null = null
    let bestD = Infinity
    const state = store.state
    for (const pd of plan.doughs) {
      const recipe = state.recipes.find((r) => r.id === pd.recipeId)
      if (!recipe) continue
      const inst = makeInstance(pd.id, recipe, getTemplate(recipe), pd.x, pd.z, pd.rotation)
      const r = footprint(inst)
      const dx = p[0] - pd.x
      const dz = p[2] - pd.z
      const d = Math.hypot(dx, dz) - r
      if (d < bestD) { bestD = d; best = pd.id }
    }
    return bestD < 4 ? best : null
  }

  unsub = store.sub(render)
  return () => { unsub(); disposers.forEach((d) => d()); viewport?.dispose() }
}
