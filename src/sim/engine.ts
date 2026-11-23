// 时间轴模拟引擎：按时间点构建面团实例、全量粘连扫描、粘连时刻二分
import type { ContactEvent, LayoutPlan, Recipe, Tray } from '../types'
import { buildTemplate, type ShapeTemplate } from './metaball'
import { growthAt } from './growth'
import { makeInstance, type DoughInstance } from './instance'
import { doughObject, gapBetween, rimObjects, type FieldObject, type GapResult } from './contact'

export interface SimFrame {
  phase: 'proof' | 'bake'
  phaseTime: number
  totalTime: number
  instances: DoughInstance[]
}

export interface PairStatus {
  aId: string
  bId: string
  result: GapResult
}

const templateCache = new Map<string, ShapeTemplate>()

export function getTemplate(recipe: Recipe): ShapeTemplate {
  const key = `${recipe.shape}:${recipe.ballCount}`
  let tpl = templateCache.get(key)
  if (!tpl) {
    tpl = buildTemplate(recipe.shape, recipe.ballCount)
    templateCache.set(key, tpl)
  }
  return tpl
}

export class SimEngine {
  recipes = new Map<string, Recipe>()
  tray: Tray | null = null
  plan: LayoutPlan | null = null
  cell = 2

  load(recipes: Recipe[], tray: Tray, plan: LayoutPlan, cell: number): void {
    this.recipes.clear()
    for (const r of recipes) this.recipes.set(r.id, r)
    this.tray = tray
    this.plan = plan
    this.cell = cell
  }

  get proofDuration(): number {
    return Math.max(...[...this.recipes.values()].map((r) => r.proof.duration))
  }

  get bakeDuration(): number {
    return Math.max(...[...this.recipes.values()].map((r) => r.bake.duration))
  }

  // 全局时间 -> 阶段；各面团按自己配方的时长映射阶段内时间
  phaseAt(totalTime: number): { phase: 'proof' | 'bake'; phaseTime: number } {
    const pd = this.proofDuration
    return totalTime <= pd
      ? { phase: 'proof', phaseTime: totalTime }
      : { phase: 'bake', phaseTime: totalTime - pd }
  }

  // 单个面团在全局时刻下的阶段与阶段内时间（按自身配方时长归一化）
  private doughPhase(recipe: Recipe, totalTime: number): { phase: 'proof' | 'bake'; phaseTime: number } {
    const pd = this.proofDuration
    if (totalTime <= pd) {
      return { phase: 'proof', phaseTime: Math.min(totalTime, recipe.proof.duration) }
    }
    const bakeU = Math.min(1, (totalTime - pd) / this.bakeDuration)
    return { phase: 'bake', phaseTime: bakeU * recipe.bake.duration }
  }

  buildFrame(totalTime: number): SimFrame {
    const { phase, phaseTime } = this.phaseAt(totalTime)
    const instances: DoughInstance[] = []
    for (const pd of this.plan?.doughs ?? []) {
      const recipe = this.recipes.get(pd.recipeId)
      if (!recipe) continue
      const dp = this.doughPhase(recipe, totalTime)
      const g = growthAt(recipe, dp.phase, dp.phaseTime)
      instances.push(
        makeInstance(pd.id, recipe, getTemplate(recipe), pd.x, pd.z, pd.rotation, g.rH, g.rV, dp.phaseTime),
      )
    }
    return { phase, phaseTime, totalTime, instances }
  }

  // 某一时刻全部配对的间隙状态
  scanFrame(frame: SimFrame, includeRim = true): PairStatus[] {
    const objs = new Map<string, FieldObject>()
    for (const d of frame.instances) objs.set(d.id, doughObject(d))
    const out: PairStatus[] = []
    const list = frame.instances
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const result = gapBetween(objs.get(list[i].id)!, objs.get(list[j].id)!, this.cell)
        out.push({ aId: list[i].id, bId: list[j].id, result })
      }
    }
    if (includeRim && this.tray && this.tray.rimHeight > 0) {
      for (const wall of rimObjects(this.tray)) {
        for (const d of list) {
          const result = gapBetween(objs.get(d.id)!, wall, this.cell)
          out.push({ aId: d.id, bId: '__rim__', result })
        }
      }
    }
    return out
  }
}

// 二分定位粘连开始时刻：给定一个已粘连配对，在 [lo, hi] 内找首次接触
export function findContactTime(
  engine: SimEngine,
  aId: string,
  bId: string,
  lo: number,
  hi: number,
  cell: number,
): number {
  let l = lo
  let h = hi
  for (let i = 0; i < 10; i++) {
    const mid = (l + h) / 2
    const frame = engine.buildFrame(mid)
    const a = frame.instances.find((d) => d.id === aId)
    if (!a) return h
    if (bId === '__rim__') {
      // 对四面墙取最早接触
      let contact = false
      for (const wall of rimObjects(engine.tray!)) {
        const r = gapBetween(doughObject(a), wall, cell)
        if (r.contact) { contact = true; break }
      }
      if (contact) h = mid
      else l = mid
    } else {
      const b = frame.instances.find((d) => d.id === bId)
      if (!b) return h
      const r = gapBetween(doughObject(a), doughObject(b), cell)
      if (r.contact) h = mid
      else l = mid
    }
  }
  return h
}

// 全时间轴事件扫描：按时间步进，配对首次粘连时二分精确时刻
export function runTimeline(
  engine: SimEngine,
  steps: number,
  onProgress?: (u: number) => void,
): { events: ContactEvent[]; finalPairs: PairStatus[] } {
  const total = engine.proofDuration + engine.bakeDuration
  const events: ContactEvent[] = []
  const contacted = new Set<string>()
  let finalPairs: PairStatus[] = []
  for (let s = 0; s <= steps; s++) {
    const t = (total * s) / steps
    const frame = engine.buildFrame(t)
    const pairs = engine.scanFrame(frame)
    finalPairs = pairs
    for (const ps of pairs) {
      const key = `${ps.aId}|${ps.bId}`
      if (ps.result.contact && !contacted.has(key)) {
        contacted.add(key)
        const prevT = (total * Math.max(0, s - 1)) / steps
        const ct = findContactTime(engine, ps.aId, ps.bId, prevT, t, engine.cell)
        const { phase } = engine.phaseAt(ct)
        events.push({
          time: ct,
          phase,
          aId: ps.aId,
          bId: ps.bId,
          point: ps.result.point,
          gap: ps.result.gap,
        })
      }
    }
    onProgress?.(s / steps)
  }
  events.sort((a, b) => a.time - b.time)
  return { events, finalPairs }
}
