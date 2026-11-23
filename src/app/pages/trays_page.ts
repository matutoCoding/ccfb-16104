// 盘型页：尺寸、挡边、法棍槽、网带
import { store, type AppState } from '../store'
import { button, clear, emptyState, field, h, numInput, selectInput, textInput } from '../dom'
import { blankTray, TRAY_LABELS } from '../factories'
import type { Tray, TrayKind } from '../../types'

export function traysPage(container: HTMLElement): () => void {
  let local: Tray | null = null
  let unsub = () => {}

  function render(state: AppState): void {
    if (!local || !state.trays.some((t) => t.id === local!.id)) {
      const cur = state.trays.find((t) => t.id === state.selectedTrayId)
      local = cur ? structuredClone(cur) : null
    }
    clear(container)
    container.append(buildList(state), local ? buildEditor(local) : emptyState('还没有盘型', '点「新建盘型」录入实际烤盘尺寸。'))
  }

  function buildList(state: AppState): HTMLElement {
    return h('div', { class: 'panel panel-side' },
      h('div', { class: 'panel-head' },
        h('h2', { class: 'panel-title' }, '盘型'),
        button('新建', 'primary', () => { local = blankTray(); render(store.state) }),
      ),
      h('div', { class: 'panel-body' },
        h('div', { class: 'list' }, ...state.trays.map((t) =>
          h('button', {
            class: `list-item ${local?.id === t.id ? 'selected' : ''}`,
            onClick: () => { local = structuredClone(t); render(state) },
          },
            h('div', { class: 'list-item-title' }, t.name),
            h('div', { class: 'list-item-sub' }, `${t.width}×${t.depth}mm · 挡边 ${t.rimHeight}mm`),
          ),
        )),
      ),
    )
  }

  function buildEditor(t: Tray): HTMLElement {
    const refresh = () => render(store.state)
    const update = (patch: Partial<Tray>) => { local = { ...t, ...patch }; refresh() }
    return h('div', { class: 'panel panel-wide' },
      h('div', { class: 'panel-head' },
        h('h2', { class: 'panel-title' }, '盘型编辑'),
        h('div', { class: 'btn-row' },
          button('保存盘型', 'primary', () => store.saveTray(t)),
          button('删除', 'danger', () => { if (confirm(`删除盘型「${t.name}」？`)) { local = null; store.deleteTray(t.id) } }),
        ),
      ),
      h('div', { class: 'panel-body' },
        field('名称', textInput(t.name, (v) => update({ name: v }))),
        field('类型', selectInput<TrayKind>(t.kind, TRAY_LABELS, (v) => update({ kind: v, rimHeight: v === 'belt' ? 0 : t.rimHeight }))),
        h('div', { class: 'btn-row' },
          field('内宽 mm（x）', numInput(t.width, 5, 100, 2000, (v) => update({ width: v }))),
          field('内深 mm（z）', numInput(t.depth, 5, 100, 2000, (v) => update({ depth: v }))),
          field('挡边高度 mm', numInput(t.rimHeight, 1, 0, 120, (v) => update({ rimHeight: v }))),
        ),
        t.kind === 'baguette'
          ? h('div', { class: 'btn-row' },
              field('槽数', numInput(t.slotCount, 1, 1, 12, (v) => update({ slotCount: Math.round(v) }))),
              field('槽间距 mm', numInput(t.slotPitch, 1, 40, 160, (v) => update({ slotPitch: v }))),
            )
          : h('p', { class: 'field-hint' }, t.kind === 'belt' ? '网带无挡边，挡边检查自动关闭。' : '平盘/网盘按整体挡边高度做越界检查。'),
      ),
    )
  }

  unsub = store.sub(render)
  return () => unsub()
}
