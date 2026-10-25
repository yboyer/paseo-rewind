import { act, createElement, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { beforeEach, afterEach, expect, it, vi } from 'vite-plus/test'
const mocks = vi.hoisted(() => ({ refetch: vi.fn(), nativeRewind: vi.fn(), error: vi.fn() }))
vi.mock('@getpaseo/plugin/client', () => ({
  usePaseo: () => ({ agents: { ref: () => ({ timeline: { refetch: mocks.refetch } }) } }),
}))
vi.mock('@getpaseo/plugin/client/react-native', () => {
  function Modal({ open, onOpenChange, children }) {
    useEffect(() => {
      if (!open) return
      const listener = event => {
        if (event.key === 'Escape') onOpenChange(false)
      }
      document.addEventListener('keydown', listener)
      return () => document.removeEventListener('keydown', listener)
    }, [open, onOpenChange])
    return open
      ? createPortal(createElement('div', { role: 'dialog' }, children), document.body)
      : null
  }
  Modal.Content = function Content({ children }) {
    return createElement('div', {}, children)
  }
  return { Modal, useToast: () => ({ error: mocks.error }) }
})
vi.mock('../client/web', async importOriginal => ({
  ...(await importOriginal()),
  nativeRewind: mocks.nativeRewind,
}))
import contribute from '../index.client'
let root
let input
let stop
const response = (both = false, id = 'latest') => ({
  entries: [{ item: { type: 'user_message', messageId: id, text: 'Mon dernier message' } }],
  agent: { capabilities: { supportsRewindConversation: true, supportsRewindBoth: both } },
  error: null,
  epoch: 'epoch-1',
  hasOlder: false,
  startCursor: null,
})
beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  mocks.refetch.mockReset().mockResolvedValue(response())
  mocks.error.mockReset()
  mocks.nativeRewind.mockReset().mockResolvedValue(undefined)
  document.body.innerHTML =
    '<section id="pane"><div data-testid="agent-chat-scroll"></div><div id="mount"></div><textarea data-composer-input></textarea></section>'
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 100,
    height: 100,
  })
  root = createRoot(document.querySelector('#mount'))
  input = document.querySelector('textarea')
  // Exercise the actual entrypoint and Paseo's non-empty-label registration contract.
  // Previously, mounting the icon directly missed a rejected contribution entirely.
  await act(async () => {
    stop = contribute({
      paseo: {
        agents: {
          list: async () => ({
            subscription: {
              subscribe: observer =>
                observer.snapshot({ entries: [{ agent: { id: 'a', workspaceId: 'w' } }] }),
            },
          }),
        },
      },
      addComposerPill: ({ button, agentId, workspaceId }) => {
        if (button.label !== undefined && !button.label.trim())
          throw new Error('Plugin button needs label')
        root.render(
          createElement(
            'button',
            { id: 'launcher', role: 'button', type: 'button' },
            createElement(button.icon, {
              context: 'agent',
              agentId,
              workspaceId,
              size: 14,
              color: 'white',
              theme: {
                colors: {
                  foreground: 'white',
                  foregroundMuted: 'gray',
                  surface2: 'black',
                  accent: 'blue',
                  accentForeground: 'white',
                },
              },
            }),
            button.label ?? button.title
          )
        )
        return { remove: () => root.render(null) }
      },
    })
  })
  input.focus()
})
afterEach(async () => {
  await act(async () => {
    stop()
    root.unmount()
  })
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})
const open = async () =>
  act(async () => {
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true })
    )
  })
it('opens the requested confirmation and accurately explains Codex files', async () => {
  await act(async () =>
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true })
    )
  )
  expect(document.querySelector('[role="dialog"]').textContent).toContain('elles seront conservées')
  expect(document.querySelector('[data-testid="paseo-rewind-cancel"]').textContent).toBe(
    'Annuler (Esc)'
  )
  expect(document.querySelector('[data-testid="paseo-rewind-confirm"]').textContent).toBe('Oui')
  expect(mocks.nativeRewind).not.toHaveBeenCalled()
})
it.each(['Escape', 'button'])('cancel via %s does not invoke rewind', async how => {
  await open()
  await act(async () => {
    if (how === 'Escape')
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    else document.querySelector('[data-testid="paseo-rewind-cancel"]').click()
  })
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(mocks.nativeRewind).not.toHaveBeenCalled()
})
it.each([false, true])(
  'confirms only the native mode supported by the agent (both=%s)',
  async both => {
    mocks.refetch.mockResolvedValue(response(both))
    await open()
    await act(async () => {
      document.querySelector('[data-testid="paseo-rewind-confirm"]').click()
      await new Promise(resolve => setTimeout(resolve, 120))
    })
    expect(mocks.nativeRewind).toHaveBeenCalledWith(
      document.querySelector('#pane'),
      'latest',
      both ? 'both' : 'conversation'
    )
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  }
)
it('refuses confirmation when a new user message has arrived', async () => {
  await open()
  mocks.refetch.mockResolvedValue(response(false, 'newer'))
  await act(async () => {
    document.querySelector('[data-testid="paseo-rewind-confirm"]').click()
  })
  expect(mocks.nativeRewind).not.toHaveBeenCalled()
  expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining('conversation a changé'))
})

it('hides the launcher while retaining the shortcut and confirmation', async () => {
  expect(document.querySelector('#launcher').style.display).toBe('none')
  await open()
  expect(document.querySelector('[role="dialog"]')).not.toBeNull()
})

it('focuses Oui on every opening without executing the rewind', async () => {
  await open()
  expect(document.activeElement).toBe(
    document.querySelector('[data-testid="paseo-rewind-confirm"]')
  )
  expect(mocks.nativeRewind).not.toHaveBeenCalled()
  await act(async () =>
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  )
  await open()
  expect(document.activeElement).toBe(
    document.querySelector('[data-testid="paseo-rewind-confirm"]')
  )
  expect(mocks.nativeRewind).not.toHaveBeenCalled()
})
