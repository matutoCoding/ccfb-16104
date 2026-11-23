// 膨胀曲线、高水量摊开模型、表皮上色：模拟与渲染共用的纯函数
import type { BakeCurve, ProofCurve, Recipe } from '../types'
import { clamp, interp } from './vec3'

// 面团初始等效半径：取密度 1.15e-3 g/mm³（面包生面团典型值）
export const DOUGH_DENSITY = 1.15e-3

export function initialRadius(weight: number): number {
  const vol = weight / DOUGH_DENSITY
  return Math.cbrt((3 * vol) / (4 * Math.PI))
}

export function curveAt(points: { t: number; v: number }[], t: number): number {
  return interp(
    points.map((p) => p.t),
    points.map((p) => p.v),
    t,
  )
}

// 醒发环境因子：标准环境 32℃ / 75% 湿度为 1
export function proofEnvFactor(curve: ProofCurve): number {
  const tempF = clamp(1 + (curve.temp - 32) * 0.035, 0.55, 1.6)
  const humF = clamp(0.7 + curve.humidity * 0.4, 0.6, 1.15)
  return tempF * humF
}

// 烘烤环境因子：标准炉温 200℃ 为 1
export function bakeEnvFactor(curve: BakeCurve): number {
  return clamp(1 + (curve.temp - 200) * 0.006, 0.7, 1.35)
}

export interface GrowthState {
  volMul: number // 当前体积倍数
  rH: number // 水平缩放（相对初始）
  rV: number // 垂直缩放（相对初始）
  phase: 'proof' | 'bake'
  time: number // 当前阶段内秒数
}

// 高水量 → 竖向指数更小，面团贴盘后更多往四周摊；普通面团约 1/3（近各向同性）
export function verticalExponent(hydration: number): number {
  // 水量 0.62 → 0.284（近各向同性）；0.88 → 0.186（明显摊开）
  return clamp(0.52 - hydration * 0.38, 0.1, 0.4)
}

// 由体积倍数与水量计算各向异性缩放；底面贴盘 y=0 不动
export function growthAt(recipe: Recipe, phase: 'proof' | 'bake', time: number): GrowthState {
  const curve = phase === 'proof' ? recipe.proof : recipe.bake
  const env = phase === 'proof' ? proofEnvFactor(recipe.proof) : bakeEnvFactor(recipe.bake)
  // 环境只调节达到的速度：按时间比例缩放关键帧
  const effT = clamp(time * env, 0, curve.duration)
  const volMul = curveAt(curve.points, effT)
  const ev = verticalExponent(recipe.hydration)
  const rV = Math.pow(volMul, ev)
  const rH = Math.sqrt(volMul / rV)
  return { volMul, rH, rV, phase, time }
}

// 酵母对醒发速率的修正（酵母 1.5% 为基准）
export function yeastFactor(yeast: number): number {
  return clamp(0.6 + yeast * 0.27, 0.5, 1.5)
}

// 表皮上色：返回 0(面白) ~ 1(深棕)
// 热量积累模型，顶面/侧面/底面分别有受热系数
export interface BrowningInput {
  bakeTime: number
  bakeDuration: number
  ovenTemp: number
  topHeat: number
  bottomHeat: number
  hydration: number
}

export function browning(input: BrowningInput, region: 'top' | 'side' | 'bottom'): number {
  const u = clamp(input.bakeTime / input.bakeDuration, 0, 1)
  // 热剂量：S 形累积，炉温偏离 200℃ 调整
  const tempF = clamp((input.ovenTemp - 140) / 80, 0.3, 1.5)
  const heatF = region === 'top' ? input.topHeat : region === 'bottom' ? input.bottomHeat : 1
  // 高水量延缓美纳德反应（表面蒸发吸热）
  const hydF = 1 - clamp((input.hydration - 0.55) * 0.55, 0, 0.25)
  const dose = Math.pow(u, 2.2) * tempF * heatF * hydF
  return clamp((dose - 0.18) / 0.62, 0, 1)
}

// 刀口张开宽度随烘烤进度增大
export function cutOpenFactor(bakeTime: number, bakeDuration: number): number {
  const u = clamp(bakeTime / bakeDuration, 0, 1)
  return 0.35 + 0.65 * clamp(u * 1.4, 0, 1)
}
