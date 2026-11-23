// 三维向量小工具，全部纯函数，元组表示 [x, y, z]
export type Vec3 = [number, number, number]

export const v3 = (x = 0, y = 0, z = 0): Vec3 => [x, y, z]

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2])

export function norm(a: Vec3): Vec3 {
  const l = Math.hypot(a[0], a[1], a[2])
  return l < 1e-12 ? [0, 1, 0] : [a[0] / l, a[1] / l, a[2] / l]
}

// 绕 y 轴旋转（摆盘旋转用），角度弧度
export function rotY(a: Vec3, ang: number): Vec3 {
  const c = Math.cos(ang)
  const s = Math.sin(ang)
  return [a[0] * c + a[2] * s, a[1], -a[0] * s + a[2] * c]
}

export const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x))
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

export function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

// 分段线性插值，xs 必须升序；越界取端点
export function interp(xs: number[], ys: number[], x: number): number {
  if (x <= xs[0]) return ys[0]
  const n = xs.length
  if (x >= xs[n - 1]) return ys[n - 1]
  let lo = 0
  let hi = n - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (xs[mid] <= x) lo = mid
    else hi = mid
  }
  const t = (x - xs[lo]) / (xs[hi] - xs[lo])
  return lerp(ys[lo], ys[hi], t)
}
