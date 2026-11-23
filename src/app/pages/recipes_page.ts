// 产品配方页：列表 + 配方编辑（含膨胀曲线、割口）
import { store } from '../store'
import { badge, button, clear, emptyState, field, h, numInput, selectInput, textInput } from '../dom'
import { blankCut, blankRecipe, defaultBallCount, SHAPE_LABELS } from '../factories'
import type { AppState } from '../store'
import type { CurvePoint, Recipe, ShapeKind } from '../../types'

export function recipesPage(container: HTMLElement): () => void {
  let local: Recipe | null = null
  let unsub = () => {}

  function render(state: AppState): void {
    if (!local || !state.recipes.some((r) => r.id === local!.id)) {
      local = state.recipes.find((r) => r.id === state.selectedRecipeId) ? structuredClone(state.recipes.find((r) => r.id === state.selectedRecipeId)!) : null
    }
    clear(container)
    container.append(buildList(state), local ? buildEditor(local) : emptyState('还没有配方', '点左上角「新建配方」开始，系统已预置小餐包、夏巴塔和编辫面包。'))
  }

  function buildList(state: AppState): HTMLElement {
    const panel = h('div', { class: 'panel panel-side' },
      h('div', { class: 'panel-head' },
        h('h2', { class: 'panel-title' }, '产品配方'),
        button('新建', 'primary', () => {
          const r = blankRecipe()
          local = r
          render(store.state)
        }),
      ),
      h('div', { class: 'panel-body' },
        h('div', { class: 'list' }, ...state.recipes.map((r) =>
          h('button', {
            class: `list-item ${local?.id === r.id ? 'selected' : ''}`,
            onClick: () => { local = structuredClone(r); render(state) },
          },
            h('div', { class: 'list-item-title' }, r.name),
            h('div', { class: 'list-item-sub' }, `${r.doughWeight}g · 含水 ${Math.round(r.hydration * 100)}% · ${SHAPE_LABELS.find(([k]) => k === r.shape)?.[1]}`),
          ),
        )),
      ),
    )
    return panel
  }

  function buildEditor(r: Recipe): HTMLElement {
    const refresh = () => render(store.state)
    const update = (patch: Partial<Recipe>) => {
      local = { ...r, ...patch }
      refresh()
    }

    const curveEditor = (kind: 'proof' | 'bake') => {
      const envFields = kind === 'proof'
        ? h('div', { class: 'btn-row', style: 'margin-bottom:16px' },
            field('温度 ℃', numInput(r.proof.temp, 1, 0, 60, (v) => update({ proof: { ...r.proof, temp: v } }))),
            field('湿度', numInput(r.proof.humidity, 0.05, 0, 1, (v) => update({ proof: { ...r.proof, humidity: v } }))),
          )
        : h('div', { class: 'btn-row', style: 'margin-bottom:16px' },
            field('炉温 ℃', numInput(r.bake.temp, 5, 100, 300, (v) => update({ bake: { ...r.bake, temp: v } }))),
            field('面火系数', numInput(r.bake.topHeat, 0.05, 0.5, 1.5, (v) => update({ bake: { ...r.bake, topHeat: v } }))),
            field('底火系数', numInput(r.bake.bottomHeat, 0.05, 0.5, 1.5, (v) => update({ bake: { ...r.bake, bottomHeat: v } }))),
          )
      const setPoint = (i: number, patch: Partial<CurvePoint>) => {
        const points = r[kind].points.map((p, j) => (j === i ? { ...p, ...patch } : p))
        update({ [kind]: { ...r[kind], points } } as Partial<Recipe>)
      }
      return h('div', {},
        h('div', { class: 'section-title' }, kind === 'proof' ? '醒发膨胀曲线' : '烘烤膨胀曲线'),
        field('时长（分钟）', numInput(r[kind].duration / 60, 1, 1, 300, (v) => update({ [kind]: { ...r[kind], duration: v * 60 } } as Partial<Recipe>))),
        envFields,
        h('table', { class: 'data' },
          h('thead', {}, h('tr', {}, h('th', {}, '时间(分)'), h('th', {}, '体积倍数'))),
          h('tbody', {}, ...r[kind].points.map((p, i) =>
            h('tr', {},
              h('td', {}, String((p.t / 60).toFixed(1))),
              h('td', {}, String(p.v.toFixed(2))),
              h('td', {}, h('input', {
                class: 'input', type: 'number', step: 0.1, min: 0, value: p.t / 60,
                onInput: (e: Event) => setPoint(i, { t: Number((e.target as HTMLInputElement).value) * 60 }),
              })),
              h('td', {}, h('input', {
                class: 'input', type: 'number', step: 0.05, min: 1, value: p.v,
                onInput: (e: Event) => setPoint(i, { v: Number((e.target as HTMLInputElement).value) }),
              })),
            ),
          )),
        ),
      )
    }

    const cutsEditor = h('div', {},
      h('div', { class: 'section-title' }, '割包刀口（摆盘时可见，烘烤时裂开）'),
      ...r.cuts.map((c, i) =>
        h('div', { class: 'btn-row', style: 'align-items:end;margin-bottom:12px' },
          field('长度 mm', numInput(c.length, 1, 5, 200, (v) => updateCut(i, { length: v }))),
          field('角度 °', numInput(c.angle, 1, -90, 90, (v) => updateCut(i, { angle: v }))),
          field('刀深比例', numInput(c.depth, 0.05, 0.1, 0.6, (v) => updateCut(i, { depth: v }))),
          button('删除', 'danger', () => update({ cuts: r.cuts.filter((_, j) => j !== i) })),
        ),
      ),
      button('加一条刀口', 'ghost', () => update({ cuts: [...r.cuts, blankCut()] })),
    )
    const updateCut = (i: number, patch: Partial<Recipe['cuts'][number]>) => {
      update({ cuts: r.cuts.map((c, j) => (j === i ? { ...c, ...patch } : c)) })
    }

    return h('div', { class: 'panel panel-wide' },
      h('div', { class: 'panel-head' },
        h('h2', { class: 'panel-title' }, '配方编辑'),
        h('div', { class: 'btn-row' },
          badge(`${r.cuts.length} 条刀口`, r.cuts.length ? 'warning' : 'neutral'),
          button('保存配方', 'primary', () => store.saveRecipe(r)),
          button('删除', 'danger', () => { if (confirm(`删除配方「${r.name}」？`)) { local = null; store.deleteRecipe(r.id) } }),
        ),
      ),
      h('div', { class: 'panel-body' },
        field('名称', textInput(r.name, (v) => update({ name: v }))),
        h('div', { class: 'btn-row' },
          field('面团克重 g', numInput(r.doughWeight, 1, 5, 2000, (v) => update({ doughWeight: v }))),
          field('含水量', numInput(r.hydration, 0.01, 0.4, 0.95, (v) => update({ hydration: v }))),
          field('酵母量 %', numInput(r.yeast, 0.1, 0.3, 4, (v) => update({ yeast: v }))),
        ),
        h('div', { class: 'btn-row' },
          field('整形方式', selectInput<ShapeKind>(r.shape, SHAPE_LABELS, (v) => update({ shape: v, ballCount: defaultBallCount(v) }))),
          field('元球数量', numInput(r.ballCount, 1, 1, 30, (v) => update({ ballCount: Math.round(v) }))),
        ),
        curveEditor('proof'),
        curveEditor('bake'),
        cutsEditor,
      ),
    )
  }

  unsub = store.sub(render)
  return () => unsub()
}
