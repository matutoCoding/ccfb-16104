// 首次启动的测试数据：3 个配方 + 4 种盘型 + 1 个示例摆法
import type { LayoutPlan, Recipe, Tray } from '../types'
import { uid } from './idb'

function proofPoints(duration: number, finalV: number): { t: number; v: number }[] {
  return [
    { t: 0, v: 1 },
    { t: duration * 0.3, v: 1 + (finalV - 1) * 0.25 },
    { t: duration * 0.65, v: 1 + (finalV - 1) * 0.62 },
    { t: duration, v: finalV },
  ]
}

function bakePoints(duration: number, finalV: number): { t: number; v: number }[] {
  // 入炉急胀（oven spring）后定型微缩
  const peak = finalV * 1.06
  return [
    { t: 0, v: 1 },
    { t: duration * 0.18, v: peak },
    { t: duration * 0.55, v: finalV },
    { t: duration, v: finalV * 0.97 },
  ]
}

export function seedRecipes(): Recipe[] {
  return [
    {
      id: 'recipe_roll',
      name: '奶香小餐包',
      updatedAt: Date.now(),
      doughWeight: 45,
      hydration: 0.62,
      yeast: 1.8,
      shape: 'ball',
      ballCount: 1,
      cuts: [],
      proof: { duration: 3600, temp: 32, humidity: 0.78, points: proofPoints(3600, 2.1) },
      bake: { duration: 720, temp: 195, topHeat: 1.1, bottomHeat: 1.0, points: bakePoints(720, 2.25) },
    },
    {
      id: 'recipe_ciabatta',
      name: '夏巴塔（高水量）',
      updatedAt: Date.now(),
      doughWeight: 120,
      hydration: 0.88,
      yeast: 1.2,
      shape: 'olive',
      ballCount: 2,
      cuts: [
        { id: uid('cut'), cx: 0, cz: 0, length: 70, angle: 0, depth: 0.28 },
      ],
      proof: { duration: 4200, temp: 28, humidity: 0.85, points: proofPoints(4200, 1.9) },
      bake: { duration: 1080, temp: 230, topHeat: 1.2, bottomHeat: 1.15, points: bakePoints(1080, 2.05) },
    },
    {
      id: 'recipe_braid',
      name: '编辫面包（三股）',
      updatedAt: Date.now(),
      doughWeight: 180,
      hydration: 0.6,
      yeast: 2.0,
      shape: 'braid',
      ballCount: 9,
      cuts: [],
      proof: { duration: 3900, temp: 30, humidity: 0.8, points: proofPoints(3900, 2.0) },
      bake: { duration: 1200, temp: 200, topHeat: 1.05, bottomHeat: 1.0, points: bakePoints(1200, 2.15) },
    },
  ]
}

export function seedTrays(): Tray[] {
  return [
    { id: 'tray_flat_600', name: '标准平盘 600×400', updatedAt: Date.now(), kind: 'flat', width: 600, depth: 400, rimHeight: 25, slotCount: 0, slotPitch: 0 },
    { id: 'tray_baguette', name: '法棍槽盘 5 槽', updatedAt: Date.now(), kind: 'baguette', width: 600, depth: 400, rimHeight: 30, slotCount: 5, slotPitch: 75 },
    { id: 'tray_mesh', name: '带孔网盘 460×330', updatedAt: Date.now(), kind: 'perforated', width: 460, depth: 330, rimHeight: 18, slotCount: 0, slotPitch: 0 },
    { id: 'tray_belt', name: '隧道炉网带（宽 800）', updatedAt: Date.now(), kind: 'belt', width: 800, depth: 600, rimHeight: 0, slotCount: 0, slotPitch: 0 },
  ]
}

export function seedLayout(recipes: Recipe[], trays: Tray[]): LayoutPlan {
  void recipes
  const tray = trays[0]
  const doughs = []
  const cols = 10
  const rows = 6
  // 外扩边距 40mm，给醒发膨胀和证书保守界留足余量
  const sx = (tray.width - 80) / (cols - 1)
  const sz = (tray.depth - 80) / (rows - 1)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      doughs.push({
        id: uid('dough'),
        recipeId: 'recipe_roll',
        x: -tray.width / 2 + 40 + c * sx,
        z: -tray.depth / 2 + 40 + r * sz,
        rotation: 0,
      })
    }
  }
  return { id: 'plan_seed', name: '小餐包 60 个标准摆法', updatedAt: Date.now(), trayId: tray.id, doughs }
}
