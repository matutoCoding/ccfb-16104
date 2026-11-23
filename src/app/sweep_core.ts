// 容量试摆核心逻辑（与 Worker 同构，可在 Node 直接测试）
import type { LayoutPlan, Recipe, Tray } from '../types'
import { SimEngine } from '../sim/engine'
import { arrange } from '../sim/layout_solver'
import { doughObject, gapBetween, rimObjects } from '../sim/contact'

export interface SweepOptions {
  gaps: number[]
  margins: number[]
  cell: number
}

export interface SweepRow {
  mode: 'grid' | 'stagger'
  gap: number
  margin: number
  count: number
  contact: boolean
  minCertifiedGap: number
}

// 评估单个摆法：醒发末态的粘连证书
export function evaluateArrangement(
  recipes: Recipe[],
  tray: Tray,
  mode: 'grid' | 'stagger',
  gap: number,
  margin: number,
  cell: number,
): SweepRow {
  const doughs = arrange(tray, recipes, { gap, margin, rotation: 0, mode })
  const plan: LayoutPlan = { id: `s_${mode}_${gap}_${margin}`, name: '试摆', updatedAt: 0, trayId: tray.id, doughs }
  const engine = new SimEngine()
  engine.load(recipes, tray, plan, cell)
  const frame = engine.buildFrame(engine.proofDuration)
  let contact = false
  let minGap = Infinity
  for (let i = 0; i < frame.instances.length; i++) {
    for (let j = i + 1; j < frame.instances.length; j++) {
      const r = gapBetween(doughObject(frame.instances[i]), doughObject(frame.instances[j]), cell)
      minGap = Math.min(minGap, r.certifiedGap)
      if (r.contact) contact = true
    }
    for (const wall of rimObjects(tray)) {
      const r = gapBetween(doughObject(frame.instances[i]), wall, cell)
      minGap = Math.min(minGap, r.certifiedGap)
      if (r.contact) contact = true
    }
  }
  return {
    mode, gap, margin, count: doughs.length, contact,
    minCertifiedGap: Number.isFinite(minGap) ? minGap : 999,
  }
}

export function runSweep(recipes: Recipe[], tray: Tray, opts: SweepOptions): { rows: SweepRow[]; best: SweepRow | null } {
  const rows: SweepRow[] = []
  for (const mode of ['grid', 'stagger'] as const) {
    for (const gap of opts.gaps) {
      for (const margin of opts.margins) {
        rows.push(evaluateArrangement(recipes, tray, mode, gap, margin, opts.cell))
      }
    }
  }
  const safe = rows.filter((r) => !r.contact)
  const best = safe.sort((a, b) => b.count - a.count)[0] ?? null
  return { rows, best }
}
