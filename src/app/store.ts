// 全局状态：内存 + IndexedDB 持久化，轻量发布订阅
import { dbDelete, dbGetAll, dbPut } from '../db/idb'
import { DEFAULT_SETTINGS, ensureSeeded, getSettings, saveSettings } from '../db/bootstrap'
import type { LayoutPlan, Recipe, SimSettings, Tray } from '../types'

export interface AppState {
  recipes: Recipe[]
  trays: Tray[]
  layouts: LayoutPlan[]
  settings: SimSettings
  selectedRecipeId: string
  selectedTrayId: string
  selectedLayoutId: string
}

type Listener = (s: AppState) => void

class Store {
  state: AppState = {
    recipes: [],
    trays: [],
    layouts: [],
    settings: DEFAULT_SETTINGS,
    selectedRecipeId: '',
    selectedTrayId: '',
    selectedLayoutId: '',
  }
  private listeners = new Set<Listener>()

  async init(): Promise<void> {
    await ensureSeeded()
    const [recipes, trays, layouts, settings] = await Promise.all([
      dbGetAll<Recipe>('recipes'),
      dbGetAll<Tray>('trays'),
      dbGetAll<LayoutPlan>('layouts'),
      getSettings(),
    ])
    this.state = {
      recipes,
      trays,
      layouts,
      settings,
      selectedRecipeId: recipes[0]?.id ?? '',
      selectedTrayId: trays[0]?.id ?? '',
      selectedLayoutId: layouts[0]?.id ?? '',
    }
    this.emit()
  }

  sub(fn: Listener): () => void {
    this.listeners.add(fn)
    fn(this.state)
    return () => this.listeners.delete(fn)
  }

  private emit(): void {
    for (const fn of this.listeners) fn(this.state)
  }

  private patch(p: Partial<AppState>): void {
    this.state = { ...this.state, ...p }
    this.emit()
  }

  async saveRecipe(r: Recipe): Promise<void> {
    await dbPut('recipes', r.id, { ...r, updatedAt: Date.now() })
    const recipes = this.state.recipes.filter((x) => x.id !== r.id)
    recipes.push({ ...r, updatedAt: Date.now() })
    this.patch({ recipes, selectedRecipeId: r.id })
  }

  async deleteRecipe(id: string): Promise<void> {
    await dbDelete('recipes', id)
    const recipes = this.state.recipes.filter((x) => x.id !== id)
    this.patch({ recipes, selectedRecipeId: recipes[0]?.id ?? '' })
  }

  async saveTray(t: Tray): Promise<void> {
    await dbPut('trays', t.id, { ...t, updatedAt: Date.now() })
    const trays = this.state.trays.filter((x) => x.id !== t.id)
    trays.push({ ...t, updatedAt: Date.now() })
    this.patch({ trays, selectedTrayId: t.id })
  }

  async deleteTray(id: string): Promise<void> {
    await dbDelete('trays', id)
    const trays = this.state.trays.filter((x) => x.id !== id)
    this.patch({ trays, selectedTrayId: trays[0]?.id ?? '' })
  }

  async savePlan(p: LayoutPlan): Promise<void> {
    await dbPut('layouts', p.id, { ...p, updatedAt: Date.now() })
    const layouts = this.state.layouts.filter((x) => x.id !== p.id)
    layouts.push({ ...p, updatedAt: Date.now() })
    this.patch({ layouts, selectedLayoutId: p.id })
  }

  async deletePlan(id: string): Promise<void> {
    await dbDelete('layouts', id)
    const layouts = this.state.layouts.filter((x) => x.id !== id)
    this.patch({ layouts, selectedLayoutId: layouts[0]?.id ?? '' })
  }

  async updateSettings(s: SimSettings): Promise<void> {
    await saveSettings(s)
    this.patch({ settings: s })
  }

  select(kind: 'recipe' | 'tray' | 'layout', id: string): void {
    if (kind === 'recipe') this.patch({ selectedRecipeId: id })
    if (kind === 'tray') this.patch({ selectedTrayId: id })
    if (kind === 'layout') this.patch({ selectedLayoutId: id })
  }

  getRecipe(id: string): Recipe | undefined {
    return this.state.recipes.find((r) => r.id === id)
  }

  getTray(id: string): Tray | undefined {
    return this.state.trays.find((t) => t.id === id)
  }

  getLayout(id: string): LayoutPlan | undefined {
    return this.state.layouts.find((l) => l.id === id)
  }
}

export const store = new Store()
