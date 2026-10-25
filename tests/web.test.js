import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { LAUNCHER_TITLE } from '../client/model'
import {
  watchShortcut,
  paneFor,
  hideLauncher,
  suppressLauncherTooltips,
  nativeRewind,
} from '../client/web'
import { Platform } from './react-native'
let cleanup = []
const fixture = id =>
  `<section id="pane-${id}"><div data-testid="agent-chat-scroll"><div data-message-id="old"><div data-testid="user-message"><button data-testid="rewind-menu-trigger">old</button></div></div><div data-message-id="latest"><div data-testid="user-message"><button data-testid="rewind-menu-trigger">latest</button></div></div></div><div><span data-testid="paseo-rewind-${id}"></span></div><textarea data-composer-input></textarea></section>`
const key = (input, options = {}) => {
  const event = new KeyboardEvent('keydown', {
    key: 'ArrowUp',
    bubbles: true,
    cancelable: true,
    ...options,
  })
  input.dispatchEvent(event)
  return event
}
beforeEach(() => {
  document.body.innerHTML = fixture('a') + fixture('b')
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 100,
    height: 100,
  })
})
afterEach(() => {
  cleanup.forEach(fn => fn())
  cleanup = []
  vi.useRealTimers()
  vi.restoreAllMocks()
  Platform.OS = 'web'
  document.body.innerHTML = ''
})
describe('composer shortcut', () => {
  it('targets the focused conversation with several panes open', () => {
    const a = vi.fn()
    const b = vi.fn()
    cleanup.push(watchShortcut('a', a), watchShortcut('b', b))
    const input = document.querySelector('#pane-b textarea')
    input.focus()
    expect(key(input).defaultPrevented).toBe(true)
    expect(a).not.toHaveBeenCalled()
    expect(b).toHaveBeenCalledWith(document.querySelector('#pane-b'))
  })
  it.each([
    { shiftKey: true },
    { ctrlKey: true },
    { metaKey: true },
    { altKey: true },
    { repeat: true },
    { isComposing: true },
  ])('preserves modified/repeated/composition keys %j', options => {
    const open = vi.fn()
    cleanup.push(watchShortcut('a', open))
    expect(key(document.querySelector('textarea'), options).defaultPrevented).toBe(false)
    expect(open).not.toHaveBeenCalled()
  })
  it('preserves text navigation, other inputs, autocomplete and existing dialogs', () => {
    const open = vi.fn()
    cleanup.push(watchShortcut('a', open))
    const input = document.querySelector('textarea')
    input.value = 'draft'
    key(input)
    input.value = ''
    const other = document.createElement('input')
    document.body.append(other)
    key(other)
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    document.body.append(dialog)
    key(input)
    dialog.setAttribute('role', 'listbox')
    key(input)
    expect(open).not.toHaveBeenCalled()
  })
  it('unregisters listeners and remains inactive on native', () => {
    const open = vi.fn()
    const remove = watchShortcut('a', open)
    remove()
    key(document.querySelector('textarea'))
    Platform.OS = 'ios'
    cleanup.push(watchShortcut('a', open))
    key(document.querySelector('textarea'))
    expect(open).not.toHaveBeenCalled()
  })
  it('works with a hidden launcher but refuses hidden conversations', () => {
    const anchor = document.querySelector('[data-testid="paseo-rewind-a"]')
    Object.defineProperty(anchor, 'getBoundingClientRect', {
      value: () => ({ width: 0, height: 0 }),
    })
    const pane = document.querySelector('#pane-a')
    const input = pane.querySelector('textarea')
    expect(paneFor('a', input)).toBe(pane)
    Object.defineProperty(pane, 'getBoundingClientRect', { value: () => ({ width: 0, height: 0 }) })
    expect(paneFor('a', input)).toBeNull()
  })
  it('hides only the plugin launcher and restores it on cleanup', () => {
    const anchor = document.querySelector('[data-testid="paseo-rewind-a"]')
    const button = document.createElement('button')
    anchor.replaceWith(button)
    button.append(anchor)
    const remove = hideLauncher('a')
    expect(button.style.display).toBe('none')
    expect(document.querySelector('[data-testid="rewind-menu-trigger"]').style.display).toBe('')
    remove()
    expect(button.style.display).toBe('')
  })
})
describe('native action', () => {
  it.each(['both', 'conversation'])(
    'clicks only the exact latest message and %s action',
    async mode => {
      vi.useFakeTimers()
      const pane = document.querySelector('#pane-b')
      const triggers = [...pane.querySelectorAll('[data-testid="rewind-menu-trigger"]')]
      const old = vi.fn()
      const selected = vi.fn()
      triggers[0].addEventListener('click', old)
      triggers[1].addEventListener('click', () => {
        const menu = document.createElement('div')
        menu.setAttribute('data-testid', 'rewind-menu-content')
        menu.innerHTML = `<button data-testid="rewind-menu-${mode}"></button>`
        menu.firstChild.addEventListener('click', selected)
        document.body.append(menu)
      })
      const done = nativeRewind(pane, 'latest', mode)
      await vi.runAllTimersAsync()
      await done
      expect(old).not.toHaveBeenCalled()
      expect(selected).toHaveBeenCalledTimes(1)
    }
  )
  it('refuses unavailable target messages without clicking an older one', async () => {
    const pane = document.querySelector('#pane-a')
    const clicked = vi.fn()
    pane.addEventListener('click', clicked)
    await expect(nativeRewind(pane, 'missing', 'both')).rejects.toThrow('indisponible')
    expect(clicked).not.toHaveBeenCalled()
  })
  it('does not use an already open rewind menu', async () => {
    const menu = document.createElement('div')
    menu.setAttribute('data-testid', 'rewind-menu-content')
    document.body.append(menu)
    await expect(nativeRewind(document.querySelector('#pane-a'), 'latest', 'both')).rejects.toThrow(
      'déjà ouvert'
    )
  })
  it('loads a virtualized target before invoking its native action', async () => {
    vi.useFakeTimers()
    const pane = document.querySelector('#pane-a')
    const scroll = pane.querySelector('[data-testid="agent-chat-scroll"]')
    pane.querySelector('[data-message-id="latest"]').remove()
    Object.defineProperties(scroll, { scrollHeight: { value: 2000 }, clientHeight: { value: 500 } })
    const selected = vi.fn()
    scroll.addEventListener('scroll', () => {
      if (scroll.scrollTop > 500 || pane.querySelector('[data-message-id="latest"]')) return
      const row = document.createElement('div')
      row.setAttribute('data-message-id', 'latest')
      row.innerHTML =
        '<div data-testid="user-message"><button data-testid="rewind-menu-trigger"></button></div>'
      row.querySelector('button').addEventListener('click', () => {
        const action = document.createElement('button')
        action.setAttribute('data-testid', 'rewind-menu-both')
        action.addEventListener('click', selected)
        document.body.append(action)
      })
      scroll.prepend(row)
    })
    const done = nativeRewind(pane, 'latest', 'both')
    await vi.runAllTimersAsync()
    await done
    expect(selected).toHaveBeenCalledTimes(1)
  })
})

