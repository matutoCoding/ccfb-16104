// 把引擎帧转成渲染场景
import type { Recipe, Tray } from '../types'
import type { RenderScene } from '../render/renderer'
import type { SimFrame } from '../sim/engine'
import { clamp } from '../sim/vec3'

export function frameToScene(frame: SimFrame, tray: Tray, recipes: Map<string, Recipe>, markers: [number, number, number][] = []): RenderScene {
  const firstRecipe = recipes.get(frame.instances[0]?.recipeId ?? '')
  const bakeU = frame.phase === 'bake' && firstRecipe ? clamp(frame.phaseTime / firstRecipe.bake.duration, 0, 1) : 0
  return {
    instances: frame.instances,
    tray,
    markers,
    bakeU,
    ovenTemp: firstRecipe?.bake.temp ?? 200,
    topHeat: firstRecipe?.bake.topHeat ?? 1.1,
    bottomHeat: firstRecipe?.bake.bottomHeat ?? 1,
    hydration: firstRecipe?.hydration ?? 0.65,
  }
}
