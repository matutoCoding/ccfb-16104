// 摆盘求解：行列网格、错位梅花排布；足迹估算
import type { PlacedDough, Recipe, Tray } from '../types'
import { uid } from '../db/idb'
import { growthAt, initialRadius } from './growth'
import { buildTemplate } from './metaball'

export interface ArrangeOptions {
  gap: number // 期望相邻净间距 mm（初始面团之间）
  margin: number // 距挡边内缩 mm
  rotation: number // 面团朝向 度
  mode: 'grid' | 'stagger'
}

// 初始水平足迹半径（保守取模板包围盒最大水平半宽 × r0）
export function footprintRadius(recipe: Recipe): number {
  const tpl = buildTemplate(recipe.shape, recipe.ballCount)
  const r0 = initialRadius(recipe.doughWeight)
  return Math.max(Math.abs(tpl.min[0]), Math.abs(tpl.max[0]), Math.abs(tpl.min[2]), Math.abs(tpl.max[2])) * r0
}

// 醒发末态足迹（用于摆法预检的保守估计）
export function grownFootprintRadius(recipe: Recipe): number {
  const g = growthAt(recipe, 'proof', recipe.proof.duration)
  return footprintRadius(recipe) * g.rH * 1.03
}

export function arrange(tray: Tray, recipes: Recipe[], opts: ArrangeOptions): PlacedDough[] {
  if (recipes.length === 0) return []
  const out: PlacedDough[] = []
  const halfW = tray.width / 2 - opts.margin
  const halfD = tray.depth / 2 - opts.margin
  const maxR0 = Math.max(...recipes.map((r) => footprintRadius(r)))
  let row = 0
  let z = -halfD + maxR0
  while (true) {
    // 每行用该行中最大的足迹
    const radii = recipes.map((r) => footprintRadius(r))
    const maxR = Math.max(...radii)
    if (z + maxR > halfD) break
    const offset = opts.mode === 'stagger' && row % 2 === 1 ? (opts.gap + maxR * 2) / 2 : 0
    let col = 0
    let x = -halfW + maxR0 + offset
    while (true) {
      const recipe = recipes[(row + col) % recipes.length]
      const r = footprintRadius(recipe)
      if (x + r > halfW) break
      out.push({
        id: uid('dough'),
        recipeId: recipe.id,
        x: Number(x.toFixed(2)),
        z: Number(z.toFixed(2)),
        rotation: opts.rotation,
      })
      x += r * 2 + opts.gap
      col++
    }
    z += maxR * 2 + (opts.mode === 'stagger' ? opts.gap * 0.866 : opts.gap)
    row++
  }
  return out
}

