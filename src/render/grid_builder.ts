// 均匀网格构建：每个 cell 存与其 AABB 重叠的面团索引，供片元 DDA 遍历
import type { DoughInstance } from '../sim/instance'
import { doughBounds } from '../sim/instance'
import type { Vec3 } from '../sim/vec3'

export interface AccelGrid {
  min: Vec3
  dim: [number, number, number]
  cell: number
  // 每 cell 最多 4 个面团，扁平 RGBA 行，-1 补位
  cellDough: Int32Array
}

const MAX_PER_CELL = 4

export function buildGrid(instances: DoughInstance[], cell = 110): AccelGrid {
  if (instances.length === 0) {
    return { min: [0, 0, 0], dim: [1, 1, 1], cell, cellDough: new Int32Array([-1, -1, -1, -1]) }
  }
  const boxes = instances.map((d) => doughBounds(d))
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const b of boxes) {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], b.min[i])
      max[i] = Math.max(max[i], b.max[i])
    }
  }
  const dim: [number, number, number] = [
    Math.max(1, Math.ceil((max[0] - min[0]) / cell)),
    Math.max(1, Math.ceil((max[1] - min[1]) / cell)),
    Math.max(1, Math.ceil((max[2] - min[2]) / cell)),
  ]
  const total = dim[0] * dim[1] * dim[2]
  const cellDough = new Int32Array(total * MAX_PER_CELL).fill(-1)
  const counts = new Uint8Array(total)
  instances.forEach((_d, di) => {
    const b = boxes[di]
    const i0 = clampIdx(Math.floor((b.min[0] - min[0]) / cell), dim[0])
    const i1 = clampIdx(Math.floor((b.max[0] - min[0]) / cell), dim[0])
    const j0 = clampIdx(Math.floor((b.min[1] - min[1]) / cell), dim[1])
    const j1 = clampIdx(Math.floor((b.max[1] - min[1]) / cell), dim[1])
    const k0 = clampIdx(Math.floor((b.min[2] - min[2]) / cell), dim[2])
    const k1 = clampIdx(Math.floor((b.max[2] - min[2]) / cell), dim[2])
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        for (let k = k0; k <= k1; k++) {
          const idx = i + dim[0] * (j + dim[1] * k)
          if (counts[idx] < MAX_PER_CELL) {
            cellDough[idx * MAX_PER_CELL + counts[idx]] = di
            counts[idx]++
          }
        }
      }
    }
  })
  return { min, dim, cell, cellDough }
}

function clampIdx(v: number, n: number): number {
  return Math.max(0, Math.min(n - 1, v))
}
