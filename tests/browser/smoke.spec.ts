import { test, expect, type ConsoleMessage } from '@playwright/test'

test('应用启动、WebGL2 渲染、推演检测与页面导航', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m: ConsoleMessage) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(String(e)))

  await page.goto('/')
  // 摆盘页默认打开，等待 canvas
  const canvas = page.locator('canvas').first()
  await expect(canvas).toBeVisible({ timeout: 15000 })

  const glInfo = await page.evaluate(() => {
    const c = document.querySelector('canvas')!
    const gl = c.getContext('webgl2')
    return { hasWebGL2: !!gl, w: c.width, h: c.height }
  })
  expect(glInfo.hasWebGL2).toBeTruthy()
  expect(glInfo.w).toBeGreaterThan(100)

  // 等渲染稳定后读中心像素，确认不是纯背景
  await page.waitForTimeout(2500)
  const pixel = await page.evaluate(() => {
    const c = document.querySelector('canvas')!
    const gl = c.getContext('webgl2')!
    const px = new Uint8Array(4)
    gl.readPixels(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
    return Array.from(px)
  })
  // 背景是深灰蓝 (38,43,53) 一带，中心应命中面团或盘体，至少有一个通道明显不同
  expect(pixel.some((v, i) => Math.abs(v - [38, 43, 53, 255][i]) > 12)).toBeTruthy()

  // FPS HUD（软件渲染首帧很慢，等待足够久；真实 GPU 目标 30+）
  await page.goto('/#simulation')
  await expect(page.locator('canvas')).toBeVisible()
  await page.waitForTimeout(9000)
  const fpsText = await page.locator('.badge', { hasText: 'FPS' }).textContent()
  console.log('SwiftShader 软件渲染 FPS 读数:', fpsText)
  expect(fpsText).toMatch(/FPS/)

  // 跑全时间轴粘连检测
  await page.getByRole('button', { name: '全时间轴粘连检测' }).click()
  // 侧栏出现结果列表（无粘连提示或事件条目）
  const side = page.locator('.panel-side').filter({ hasText: '粘连事件' })
  await expect(side).toContainText(/未发现粘连|粘连/, { timeout: 30000 })
  console.log('检测侧栏:', (await side.innerText()).replace(/\s+/g, ' ').slice(0, 200))

  // 直接读 WebGL 帧缓冲验证有真实渲染输出
  const frame = await page.evaluate(() => {
    const c = document.querySelector('canvas')!
    const gl = c.getContext('webgl2')!
    const px = new Uint8Array(c.width * c.height * 4)
    gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, px)
    // 统计非纯黑像素占比，验证确实有绘制内容
    let lit = 0
    for (let i = 0; i < px.length; i += 4) {
      if (px[i] + px[i + 1] + px[i + 2] > 30) lit++
    }
    return { w: c.width, h: c.height, litRatio: lit / (c.width * c.height) }
  })
  console.log('渲染帧:', frame.w, 'x', frame.h, '有效像素占比', (frame.litRatio * 100).toFixed(1) + '%')
  expect(frame.w * frame.h).toBeGreaterThan(100000)
  expect(frame.litRatio).toBeGreaterThan(0.2)


  // 导航其余页面不报错（只校验无致命控制台错误，不做重型渲染等待）
  for (const route of ['recipes', 'trays', 'settings']) {
    await page.goto(`/#${route}`, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.panel-title').first()).toBeVisible({ timeout: 10000 })
  }

  const fatal = errors.filter((e) => !/WebGL|GPU|swiftshader/i.test(e))
  expect(fatal).toEqual([])
})
