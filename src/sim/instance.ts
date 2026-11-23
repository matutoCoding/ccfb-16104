// 面团实例：摆盘位姿 + 当前生长状态，世界空间隐式场求值
import type { Recipe, ScoreCut } from '../types'
import { rotY, type Vec3 } from './vec3'
import { roundBoxSdf, smin, templateField, type ShapeTemplate } from './metaball'
import { cutOpenFactor, initialRadius } from './growth'

export interface CutLocal {
  center: Vec3 // 本地模板空间（r0=1）
  half: Vec3 // 半尺寸
  angle: number
  depth: number
}

export interface DoughInstance {
  id: string
  recipeId: string
  tpl: ShapeTemplate
  r0: number // 初始等效半径 mm
  pos: Vec3 // 盘上中心 [x, 0, z]
  rotRad: number
  rH: number // 当前水平缩放倍数
  rV: number // 当前垂直缩放倍数
  cuts: CutLocal[]
  hydration: number
  bakeTime: number // 当前烘烤时间（决定刀口张开）
  bakeDuration: number
}

// 配方刀口（mm，相对初始面团中心）转本地模板坐标
export function toLocalCuts(recipe: Recipe, r0: number): CutLocal[] {
  return recipe.cuts.map((c: ScoreCut) => ({
    center: [c.cx / r0, 1.0, c.cz / r0],
    half: [0.07, 0.5 + c.depth * 0.85, c.length / r0 / 2],
    angle: (c.angle * Math.PI) / 180,
    depth: c.depth,
  }))
}

export function makeInstance(
  id: string,
  recipe: Recipe,
  tpl: ShapeTemplate,
  x: number,
  z: number,
  rotDeg: number,
  rH = 1,
  rV = 1,
  bakeTime = 0,
): DoughInstance {
  const r0 = initialRadius(recipe.doughWeight)
  return {
    id,
    recipeId: recipe.id,
    tpl,
    r0,
    pos: [x, 0, z],
    rotRad: (rotDeg * Math.PI) / 180,
    rH,
    rV,
    cuts: toLocalCuts(recipe, r0),
    hydration: recipe.hydration,
    bakeTime,
    bakeDuration: recipe.bake.duration,
  }
}

// 世界坐标 -> 模板本地坐标
export function toLocal(d: DoughInstance, p: Vec3): Vec3 {
  const dx = p[0] - d.pos[0]
  const dy = p[1] - d.pos[1]
  const dz = p[2] - d.pos[2]
  const q = rotY([dx, dy, dz], -d.rotRad)
  return [q[0] / (d.r0 * d.rH), q[1] / (d.r0 * d.rV), q[2] / (d.r0 * d.rH)]
}

// 单个割口在本地空间的场（<0 表示在刀槽内）
function cutFieldAt(cut: CutLocal, local: Vec3, open: number): number {
  const q = rotY(
    [local[0] - cut.center[0], local[1] - cut.center[1], local[2] - cut.center[2]],
    -cut.angle,
  )
  const half: Vec3 = [cut.half[0] * open, cut.half[1] * (1.1 - 0.3 * open), cut.half[2]]
  return roundBoxSdf(q, half, half[0] * 0.6)
}

export interface FieldResult {
  f: number
  cut: boolean // 命中刀口内壁
}

// 面团完整场（世界毫米）：元球 ∩ 地面(贴盘) − 割口槽
export function doughField(d: DoughInstance, world: Vec3): FieldResult {
  const local = toLocal(d, world)
  let f = templateField(d.tpl, local)
  // 贴盘：地面以下的部分被削掉
  f = Math.max(f, -local[1])
  const open = cutOpenFactor(d.bakeTime, d.bakeDuration)
  let inCut = false
  for (const cut of d.cuts) {
    const g = cutFieldAt(cut, local, open)
    if (g < 0) inCut = true
    f = Math.max(f, -g)
  }
  // 本地距离 → 世界毫米，乘最小缩放保证 1-Lipschitz
  const sMin = d.r0 * Math.min(d.rH, d.rV)
  return { f: f * sMin, cut: inCut && f < 0 }
}

// 不考虑割口的世界毫米场，粘连分析用
export function doughFieldPlain(d: DoughInstance, world: Vec3): number {
  const local = toLocal(d, world)
  const f = Math.max(templateField(d.tpl, local), -local[1])
  return f * d.r0 * Math.min(d.rH, d.rV)
}

// 当前世界空间包围盒（含生长，保守外扩）
export function doughBounds(d: DoughInstance): { min: Vec3; max: Vec3 } {
  const sx = d.r0 * d.rH
  const sy = d.r0 * d.rV
  const t = d.tpl
  const corners: Vec3[] = []
  for (const lx of [t.min[0], t.max[0]]) {
    for (const ly of [0, t.max[1]]) {
      for (const lz of [t.min[2], t.max[2]]) {
        const w = rotY([lx * sx, ly * sy, lz * sx], d.rotRad)
        corners.push([w[0] + d.pos[0], w[1] + d.pos[1], w[2] + d.pos[2]])
      }
    }
  }
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const c of corners) {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], c[i])
      max[i] = Math.max(max[i], c[i])
    }
  }
  return { min, max }
}

// 渲染用：跨面团光滑融合（世界空间 k mm）
export function sceneField(list: DoughInstance[], p: Vec3, mergeK: number): number {
  let f = Infinity
  for (const d of list) f = smin(f, doughField(d, p).f, mergeK)
  return f
}

// 数值法向（中心差分）
export function fieldNormal(evalF: (p: Vec3) => number, p: Vec3, eps = 0.35): Vec3 {
  const n: Vec3 = [
    evalF([p[0] + eps, p[1], p[2]]) - evalF([p[0] - eps, p[1], p[2]]),
    evalF([p[0], p[1] + eps, p[2]]) - evalF([p[0], p[1] - eps, p[2]]),
    evalF([p[0], p[1], p[2] + eps]) - evalF([p[0], p[1], p[2] - eps]),
  ]
  const l = Math.hypot(n[0], n[1], n[2]) || 1
  return [n[0] / l, n[1] / l, n[2] / l]
}
