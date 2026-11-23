// WebGL2 渲染器：隐式曲面光线步进，数据经浮点纹理传入片元着色器
import { FRAG, VERT } from './shaders'
import { viewMatrix, type OrbitCamera } from './camera'
import type { Tray } from '../types'
import type { DoughInstance } from '../sim/instance'
import { cutOpenFactor } from '../sim/growth'
import { buildGrid, type AccelGrid } from './grid_builder'

const TEX_W = 256
const TEX_NAMES = ['uBalls', 'uBallMeta', 'uDough', 'uCuts', 'uMarkers', 'uGrid'] as const

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh)
    gl.deleteShader(sh)
    throw new Error(`着色器编译失败: ${log}`)
  }
  return sh
}

export interface RenderScene {
  instances: DoughInstance[]
  tray: Tray
  markers: [number, number, number][]
  bakeU: number
  ovenTemp: number
  topHeat: number
  bottomHeat: number
  hydration: number
}

export class Renderer {
  gl: WebGL2RenderingContext
  program: WebGLProgram
  uniforms = new Map<string, WebGLUniformLocation | null>()
  textures: Record<string, WebGLTexture> = {}
  cam: OrbitCamera
  rayScale = 1
  maxSteps = 96
  fps = 0
  private frameTimes: number[] = []
  private lastT = 0
  private raf = 0
  private scene: RenderScene | null = null
  private grid: AccelGrid | null = null
  private dirty = true

