import { Platform } from 'react-native'

import { LAUNCHER_TITLE, type RewindMode } from './model'

// Browser APIs stay in this guarded module; the plugin does not use private React state.
export interface ElementLike {
  addEventListener(
    type: string,
    handler: (event: { stopImmediatePropagation(): void }) => void,
    capture: boolean
  ): void
  appendChild(child: ElementLike): void
  click(): void
  clientHeight: number
  closest(selector: string): ElementLike | null
  contains(node: ElementLike): boolean
  dispatchEvent(event: unknown): boolean
  focus(): void
  getAttribute(name: string): string | null
  getBoundingClientRect(): { width: number; height: number }
  isConnected: boolean
  parentElement: ElementLike | null
  querySelector(selector: string): ElementLike | null
  querySelectorAll(selector: string): ArrayLike<ElementLike>
  remove(): void
  removeAttribute(name: string): void
  removeEventListener(
    type: string,
    handler: (event: { stopImmediatePropagation(): void }) => void,
    capture: boolean
  ): void
  scrollHeight: number
  scrollTop: number
  setAttribute(name: string, value: string): void
  style: { display: string; pointerEvents: string }
  textContent: string | null
  value?: string
}
interface KeyEvent {
  altKey: boolean
  ctrlKey: boolean
  defaultPrevented: boolean
  isComposing: boolean
  key: string
  metaKey: boolean
  preventDefault(): void
  repeat: boolean
  shiftKey: boolean
  stopImmediatePropagation(): void
  target: ElementLike | null
}
declare const document: {
  activeElement: ElementLike | null
  documentElement: ElementLike
  head: ElementLike
  createElement(tagName: string): ElementLike
  querySelector(selector: string): ElementLike | null
  querySelectorAll(selector: string): ArrayLike<ElementLike>
  addEventListener(type: string, handler: (event: KeyEvent) => void, capture: boolean): void
  removeEventListener(type: string, handler: (event: KeyEvent) => void, capture: boolean): void
}
declare const MutationObserver: new (callback: () => void) => {
  observe(
    target: ElementLike,
    options: {
      subtree: boolean
      childList: boolean
      characterData: boolean
      attributes: boolean
      attributeFilter: string[]
    }
  ): void
  disconnect(): void
}
declare const Event: new (name: string, options?: { bubbles?: boolean }) => unknown

const composerSelector = '[data-composer-input]'
export const marker = (agentId: string) => `paseo-rewind-${agentId}`
const visible = (element: ElementLike) => {
  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

export function paneFor(agentId: string, start?: ElementLike | null): ElementLike | null {
  if (Platform.OS !== 'web') return null
  const anchors = Array.from(document.querySelectorAll(`[data-testid="${marker(agentId)}"]`))
  const input = start ?? document.activeElement
  if (!input) return null
  for (let parent = input.parentElement; parent; parent = parent.parentElement) {
    if (anchors.some(anchor => parent.contains(anchor))) {
      // Refuse a common ancestor containing more than one conversation.
      if (parent.querySelectorAll('[data-testid="agent-chat-scroll"]').length !== 1) continue
      if (parent.querySelectorAll('[data-testid^="paseo-rewind-"]').length !== 1) return null
      return visible(parent) ? parent : null
    }
  }
  return null
}

export function watchShortcut(agentId: string, open: (pane: ElementLike) => void): () => void {
  if (Platform.OS !== 'web') return () => {}
  const handler = (event: KeyEvent) => {
    if (
      event.key !== 'ArrowUp' ||
      event.defaultPrevented ||
      event.repeat ||
      event.isComposing ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    )
      return
    if (document.querySelector('[role="dialog"], [role="menu"], [role="listbox"]')) return
    const input = event.target?.closest(composerSelector)
    if (!input || (input.value ?? input.textContent ?? '').length !== 0) return
    const pane = paneFor(agentId, input)
    if (!pane || pane.querySelector('[data-testid="composer-attachment-tray"]')) return
    event.preventDefault()
    event.stopImmediatePropagation()
    open(pane)
  }
  document.addEventListener('keydown', handler, true)
  return () => document.removeEventListener('keydown', handler, true)
}

// Paseo mounts per-agent plugin controllers through composer contributions.
// Keep that host mounted, but remove its launcher from layout and keyboard navigation.
export function hideLauncher(agentId: string): () => void {
  if (Platform.OS !== 'web') return () => {}
  const anchor = document.querySelector(`[data-testid="${marker(agentId)}"]`)
  const button = anchor?.closest('[role="button"], button')
  if (!button) return () => {}
  const previous = {
    display: button.style.display,
    pointerEvents: button.style.pointerEvents,
    inert: button.getAttribute('inert'),
  }
  button.style.pointerEvents = 'none'
  button.setAttribute('inert', '')
  button.style.display = 'none'
  return () => {
    button.style.display = previous.display
    button.style.pointerEvents = previous.pointerEvents
    if (previous.inert === null) button.removeAttribute('inert')
    else button.setAttribute('inert', previous.inert)
  }
}

// Paseo portals tooltips outside the hidden launcher and can recreate them on
// keyboard focus restoration. Suppress only this plugin's exact tooltip text.
export function suppressLauncherTooltips(): () => void {
  if (Platform.OS !== 'web') return () => {}
  const attribute = 'data-paseo-rewind-tooltip'
  const style = document.createElement('style')
  style.textContent = `[role="tooltip"][${attribute}] { display: none !important; }`
  document.head.appendChild(style)
  const marked = new Set<ElementLike>()
  const update = () => {
    for (const tooltip of marked) {
      if (!tooltip.isConnected || tooltip.textContent?.trim() !== LAUNCHER_TITLE) {
        tooltip.removeAttribute(attribute)
        marked.delete(tooltip)
      }
    }
    for (const tooltip of Array.from(document.querySelectorAll('[role="tooltip"]'))) {
      if (tooltip.textContent?.trim() === LAUNCHER_TITLE) {
        tooltip.setAttribute(attribute, '')
        marked.add(tooltip)
      }
    }
  }
  const observer = new MutationObserver(update)
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['role'],
  })
  update()
  return () => {
    observer.disconnect()
    for (const tooltip of marked) tooltip.removeAttribute(attribute)
    marked.clear()
    style.remove()
  }
}

