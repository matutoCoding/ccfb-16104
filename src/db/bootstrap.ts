// 首次启动写入种子数据
import { dbGet, dbGetAll, dbPut } from './idb'
import { seedLayout, seedRecipes, seedTrays } from './seed'
import type { Recipe, SimSettings } from '../types'

export const DEFAULT_SETTINGS: SimSettings = {
  gridCell: 2,
  rayScale: 1,
  maxSteps: 96,
  autoSweep: true,
}

export async function ensureSeeded(): Promise<void> {
  const recipes = await dbGetAll<Recipe>('recipes')
  if (recipes.length > 0) return
  const seedR = seedRecipes()
  const seedT = seedTrays()
  for (const r of seedR) await dbPut('recipes', r.id, r)
  for (const t of seedT) await dbPut('trays', t.id, t)
  const plan = seedLayout(seedR, seedT)
  await dbPut('layouts', plan.id, plan)
  await dbPut('settings', 'app', DEFAULT_SETTINGS)
}

export async function getSettings(): Promise<SimSettings> {
  const s = await dbGet<SimSettings>('settings', 'app')
  return s ?? DEFAULT_SETTINGS
}

export async function saveSettings(s: SimSettings): Promise<void> {
  await dbPut('settings', 'app', s)
}
