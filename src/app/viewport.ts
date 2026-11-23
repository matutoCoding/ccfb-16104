// 3D 视口：封装 Renderer + 轨道相机，页面只需喂场景
import { Renderer, type RenderScene } from '../render/renderer'
import { attachOrbit, createCamera, type OrbitCamera } from '../render/camera'
import { h } from './dom'

export interface Viewport {
  root: HTMLElement
  canvas: HTMLCanvasElement
  renderer: Renderer
  cam: OrbitCamera
  setScene: (s: RenderScene) => void
  dispose: () => void
}

export function createViewport(): Viewport {
  const canvas = h('canvas', {}) as HTMLCanvasElement
  const root = h('div', { class: 'viewport' }, canvas)
  const cam = createCamera([0, 40, 0], 750)
  let renderer: Renderer
  try {
    renderer = new Renderer(canvas, cam)
  } catch (err) {
    root.replaceChildren(h('div', { class: 'empty-state' }, h('h3', {}, 'WebGL2 不可用'), h('p', {}, String(err))))
    throw err
  }
  const detach = attachOrbit(canvas, cam, () => renderer.markDirty())
  renderer.start()
  return {
    root,
    canvas,
    renderer,
    cam,
    setScene: (s: RenderScene) => renderer.setScene(s),
    dispose: () => {
      detach()
      renderer.stop()
    },
  }
}

export function hud(...items: HTMLElement[]): HTMLElement {
  return h('div', { class: 'hud' }, ...items)
}