export function focusConfirmationButton(element: unknown): void {
  if (Platform.OS !== 'web' || !element) return
  const button = element as Partial<ElementLike>
  if (typeof button.focus === 'function') button.focus()
}

export function focusComposer(pane: ElementLike): void {
  if (Platform.OS === 'web' && pane.isConnected) pane.querySelector(composerSelector)?.focus()
}

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
function messageRow(pane: ElementLike, messageId: string): ElementLike | undefined {
  return Array.from(pane.querySelectorAll('[data-message-id]')).find(
    row =>
      row.getAttribute('data-message-id') === messageId &&
      !!row.querySelector('[data-testid="user-message"]')
  )
}

export async function nativeRewind(
  pane: ElementLike,
  messageId: string,
  mode: RewindMode
): Promise<void> {
  if (Platform.OS !== 'web' || !pane.isConnected)
    throw new Error('La conversation n’est plus affichée.')
  const scroll = pane.querySelector('[data-testid="agent-chat-scroll"]')
  if (!scroll) throw new Error('L’interface de Paseo a changé : historique introuvable.')
  const originalScroll = scroll.scrollTop
  let row = messageRow(pane, messageId)
  // History is virtualized. Walk backwards from the end instead of choosing the last mounted row.
  if (!row) {
    scroll.scrollTop = scroll.scrollHeight
    scroll.dispatchEvent(new Event('scroll', { bubbles: true }))
    await delay(100)
    for (let step = 0; step < 100 && pane.isConnected; step++) {
      row = messageRow(pane, messageId)
      if (row || scroll.scrollTop <= 0) break
      scroll.scrollTop = Math.max(0, scroll.scrollTop - Math.max(200, scroll.clientHeight * 0.8))
      scroll.dispatchEvent(new Event('scroll', { bubbles: true }))
      await delay(50)
    }
    row ??= messageRow(pane, messageId)
  }
  const trigger = row?.querySelector('[data-testid="rewind-menu-trigger"]')
  if (!trigger) {
    scroll.scrollTop = originalScroll
    throw new Error(
      'Le bouton Rewind du dernier message est indisponible. Aucun retour arrière effectué.'
    )
  }
  if (document.querySelector('[data-testid="rewind-menu-content"]')) {
    throw new Error('Ferme le menu Rewind déjà ouvert, puis réessaie.')
  }
  trigger.click()
  let action: ElementLike | null = null
  for (let attempt = 0; attempt < 20; attempt++) {
    await delay(25)
    action = document.querySelector(`[data-testid="rewind-menu-${mode}"]`)
    if (action) break
  }
  if (!action || action.getAttribute('aria-disabled') === 'true') {
    throw new Error('L’action Rewind demandée est indisponible. Aucun retour arrière effectué.')
  }
  action.click()
}
