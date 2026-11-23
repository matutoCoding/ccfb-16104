// 容量试摆 Worker：浏览器侧复用 sweep_core，最优行重建为可保存方案
import { evaluateArrangement } from './sweep_core'
import { arrange } from '../sim/layout_solver'
import { uid } from '../db/idb'
import type { LayoutPlan, Recipe, Tray } from '../types'

export interface SweepRequest {
  recipes: Recipe[]
  tray: Tray
  gaps: number[]
  margins: number[]
  cell: number
}

export interface SweepResult {
  rows: ReturnType<typeof evaluateArrangement>[]
  best: ReturnType<typeof evaluateArrangement> | null
  bestPlan: LayoutPlan | null
}

self.onmessage = (ev: MessageEvent<SweepRequest>): void => {
  const req = ev.data
  const rows: SweepResult['rows'] = []
  for (const mode of ['grid', 'stagger'] as const) {
    for (const gap of req.gaps) {
      for (const margin of req.margins) {
        rows.push(evaluateArrangement(req.recipes, req.tray, mode, gap, margin, req.cell))
      }
    }
  }
  const safe = rows.filter((r) => !r.contact)
  const best = safe.sort((a, b) => b.count - a.count)[0] ?? null
  let bestPlan: LayoutPlan | null = null
  if (best) {
    bestPlan = {
      id: uid('plan'),
      name: `最优摆法 ${best.mode === 'grid' ? '行列' : '梅花'} 间距${best.gap}mm`,
      updatedAt: Date.now(),
      trayId: req.tray.id,
      doughs: arrange(req.tray, req.recipes, {
        gap: best.gap, margin: best.margin, rotation: 0, mode: best.mode,
      }),
    }
  }
  const result: SweepResult = { rows, best, bestPlan }
  ;(self as unknown as Worker).postMessage({ type: 'done', result })
}
