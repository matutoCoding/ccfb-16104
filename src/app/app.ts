// 应用外壳与页面路由
import { h } from './dom'
import { store } from './store'
import { recipesPage } from './pages/recipes_page'
import { traysPage } from './pages/trays_page'
import { layoutPage } from './pages/layout_page'
import { simulationPage } from './pages/simulation_page'
import { inspectionPage } from './pages/inspection_page'
import { sweepPage } from './pages/sweep_page'
import { settingsPage } from './pages/settings_page'

type Route = 'recipes' | 'trays' | 'layout' | 'simulation' | 'inspection' | 'sweep' | 'settings'

const ROUTES: [Route, string][] = [
  ['recipes', '产品配方'],
  ['trays', '盘型'],
  ['layout', '摆盘编辑'],
  ['simulation', '膨胀推演'],
  ['inspection', '出炉检查'],
  ['sweep', '容量试摆'],
  ['settings', '设置'],
]

const PAGE_FACTORIES: Record<Route, (el: HTMLElement) => () => void> = {
  recipes: recipesPage,
  trays: traysPage,
  layout: layoutPage,
  simulation: simulationPage,
  inspection: inspectionPage,
  sweep: sweepPage,
  settings: settingsPage,
}

export async function mountApp(root: HTMLElement): Promise<void> {
  await store.init()
  let route: Route = (location.hash.replace('#', '') as Route) || 'layout'
  if (!ROUTES.some(([r]) => r === route)) route = 'layout'
  let disposePage: (() => void) | null = null

  const nav = h('nav', { class: 'nav' }, ...ROUTES.map(([r, label]) =>
    h('button', {
      class: `nav-item ${r === route ? 'active' : ''}`,
      onClick: () => { if (r !== route) { location.hash = r } },
    }, label),
  ))

  const main = h('main', { class: 'app-main' })
  const header = h('header', { class: 'app-header' },
    h('h1', { class: 'app-title' }, '整盘摆盘', h('span', { class: 'accent' }, '膨胀推演台')),
    nav,
  )
  root.append(header, main)

  const open = (r: Route) => {
    disposePage?.()
    main.replaceChildren()
    nav.querySelectorAll('.nav-item').forEach((el, i) => el.classList.toggle('active', ROUTES[i][0] === r))
    const page = h('div', { class: 'page' })
    main.append(page)
    disposePage = PAGE_FACTORIES[r](page)
  }

  window.addEventListener('hashchange', () => {
    const r = location.hash.replace('#', '') as Route
    if (ROUTES.some(([x]) => x === r)) { route = r; open(r) }
  })

  open(route)
}