describe('portaled launcher tooltips', () => {
  const tooltip = text => {
    const element = document.createElement('div')
    element.setAttribute('role', 'tooltip')
    element.textContent = text
    document.body.append(element)
    return element
  }
  const flushObserver = async () => {
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  it('hides existing and recreated launcher tooltips without hiding other tooltips', async () => {
    const stale = tooltip(LAUNCHER_TITLE)
    const unrelated = tooltip('New workspace')
    cleanup.push(suppressLauncherTooltips())
    expect(getComputedStyle(stale).display).toBe('none')
    stale.remove()
    const recreated = tooltip(LAUNCHER_TITLE)
    await flushObserver()
    expect(getComputedStyle(recreated).display).toBe('none')
    expect(getComputedStyle(unrelated).display).not.toBe('none')
    // A host style update must not reveal the tooltip again.
    recreated.style.display = 'flex'
    expect(recreated.getAttribute('data-paseo-rewind-tooltip')).toBe('')
    expect(document.head.textContent).toContain('display: none !important')
  })
  it('handles text populated after insertion and restores a reused unrelated tooltip', async () => {
    cleanup.push(suppressLauncherTooltips())
    const reused = tooltip('')
    await flushObserver()
    reused.textContent = LAUNCHER_TITLE
    await flushObserver()
    expect(getComputedStyle(reused).display).toBe('none')
    reused.firstChild.data = 'Another tooltip'
    await flushObserver()
    expect(getComputedStyle(reused).display).not.toBe('none')
  })
  it('disconnects and removes the targeted CSS on plugin teardown', async () => {
    const remove = suppressLauncherTooltips()
    const current = tooltip(LAUNCHER_TITLE)
    await flushObserver()
    expect(getComputedStyle(current).display).toBe('none')
    remove()
    expect(current.hasAttribute('data-paseo-rewind-tooltip')).toBe(false)
    const later = tooltip(LAUNCHER_TITLE)
    await flushObserver()
    expect(getComputedStyle(later).display).not.toBe('none')
  })
})
