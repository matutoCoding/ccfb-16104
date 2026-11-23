// 出炉检查：逐团尺寸测量、合格品判定、整盘良率
import type { ContactEvent } from '../types'
import { doughBounds, doughFieldPlain, type DoughInstance } from './instance'
import { initialRadius } from './growth'
import type { Recipe } from '../types'
import type { PairStatus } from './engine'
import type { Vec3 } from './vec3'

export interface DoughMeasure {
  id: string
  length: number // 长轴
  width: number // 短轴
  height: number
  volMm3: number
  contactIds: string[]
  rimOver: boolean
  pass: boolean
}

export interface InspectionReport {
  measures: DoughMeasure[]
  total: number
  passed: number
  yieldRate: number
  contacts: number
  rimOvers: number
}

// 体素化测量单团：尺寸取场负区的包围盒，体积按体素计数
export function measureDough(d: DoughInstance, cell = 2): { length: number; width: number; height: number; volMm3: number } {
  const b = doughBounds(d)
  const lo = b.min
  const hi = b.max
  const nx = Math.max(2, Math.ceil((hi[0] - lo[0]) / cell))
  const ny = Math.max(2, Math.ceil((hi[1] - lo[1]) / cell))
  const nz = Math.max(2, Math.ceil((hi[2] - lo[2]) / cell))
  const ext: Vec3 = [Infinity, Infinity, Infinity]
  const extMax: Vec3 = [-Infinity, -Infinity, -Infinity]
  let count = 0
  for (let i = 0; i <= nx; i++) {
    const x = lo[0] + ((hi[0] - lo[0]) * i) / nx
    for (let j = 0; j <= ny; j++) {
      const y = lo[1] + ((hi[1] - lo[1]) * j) / ny
      for (let k = 0; k <= nz; k++) {
        const z = lo[2] + ((hi[2] - lo[2]) * k) / nz
        if (doughFieldPlain(d, [x, y, z]) < 0) {
          count++
          ext[0] = Math.min(ext[0], x); extMax[0] = Math.max(extMax[0], x)
          ext[1] = Math.min(ext[1], y); extMax[1] = Math.max(extMax[1], y)
          ext[2] = Math.min(ext[2], z); extMax[2] = Math.max(extMax[2], z)
        }
      }
    }
  }
  if (!Number.isFinite(ext[0])) return { length: 0, width: 0, height: 0, volMm3: 0 }
  const dimX = extMax[0] - ext[0]
  const dimY = extMax[1] - ext[1]
  const dimZ = extMax[2] - ext[2]
  return {
    length: Math.max(dimX, dimZ),
    width: Math.min(dimX, dimZ),
    height: dimY,
    volMm3: count * cell * cell * cell,
  }
}

export function inspect(
  instances: DoughInstance[],
  recipes: Map<string, Recipe>,
  finalPairs: PairStatus[],
  events: ContactEvent[],
  cell = 2,
): InspectionReport {
  const contactMap = new Map<string, Set<string>>()
  let rimOvers = 0
  for (const e of events) {
    if (e.bId === '__rim__') {
      rimOvers++
      const set = contactMap.get(e.aId) ?? new Set<string>()
      set.add('__rim__')
      contactMap.set(e.aId, set)
      continue
    }
    for (const id of [e.aId, e.bId]) {
      const set = contactMap.get(id) ?? new Set<string>()
      set.add(id === e.aId ? e.bId : e.aId)
      contactMap.set(id, set)
    }
  }
  void finalPairs

  const measures: DoughMeasure[] = instances.map((d) => {
    const recipe = recipes.get(d.recipeId)
    const m = measureDough(d, cell)
    const contactIds = [...(contactMap.get(d.id) ?? [])]
    const rimOver = contactIds.includes('__rim__')
    // 合格：无粘连、未越挡边、尺寸偏差在 ±15% 目标内
    const targetR = initialRadius(recipe?.doughWeight ?? 50)
    const targetH = targetR * 2 * d.rV
    const sizeDev = Math.abs(m.height - targetH) / Math.max(targetH, 1)
    const pass = contactIds.filter((c) => c !== '__rim__').length === 0 && !rimOver && sizeDev <= 0.15
    return { id: d.id, ...m, contactIds, rimOver, pass }
  })
  const passed = measures.filter((m) => m.pass).length
  return {
    measures,
    total: measures.length,
    passed,
    yieldRate: measures.length ? passed / measures.length : 0,
    contacts: events.filter((e) => e.bId !== '__rim__').length,
    rimOvers,
  }
}
