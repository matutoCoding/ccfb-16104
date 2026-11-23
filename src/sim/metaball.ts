// 元球隐式曲面：形状模板 + 1-Lipschitz 融合算子
// 模板本地空间以基础球半径 r0 = 1 为单位，底面 y = 0，长轴沿 z
import type { ShapeKind } from '../types'
import type { Vec3 } from './vec3'

export interface Ball {
  c: Vec3
  r: number
}

export interface ShapeTemplate {
  kind: ShapeKind
  balls: Ball[]
  // 本地空间融合系数（相对 r0=1）
  blendK: number
  // 包围盒（本地，未缩放）
  min: Vec3
  max: Vec3
}

// 多项式光滑 min，1-Lipschitz，可直接用于带距离保证的光线步进
export function smin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k
  return Math.min(a, b) - h * h * k * 0.25
}

export function sphereSdf(p: Vec3, c: Vec3, r: number): number {
  return Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) - r
}

// 长方体 SDF（带圆角），b 为半尺寸
export function roundBoxSdf(p: Vec3, b: Vec3, rad: number): number {
  const qx = Math.abs(p[0]) - b[0] + rad
  const qy = Math.abs(p[1]) - b[1] + rad
  const qz = Math.abs(p[2]) - b[2] + rad
  const cx = Math.max(qx, 0)
  const cy = Math.max(qy, 0)
  const cz = Math.max(qz, 0)
  const outside = Math.hypot(cx, cy, cz) - rad
  const inside = Math.min(Math.max(qx, Math.max(qy, qz)), 0)
  return outside + inside
}

function bounds(balls: Ball[]): { min: Vec3; max: Vec3 } {
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const b of balls) {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], b.c[i] - b.r)
      max[i] = Math.max(max[i], b.c[i] + b.r)
    }
  }
  return { min, max }
}

// 按形状生成元球模板，n 为目标元球总数（编辫会向下取整到 3 的倍数）
export function buildTemplate(kind: ShapeKind, n: number): ShapeTemplate {
  let balls: Ball[] = []
  if (kind === 'ball') {
    balls = [{ c: [0, 1, 0], r: 1 }]
  } else if (kind === 'olive') {
    // 两球交叠，沿 z 拉长
    balls = [
      { c: [0, 0.85, -0.38], r: 0.85 },
      { c: [0, 0.85, 0.38], r: 0.85 },
    ]
  } else if (kind === 'baguette') {
    const count = Math.max(3, n)
    const r = 0.55
    const pitch = 0.52
    const half = ((count - 1) * pitch) / 2
    for (let i = 0; i < count; i++) {
      balls.push({ c: [0, r, i * pitch - half], r })
    }
  } else {
    // 三股编辫：每股 m 个球，绕 z 轴螺旋交错
    const m = Math.max(2, Math.floor(n / 3))
    const r = 0.42
    const strandR = 0.3
    const axisY = 0.6
    const length = (m - 1) * 0.55 + 1.1
    for (let s = 0; s < 3; s++) {
      const phase = (s * Math.PI * 2) / 3
      for (let i = 0; i < m; i++) {
        const z = i * 0.55 - length / 2 + 0.55
        const ang = phase + z * 1.15
        balls.push({
          c: [strandR * Math.cos(ang), axisY + strandR * Math.sin(ang), z],
          r,
        })
      }
    }
  }
  return { kind, balls, blendK: 0.12, ...bounds(balls) }
}

// 模板在本地空间的隐式场（不含地面、割口）
export function templateField(tpl: ShapeTemplate, p: Vec3): number {
  let f = Infinity
  for (const b of tpl.balls) f = smin(f, sphereSdf(p, b.c, b.r), tpl.blendK)
  return f
}
