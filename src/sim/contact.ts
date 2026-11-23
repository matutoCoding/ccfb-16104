// 粘连分析：带 Lipschitz 保证的体素间隙证书 + 数值细化
// 隐式场 f 是距离场（f<0 在面团内部）。两面团 g(p)=max(fA,fB)，
// g 的最小值即两面的间隙；<=0 即融合（场已连通，零水平集粘连）。
import type { Tray } from '../types'
import { doughBounds, doughFieldPlain, type DoughInstance } from './instance'
import type { Vec3 } from './vec3'

export interface FieldObject {
  f: (p: Vec3) => number
  min: Vec3
  max: Vec3
  lipschitz: number
}

export interface GapResult {
  contact: boolean
  // 保证间隙下界：真实最小间隙 >= certifiedGap。>0 即数学上不可能粘连
  certifiedGap: number
  // 数值细化后的估计间隙与最差点
  gap: number
  point: Vec3
}

function aabbOverlap(aMin: Vec3, aMax: Vec3, bMin: Vec3, bMax: Vec3, pad = 0): boolean {
  for (let i = 0; i < 3; i++) {
    if (aMax[i] + pad < bMin[i] || bMax[i] + pad < aMin[i]) return false
  }
  return true
}

function boxDistance(aMin: Vec3, aMax: Vec3, bMin: Vec3, bMax: Vec3): number {
  let d = 0
  for (let i = 0; i < 3; i++) {
    const gap = Math.max(bMin[i] - aMax[i], aMin[i] - bMax[i], 0)
    d += gap * gap
  }
  return Math.sqrt(d)
}

// 世界空间场已是 1-Lipschitz（本地场经最小缩放换算）
export function doughObject(d: DoughInstance): FieldObject {
  const b = doughBounds(d)
  return {
    f: (p) => doughFieldPlain(d, p),
    min: b.min,
    max: b.max,
    lipschitz: 1,
  }
}

// 挡墙壁垒：四面独立薄墙，挡边高度以下为实体
export function rimObjects(tray: Tray): FieldObject[] {
  if (tray.rimHeight <= 0) return []
  const hx = tray.width / 2
  const hz = tray.depth / 2
  const rim = tray.rimHeight
  const e = 2
  const wall = (min: Vec3, max: Vec3, pick: (p: Vec3) => number): FieldObject => ({ min, max, lipschitz: 1, f: pick })
  const fX = (sign: 1 | -1) => (p: Vec3) => Math.max(hx - sign * p[0], p[1] - rim)
  const fZ = (sign: 1 | -1) => (p: Vec3) => Math.max(hz - sign * p[2], p[1] - rim)
  return [
    wall([hx - e, 0, -hz - e], [hx + e, rim, hz + e], fX(1)),
    wall([-hx - e, 0, -hz - e], [-hx + e, rim, hz + e], fX(-1)),
    wall([-hx - e, 0, hz - e], [hx + e, rim, hz + e], fZ(1)),
    wall([-hx - e, 0, -hz - e], [hx + e, rim, -hz + e], fZ(-1)),
  ]
}

// 体素扫描 + 梯度下降细化，返回带证书的间隙结果
export function gapBetween(a: FieldObject, b: FieldObject, cell: number): GapResult {
  if (!aabbOverlap(a.min, a.max, b.min, b.max)) {
    const d = boxDistance(a.min, a.max, b.min, b.max)
    const mid: Vec3 = [
      (Math.max(a.max[0], b.max[0]) + Math.min(a.min[0], b.min[0])) / 2,
      (a.max[1] + b.min[1]) / 2,
      (a.max[2] + b.min[2]) / 2,
    ]
    return { contact: false, certifiedGap: d, gap: d, point: mid }
  }

  // 扫描域 = AABB 交集外扩 cell：
  // 间隙点必在两表面之间；若落在交集外超过 cell，AABB 盒距已给出更优下界
  const lo: Vec3 = [
    Math.max(a.min[0], b.min[0]) - cell,
    Math.max(a.min[1], b.min[1]) - cell,
    Math.max(a.min[2], b.min[2]) - cell,
  ]
  const hi: Vec3 = [
    Math.min(a.max[0], b.max[0]) + cell,
    Math.min(a.max[1], b.max[1]) + cell,
    Math.min(a.max[2], b.max[2]) + cell,
  ]
  const boxGap = boxDistance(a.min, a.max, b.min, b.max)
  const L = Math.max(a.lipschitz, b.lipschitz)
  const radius = (cell * Math.sqrt(3)) / 2

  const g = (p: Vec3): number => Math.max(a.f(p), b.f(p))
  // 固定步长规则网格：保证域内任一点到最近采样点距离 <= cell√3/2，证书才成立
  const nx = Math.max(1, Math.ceil((hi[0] - lo[0]) / cell))
  const ny = Math.max(1, Math.max(1, Math.ceil((hi[1] - lo[1]) / cell)))
  const nz = Math.max(1, Math.ceil((hi[2] - lo[2]) / cell))
  const sx = (hi[0] - lo[0]) / nx
  const sy = (hi[1] - lo[1]) / ny
  const sz = (hi[2] - lo[2]) / nz
  let best = Infinity
  let bestP: Vec3 = [0, 0, 0]
  let globalMin = Infinity
  for (let i = 0; i <= nx; i++) {
    const x = lo[0] + sx * i
    for (let j = 0; j <= ny; j++) {
      const y = lo[1] + sy * j
      for (let k = 0; k <= nz; k++) {
        const p: Vec3 = [x, y, lo[2] + sz * k]
        const v = g(p)
        if (v < globalMin) globalMin = v
        if (v < best) {
          best = v
          bestP = p
        }
      }
    }
  }

  // 数值细化：对 g 做最速下降，拿到精确接触点
  const point = refineMin(g, bestP, Math.max(cell * 0.5, 0.4), 26)
  const gap = g(point)
  // 严格下界：全局最小采样值 − L·采样覆盖半径；与 AABB 盒距取更紧者
  const certifiedGap = Math.max(globalMin - L * radius, boxGap)
  return { contact: certifiedGap <= 0, certifiedGap, gap, point }
}

// 最速下降（数值梯度），g 为 max 复合时次梯度方向仍有效
function refineMin(g: (p: Vec3) => number, start: Vec3, step: number, iters: number): Vec3 {
  let p = [...start] as Vec3
  let h = step
  let prev = g(p)
  for (let it = 0; it < iters; it++) {
    const e = Math.max(h * 0.25, 0.12)
    const grad: Vec3 = [
      g([p[0] + e, p[1], p[2]]) - g([p[0] - e, p[1], p[2]]),
      g([p[0], p[1] + e, p[2]]) - g([p[0], p[1] - e, p[2]]),
      g([p[0], p[1], p[2] + e]) - g([p[0], p[1], p[2] - e]),
    ]
    const gl = Math.hypot(grad[0], grad[1], grad[2])
    if (gl < 1e-9) break
    const cand: Vec3 = [p[0] - (grad[0] / gl) * h, Math.max(0, p[1] - (grad[1] / gl) * h), p[2] - (grad[2] / gl) * h]
    const v = g(cand)
    if (v < prev) {
      p = cand
      prev = v
    } else {
      h *= 0.55
      if (h < 0.05) break
    }
  }
  return p
}
