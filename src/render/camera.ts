// 简易轨道相机：拖动旋转、滚轮缩放，返回视图旋转矩阵与位置
import type { Vec3 } from '../sim/vec3'

export interface OrbitCamera {
  target: Vec3
  yaw: number
  pitch: number
  dist: number
  fov: number
}

export function createCamera(target: Vec3, dist = 700): OrbitCamera {
  return { target, yaw: Math.PI * 0.25, pitch: Math.PI * 0.32, dist, fov: Math.PI / 4 }
}

export function cameraPos(c: OrbitCamera): Vec3 {
  const cp = Math.cos(c.pitch)
  return [
    c.target[0] + c.dist * cp * Math.sin(c.yaw),
    c.target[1] + c.dist * Math.sin(c.pitch),
    c.target[2] + c.dist * cp * Math.cos(c.yaw),
  ]
}

// 用右/上/前三向量构造视图正交基（列主序 mat3）
export function viewMatrix(c: OrbitCamera): { pos: Vec3; rot: Float32Array } {
  const pos = cameraPos(c)
  const fwd: Vec3 = [
    -(pos[0] - c.target[0]),
    -(pos[1] - c.target[1]),
    -(pos[2] - c.target[2]),
  ]
  const fl = Math.hypot(fwd[0], fwd[1], fwd[2])
  fwd[0] /= fl; fwd[1] /= fl; fwd[2] /= fl
  const worldUp: Vec3 = [0, 1, 0]
  // right = normalize(cross(fwd, up))
  let right: Vec3 = [
    fwd[1] * worldUp[2] - fwd[2] * worldUp[1],
    fwd[2] * worldUp[0] - fwd[0] * worldUp[2],
    fwd[0] * worldUp[1] - fwd[1] * worldUp[0],
  ]
  const rl = Math.hypot(right[0], right[1], right[2])
  right = [right[0] / rl, right[1] / rl, right[2] / rl]
  const up: Vec3 = [
    right[1] * fwd[2] - right[2] * fwd[1],
    right[2] * fwd[0] - right[0] * fwd[2],
    right[0] * fwd[1] - right[1] * fwd[0],
  ]
  // mat3 列主序：列0=right 列1=up 列2=-fwd
  const rot = new Float32Array([
    right[0], right[1], right[2],
    up[0], up[1], up[2],
    -fwd[0], -fwd[1], -fwd[2],
  ])
  return { pos, rot }
}

export function attachOrbit(canvas: HTMLCanvasElement, cam: OrbitCamera, onChange: () => void): () => void {
  let dragging = false
  let lx = 0
  let ly = 0
  const down = (e: PointerEvent) => {
    dragging = true
    lx = e.clientX
    ly = e.clientY
    canvas.setPointerCapture(e.pointerId)
  }
  const up = (e: PointerEvent) => {
    dragging = false
    canvas.releasePointerCapture(e.pointerId)
  }
  const move = (e: PointerEvent) => {
    if (!dragging) return
    const dx = e.clientX - lx
    const dy = e.clientY - ly
    lx = e.clientX
    ly = e.clientY
    cam.yaw -= dx * 0.006
    cam.pitch = Math.max(0.08, Math.min(1.45, cam.pitch + dy * 0.006))
    onChange()
  }
  const wheel = (e: WheelEvent) => {
    e.preventDefault()
    cam.dist = Math.max(120, Math.min(2200, cam.dist * Math.exp(e.deltaY * 0.001)))
    onChange()
  }
  canvas.addEventListener('pointerdown', down)
  canvas.addEventListener('pointerup', up)
  canvas.addEventListener('pointermove', move)
  canvas.addEventListener('wheel', wheel, { passive: false })
  return () => {
    canvas.removeEventListener('pointerdown', down)
    canvas.removeEventListener('pointerup', up)
    canvas.removeEventListener('pointermove', move)
    canvas.removeEventListener('wheel', wheel)
  }
}
