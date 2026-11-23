import type { Recipe, ShapeKind, ScoreCut, Tray, TrayKind } from '../types'
import { uid } from '../db/idb'

export function blankRecipe(): Recipe {
  const proofDuration = 3600
  const bakeDuration = 900
  return {
    id: uid('recipe'),
    name: '新配方',
    updatedAt: Date.now(),
    doughWeight: 60,
    hydration: 0.65,
    yeast: 1.5,
    shape: 'ball',
    ballCount: 1,
    cuts: [],
    proof: {
      duration: proofDuration,
      temp: 32,
      humidity: 0.78,
      points: [
        { t: 0, v: 1 },
        { t: proofDuration * 0.5, v: 1.5 },
        { t: proofDuration, v: 2 },
      ],
    },
    bake: {
      duration: bakeDuration,
      temp: 200,
      topHeat: 1.1,
      bottomHeat: 1,
      points: [
        { t: 0, v: 1 },
        { t: bakeDuration * 0.2, v: 2.1 },
        { t: bakeDuration, v: 2.0 },
      ],
    },
  }
}

export function blankTray(): Tray {
  return {
    id: uid('tray'),
    name: '新盘型',
    updatedAt: Date.now(),
    kind: 'flat',
    width: 600,
    depth: 400,
    rimHeight: 20,
    slotCount: 0,
    slotPitch: 0,
  }
}

export const SHAPE_LABELS: [ShapeKind, string][] = [
  ['ball', '圆球'],
  ['olive', '橄榄'],
  ['baguette', '长棍'],
  ['braid', '编辫'],
]

export const TRAY_LABELS: [TrayKind, string][] = [
  ['flat', '平盘'],
  ['baguette', '法棍槽盘'],
  ['perforated', '带孔网盘'],
  ['belt', '隧道炉网带'],
]

export function blankCut(): ScoreCut {
  return { id: uid('cut'), cx: 0, cz: 0, length: 40, angle: 30, depth: 0.3 }
}

export function defaultBallCount(shape: ShapeKind): number {
  if (shape === 'ball') return 1
  if (shape === 'olive') return 2
  if (shape === 'baguette') return 7
  return 9
}
