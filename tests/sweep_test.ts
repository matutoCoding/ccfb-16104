// 容量试摆：验证安全/粘连摆法分级与最大容量选择
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { seedRecipes, seedTrays } from '../src/db/seed.ts'
import { runSweep } from '../src/app/sweep_core.ts'

const recipes = seedRecipes()
const trays = seedTrays()
const roll = recipes.filter((r) => r.shape === 'ball')
const tray = trays[0]

test('试摆：间距越大个数越少，且能选出不粘连的最大容量摆法', () => {
  const { rows, best } = runSweep(roll, tray, { gaps: [6, 10, 16, 24], margins: [12], cell: 2 })
  assert.ok(rows.length === 8)
  // 同模式下间距增大，个数不增
  const grid = rows.filter((r) => r.mode === 'grid').sort((a, b) => a.gap - b.gap)
  for (let i = 1; i < grid.length; i++) {
    assert.ok(grid[i].count <= grid[i - 1].count)
  }
  assert.ok(best, '至少存在一个安全摆法')
  assert.equal(best.contact, false)
  // 最优摆法的容量不小于任何其它安全摆法
  for (const r of rows.filter((x) => !x.contact)) {
    assert.ok(best.count >= r.count)
  }
  assert.ok(best.minCertifiedGap > 0)
})

test('试摆：极限小间距必然出现粘连候选', () => {
  const { rows } = runSweep(roll, tray, { gaps: [2], margins: [8], cell: 2 })
  assert.ok(rows.some((r) => r.contact), '2mm 间距在醒发后应有粘连')
})