  constructor(canvas: HTMLCanvasElement, cam: OrbitCamera) {
    const gl = canvas.getContext('webgl2', {
      antialias: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    })
    if (!gl) throw new Error('当前浏览器不支持 WebGL2')
    this.gl = gl
    this.cam = cam
    const vs = compile(gl, gl.VERTEX_SHADER, VERT)
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const prog = gl.createProgram()!
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(`程序链接失败: ${gl.getProgramInfoLog(prog)}`)
    }
    this.program = prog
    gl.useProgram(prog)
    const names = [
      'uRes', 'uCamPos', 'uCamRot', 'uFov', 'uBalls', 'uBallMeta', 'uBallCount',
      'uDough', 'uDoughCount', 'uCuts', 'uCutCount', 'uMarkers', 'uMarkerCount',
      'uGrid', 'uGridMin', 'uGridDim', 'uCellSize',
      'uTray', 'uBakeU', 'uOvenTemp', 'uHeat', 'uHydration', 'uMaxSteps', 'uLightDir',
    ]
    for (const n of names) this.uniforms.set(n, gl.getUniformLocation(prog, n))
    const vao = gl.createVertexArray()
    gl.bindVertexArray(vao)
    const vbo = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    for (const [i, name] of TEX_NAMES.entries()) {
      const tex = gl.createTexture()!
      gl.activeTexture(gl.TEXTURE0 + i)
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      this.textures[name] = tex
      gl.uniform1i(this.u(name), i)
    }
  }

  private u(name: string): WebGLUniformLocation | null {
    return this.uniforms.get(name) ?? null
  }

  private ui(name: string, v: number): void {
    this.gl.uniform1i(this.u(name), v)
  }

  // 把场景数据拍平到浮点纹理
  private upload(scene: RenderScene): void {
    const balls: number[] = []
    const meta: number[] = []
    const doughRows: number[] = []
    const cutRows: number[] = []
    scene.instances.forEach((d, di) => {
      // 球数据保持模板本地坐标，由着色器按面团缩放换算
      for (const b of d.tpl.balls) {
        balls.push(b.c[0], b.c[1], b.c[2], b.r)
        meta.push(di, d.tpl.blendK, 0, 0)
      }
      const open = cutOpenFactor(d.bakeTime, d.bakeDuration)
      doughRows.push(d.pos[0], d.pos[1], d.pos[2], d.rotRad)
      doughRows.push(d.r0, d.rH, d.rV, open)
      for (const cut of d.cuts) {
        cutRows.push(cut.center[0], cut.center[1], cut.center[2], cut.angle)
        cutRows.push(cut.half[0], cut.half[1], cut.half[2], cut.depth)
        cutRows.push(di, 0, 0, 0)
      }
    })
    const markers = scene.markers.flatMap((m) => [m[0], m[1], m[2], 0])
    this.grid = buildGrid(scene.instances)
    this.uploadTex('uBalls', balls)
    this.uploadTex('uBallMeta', meta)
    this.uploadTex('uDough', doughRows)
    this.uploadTex('uCuts', cutRows)
    this.uploadTex('uMarkers', markers)
    this.uploadGrid(this.grid)
    this.ui('uBallCount', balls.length / 4)
    this.ui('uDoughCount', scene.instances.length)
    this.ui('uCutCount', cutRows.length / 4 / 3)
    this.ui('uMarkerCount', scene.markers.length)
  }

  private uploadGrid(grid: AccelGrid): void {
    const gl = this.gl
    const rows = Math.max(1, Math.ceil(grid.cellDough.length / 4 / TEX_W))
    const buf = new Int32Array(rows * TEX_W * 4).fill(-1)
    buf.set(grid.cellDough)
    gl.activeTexture(gl.TEXTURE0 + TEX_NAMES.indexOf('uGrid'))
    gl.bindTexture(gl.TEXTURE_2D, this.textures.uGrid)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32I, TEX_W, rows, 0, gl.RGBA_INTEGER, gl.INT, buf)
  }

  private uploadTex(name: (typeof TEX_NAMES)[number], data: number[]): void {
    const gl = this.gl
    const rows = Math.max(1, Math.ceil(data.length / 4 / TEX_W))
    const buf = new Float32Array(rows * TEX_W * 4)
    buf.set(data)
    gl.activeTexture(gl.TEXTURE0 + TEX_NAMES.indexOf(name))
    gl.bindTexture(gl.TEXTURE_2D, this.textures[name])
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, TEX_W, rows, 0, gl.RGBA, gl.FLOAT, buf)
  }

  setScene(scene: RenderScene): void {
    this.scene = scene
    this.dirty = true
  }

  markDirty(): void {
    this.dirty = true
  }

  private renderFrame = (): void => {
    this.raf = requestAnimationFrame(this.renderFrame)
    const canvas = this.gl.canvas as HTMLCanvasElement
    const w = Math.max(2, Math.floor(canvas.clientWidth * this.rayScale * (devicePixelRatio || 1)))
    const h = Math.max(2, Math.floor(canvas.clientHeight * this.rayScale * (devicePixelRatio || 1)))
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
      this.dirty = true
    }
    if (!this.scene) return
    if (this.dirty) {
      this.upload(this.scene)
      this.dirty = false
    }
    const gl = this.gl
    gl.viewport(0, 0, canvas.width, canvas.height)
    const { pos, rot } = viewMatrix(this.cam)
    gl.uniform2f(this.u('uRes'), canvas.width, canvas.height)
    gl.uniform3f(this.u('uCamPos'), pos[0], pos[1], pos[2])
    gl.uniformMatrix3fv(this.u('uCamRot'), false, rot)
    gl.uniform1f(this.u('uFov'), this.cam.fov)
    gl.uniform4f(this.u('uTray'), this.scene.tray.width / 2, this.scene.tray.depth / 2, this.scene.tray.rimHeight, 0)
    gl.uniform1f(this.u('uBakeU'), this.scene.bakeU)
    gl.uniform1f(this.u('uOvenTemp'), this.scene.ovenTemp)
    gl.uniform2f(this.u('uHeat'), this.scene.topHeat, this.scene.bottomHeat)
    gl.uniform1f(this.u('uHydration'), this.scene.hydration)
    gl.uniform1f(this.u('uMaxSteps'), this.maxSteps)
    gl.uniform3f(this.u('uLightDir'), -0.45, 0.82, 0.35)
    if (this.grid) {
      gl.uniform3f(this.u('uGridMin'), this.grid.min[0], this.grid.min[1], this.grid.min[2])
      gl.uniform3f(this.u('uGridDim'), this.grid.dim[0], this.grid.dim[1], this.grid.dim[2])
      gl.uniform1f(this.u('uCellSize'), this.grid.cell)
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    const now = performance.now()
    if (this.lastT > 0) {
      const dt = now - this.lastT
      this.frameTimes.push(dt)
      if (this.frameTimes.length > 40) this.frameTimes.shift()
      // 单帧即可给出瞬时读数，多帧后转为滑动平均
      const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length
      this.fps = 1000 / avg
    }
    this.lastT = now
  }

  start(): void {
    if (!this.raf) this.raf = requestAnimationFrame(this.renderFrame)
  }

  stop(): void {
    cancelAnimationFrame(this.raf)
    this.raf = 0
  }
}
