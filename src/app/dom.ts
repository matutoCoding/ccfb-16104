// 极简 DOM 构造工具，零框架
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number | boolean | EventListener | undefined> = {},
  ...children: (Node | string | undefined | null | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue
    if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v as EventListener)
    } else if (k === 'class') {
      el.className = String(v)
    } else {
      el.setAttribute(k, String(v))
    }
  }
  for (const c of children) {
    if (c === undefined || c === null || c === false) continue
    el.append(typeof c === 'string' ? document.createTextNode(c) : c)
  }
  return el
}

export function clear(el: HTMLElement): void {
  el.replaceChildren()
}

export function field(label: string, input: HTMLElement, hint?: string): HTMLElement {
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input, hint ? h('small', { class: 'field-hint' }, hint) : '')
}

export function numInput(value: number, step: number, min: number, max: number, onInput: (v: number) => void): HTMLInputElement {
  const el = h('input', { class: 'input', type: 'number', step, min, max, value }) as HTMLInputElement
  el.addEventListener('input', () => {
    const v = Number(el.value)
    if (Number.isFinite(v)) onInput(v)
  })
  return el
}

export function textInput(value: string, onInput: (v: string) => void): HTMLInputElement {
  const el = h('input', { class: 'input', type: 'text', value }) as HTMLInputElement
  el.addEventListener('input', () => onInput(el.value))
  return el
}

export function selectInput<T extends string>(value: T, options: [T, string][], onInput: (v: T) => void): HTMLSelectElement {
  const el = h('select', { class: 'input' }, ...options.map(([v, label]) => h('option', { value: v, selected: v === value }, label))) as HTMLSelectElement
  el.addEventListener('change', () => onInput(el.value as T))
  return el
}

export function button(label: string, variant: 'primary' | 'ghost' | 'danger', onClick: EventListener): HTMLButtonElement {
  return h('button', { class: `btn btn-${variant}`, onClick }, label)
}

export function badge(text: string, tone: 'neutral' | 'danger' | 'success' | 'warning' = 'neutral'): HTMLElement {
  return h('span', { class: `badge badge-${tone}` }, text)
}

export function emptyState(title: string, subtitle: string): HTMLElement {
  return h('div', { class: 'empty-state' },
    h('div', { class: 'empty-icon' }, '▢'),
    h('h3', {}, title),
    h('p', {}, subtitle),
  )
}
