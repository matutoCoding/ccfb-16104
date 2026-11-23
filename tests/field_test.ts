// 场数学与粘连证书验证：node --experimental-strip-types tests/field_test.ts
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { buildTemplate, smin, sphereSdf, templateField } from '../src/sim/metaball.ts'
import { makeInstance, doughFieldPlain } from '../src/sim/instance.ts'
import { initialRadius, growthAt } from '../src/sim/growth.ts'
import { gapBetween, doughObject } from '../src/sim/contact.ts'
import { seedRecipes } from '../src/db/seed.ts'

const recipes = seedRecipes()
const roll = recipes[0]
const ciabatta = recipes[1]

test('smin 是 1-Lipschitz（随机点对梯度不超过 1）', () => {
  let maxLip = 0
  const k = 0.35
  for (let i = 0; i < 2000; i++) {
    const a = Math.random() * 6 - 3
    const b = Math.random() * 6 - 3
    const e = 1e-3
    const dA = (smin(a + e, b, k) - smin(a - e, b, k)) / (2 * e)
    const dB = (smin(a, b + e, k) - smin(a, b - e, k)) / (2 * e)
    maxLip = Math.max(maxLip, Math.abs(dA), Math.abs(dB))
  }
  assert.ok(maxLip <= 1.0001, `Lipschitz=${maxLip}`)
})

test('球 SDF 与模板场：内部为负、外部为正、零水平集在表面', () => {
  const tpl = buildTemplate('ball', 1)
  assert.ok(templateField(tpl, [0, 1, 0]) < 0)
  assert.ok(Math.abs(templateField(tpl, [0, 2, 0])) < 1e-9)
  assert.ok(templateField(tpl, [0, 5, 0]) > 0)
  assert.ok(Math.abs(sphereSdf([0, 2, 0], [0, 1, 0], 1)) < 1e-9)
})

test('贴盘约束：底面以下场恒非负（不会穿盘）', () => {
  const d = makeInstance('a', roll, buildTemplate('ball', 1), 0, 0, 0)
  for (const y of [-2, -1, -0.01]) {
    assert.ok(doughFieldPlain(d, [0, y, 0]) >= 0)
  }
})

test('高水量夏巴塔醒发后摊开：水平增长显著大于垂直', () => {
  const g = growthAt(ciabatta, 'proof', ciabatta.proof.duration)
  assert.ok(g.rH > g.rV * 1.12, `rH=${g.rH} rV=${g.rV}`)
  const rollG = growthAt(roll, 'proof', roll.proof.duration)
  assert.ok(Math.abs(rollG.rV - rollG.rH) < rollG.rH * 0.08)
})

test('粘连证书：远离的两团保证间隙为正', () => {
  const tpl = buildTemplate('ball', 1)
  const r = initialRadius(roll.doughWeight)
  const a = makeInstance('a', roll, tpl, -(r * 3), 0, 0)
  const b = makeInstance('b', roll, tpl, r * 3, 0, 0)
  const res = gapBetween(doughObject(a), doughObject(b), 2)
  assert.equal(res.contact, false)
  assert.ok(res.certifiedGap > 0, `certifiedGap=${res.certifiedGap}`)
})

test('粘连证书：重叠两团必判粘连，且间隙为负', () => {
  const tpl = buildTemplate('ball', 1)
  const r = initialRadius(roll.doughWeight)
  const a = makeInstance('a', roll, tpl, -r * 0.5, 0, 0)
  const b = makeInstance('b', roll, tpl, r * 0.5, 0, 0)
  const res = gapBetween(doughObject(a), doughObject(b), 1.5)
  assert.equal(res.contact, true)
  assert.ok(res.gap < 0)
})

test('临界间距附近：缩小体素尺寸，证书间隙收敛到解析值', () => {
  const tpl = buildTemplate('ball', 1)
  const r = initialRadius(roll.doughWeight)
  // 球心距离 2r + 3mm，解析表面间隙 = 3mm
  const a = makeInstance('a', roll, tpl, -(r + 1.5), 0, 0)
  const b = makeInstance('b', roll, tpl, r + 1.5, 0, 0)
  const coarse = gapBetween(doughObject(a), doughObject(b), 4)
  const fine = gapBetween(doughObject(a), doughObject(b), 1)
  assert.ok(Math.abs(fine.gap - 3) < 0.3, `fine.gap=${fine.gap}`)
  assert.ok(fine.certifiedGap <= fine.gap + 0.01)
  assert.ok(coarse.certifiedGap <= fine.certifiedGap + 0.01)
  assert.ok(fine.certifiedGap > 0)
})

test('体积倍数与缩放守恒：rH²·rV = volMul', () => {
  for (const recipe of recipes) {
    const g = growthAt(recipe, 'proof', recipe.proof.duration * 0.6)
    const prod = g.rH * g.rH * g.rV
    assert.ok(Math.abs(prod - g.volMul) < 1e-9)
  }
})
