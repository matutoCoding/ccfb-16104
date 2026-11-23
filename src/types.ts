// 领域模型：所有长度单位 mm，质量 g，时间秒，温度 ℃，相对湿度 0~1

export type ShapeKind = 'ball' | 'olive' | 'baguette' | 'braid'

export type TrayKind = 'flat' | 'baguette' | 'perforated' | 'belt'

// 体积倍数曲线关键帧（相对初始体积的倍数）
export interface CurvePoint {
  t: number // 秒
  v: number // 体积倍数
}

export interface ProofCurve {
  duration: number // 醒发总时长 秒
  points: CurvePoint[]
  // 温湿度环境（影响实际膨胀速度）
  temp: number
  humidity: number
}

export interface BakeCurve {
  duration: number // 烘烤总时长 秒
  points: CurvePoint[]
  temp: number // 炉温
  topHeat: number // 面火系数 0.8~1.3
  bottomHeat: number // 底火系数 0.8~1.3
}

// 割包刀口：面团本地坐标，沿 y 轴方向的刀痕
export interface ScoreCut {
  id: string
  cx: number // 中心 x（本地坐标，沿短轴）
  cz: number // 中心 z（沿长轴）
  length: number // 刀口长度
  angle: number // 与短轴夹角 度，法棍通常斜割 30~45°
  depth: number // 刀深，占当前高度比例 0.1~0.6
}

export interface Recipe {
  id: string
  name: string
  updatedAt: number
  // 配方
  doughWeight: number // 单个面团克重 g
  hydration: number // 含水量 0.4~0.95（ baker's percent ）
  yeast: number // 酵母量 百分比 0.3~4
  shape: ShapeKind
  ballCount: number // 该形状的元球数量（长棍/编辫用）
  cuts: ScoreCut[]
  proof: ProofCurve
  bake: BakeCurve
}

export interface Tray {
  id: string
  name: string
  updatedAt: number
  kind: TrayKind
  width: number // x 方向内尺寸
  depth: number // z 方向内尺寸
  rimHeight: number // 挡边高度（网带为 0）
  slotCount: number // 法棍槽数，其他为 0
  slotPitch: number // 槽间距
}

export interface PlacedDough {
  id: string // 实例 id
  recipeId: string
  x: number // 盘坐标中心
  z: number
  rotation: number // 绕 y 轴旋转 度
}

export interface LayoutPlan {
  id: string
  name: string
  updatedAt: number
  trayId: string
  doughs: PlacedDough[]
}

// 粘连事件
export interface ContactEvent {
  time: number // 模拟时间 秒
  phase: 'proof' | 'bake'
  aId: string
  bId: string // bId 为 '__rim__' 时表示越挡边
  point: [number, number, number]
  gap: number // 保证间隙（负=已重叠的深度）
}

export interface SimSettings {
  gridCell: number // 粘连扫描体素尺寸 mm
  rayScale: number // 渲染分辨率比例
  maxSteps: number // 光线步进最大步数
  autoSweep: boolean // 编辑页自动后台试摆
}

export type StoreName = 'recipes' | 'trays' | 'layouts' | 'settings'
