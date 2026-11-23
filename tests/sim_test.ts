// 端到端：种子摆法时间轴 + 粘连证书 + 出炉测量
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { seedLayout, seedRecipes, seedTrays } from '../src/db/seed.ts'
import { SimEngine, runTimeline } from '../src/sim/engine.ts'
import { gapBetween, doughObject } from '../src/sim/contact.ts'
import { measureDough } from '../src/sim/inspection.ts'
import type { LayoutPlan } from '../src/types.ts'

const recipes = seedRecipes()
const trays = seedTrays()
const recipeMap = new Map(recipes.map((r) => [r.id, r]))

test('种子 60 个小餐包摆法：全程无粘连且保证间隙为正', () => {
  const plan = seedLayout(recipes, trays)
  const engine = new SimEngine()
  engine.load(recipes, trays[0], plan, 2)
  const { events, finalPairs } = runTimeline(engine, 12)
  assert.equal(events.length, 0, `不应有粘连事件，实际 ${events.length}`)
  const minCert = Math.min(...finalPairs.map((p) => p.result.certifiedGap))
  assert.ok(minCert > 0, `最小保证间隙必须为正，实际 ${minCert}`)
})

test('挤紧摆法（间距 2mm）：醒发末态必然检出粘连，且时刻可定位', () => {
  const base = seedLayout(recipes, trays)
  const squeezed: LayoutPlan = {
    ...base,
    doughs: base.doughs.map((d, i) => {
      const col = i % 10
      const row = Math.floor(i / 10)
      // 中心距 48mm：初始有间隙，醒发膨胀后面团间粘连
      return { ...d, x: -216 + col * 48, z: -120 + row * 48 }
    }),
  }
  const engine = new SimEngine()
  engine.load(recipes, trays[0], squeezed, 2)
  const { events } = runTimeline(engine, 16)
  const doughEvents = events.filter((e) => e.bId !== '__rim__')
  assert.ok(doughEvents.length > 0, '挤紧摆法必须出现面团间粘连')
  const total = engine.proofDuration + engine.bakeDuration
  assert.ok(doughEvents[0].time > 0 && doughEvents[0].time <= total)
})

test('不粘连判定的截面保证：随机采样点 g=max(fA,fB) 恒正于证书值', () => {
  const plan = seedLayout(recipes, trays)
  const engine = new SimEngine()
  engine.load(recipes, trays[0], plan, 2)
  const frame = engine.buildFrame(engine.proofDuration)
  const a = frame.instances[0]
  const b = frame.instances[1]
  const r = gapBetween(doughObject(a), doughObject(b), 2)
  const radius = Math.sqrt(3) // cell=2 的覆盖半径
  assert.equal(r.contact, false)
  // 证书覆盖两 AABB 交集域：在交集内的截面网格密集采样
  const ba = doughObject(a), bb = doughObject(b)
  const lo = [Math.max(ba.min[0], bb.min[0]), Math.max(ba.min[1], bb.min[1]), Math.max(ba.min[2], bb.min[2])]
  const hi = [Math.min(ba.max[0], bb.max[0]), Math.min(ba.max[1], bb.max[1]), Math.min(ba.max[2], bb.max[2])]
  let worst = Infinity
  for (let i = 0; i <= 8; i++) {
    for (let j = 0; j <= 8; j++) {
      for (let k = 0; k <= 8; k++) {
        const p = [
          lo[0] + ((hi[0] - lo[0]) * i) / 8,
          lo[1] + ((hi[1] - lo[1]) * j) / 8,
          lo[2] + ((hi[2] - lo[2]) * k) / 8,
        ] as [number, number, number]
        worst = Math.min(worst, Math.max(ba.f(p), bb.f(p)))
      }
    }
  }
  // 证书 = 网格最小采样 − L·h√3/2，必为真实间隙的保守下界；允许一个半径的保守量
  assert.ok(r.certifiedGap <= worst + radius + 1e-6, `证书 ${r.certifiedGap} 应不高于实测+保守半径 ${worst + radius}`)
  assert.ok(r.certifiedGap > 0, '证书间隙为正才能保证不粘连')
  assert.ok(worst > 0, '两团之间任意采样点都应有空隙')
})

test('出炉测量：单团尺寸为正且体积随膨胀增大', () => {
  const plan = seedLayout(recipes, trays)
  const engine = new SimEngine()
  engine.load(recipes, trays[0], plan, 2)
  const start = engine.buildFrame(0).instances[0]
  const end = engine.buildFrame(engine.proofDuration + engine.bakeDuration).instances[0]
  const m0 = measureDough(start, 2)
  const m1 = measureDough(end, 2)
  assert.ok(m0.length > 0 && m0.height > 0)
  assert.ok(m1.volMm3 > m0.volMm3, `烘烤后体积应更大：${m0.volMm3} -> ${m1.volMm3}`)
  void recipeMap
})
