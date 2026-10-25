import { describe, it, expect, vi } from 'vite-plus/test'

import { latestTarget } from '../client/model'
const page = (items, extra = {}) => ({
  entries: items.map(item => ({ item })),
  error: null,
  epoch: 'epoch-1',
  hasOlder: false,
  startCursor: null,
  agent: { capabilities: { supportsRewindConversation: true } },
  ...extra,
})
const user = id => ({ type: 'user_message', messageId: id, text: id })
describe('native rewind target', () => {
  it('uses the latest user message, keeping Codex files', async () => {
    const result = await latestTarget({
      refetch: vi
        .fn()
        .mockResolvedValue(page([user('old'), user('latest'), { type: 'assistant_message' }])),
    })
    expect(result).toEqual({
      messageId: 'latest',
      text: 'latest',
      epoch: 'epoch-1',
      mode: 'conversation',
    })
  })
  it('chooses both only when the provider supports it', async () => {
    expect(
      (
        await latestTarget({
          refetch: vi.fn().mockResolvedValue(
            page([user('latest')], {
              agent: { capabilities: { supportsRewindBoth: true } },
            })
          ),
        })
      ).mode
    ).toBe('both')
  })
  it('finds a user message beyond the loaded tail', async () => {
    const refetch = vi
      .fn()
      .mockResolvedValueOnce(
        page([{ type: 'assistant_message' }], {
          hasOlder: true,
          startCursor: { epoch: 'epoch-1', seq: 100 },
        })
      )
      .mockResolvedValueOnce(page([user('target')]))
    expect((await latestTarget({ refetch })).messageId).toBe('target')
    expect(refetch).toHaveBeenLastCalledWith({
      direction: 'before',
      limit: 100,
      cursor: { epoch: 'epoch-1', seq: 100 },
    })
  })
  it('refuses an unacknowledged latest message rather than rewinding an older one', async () => {
    await expect(
      latestTarget({
        refetch: vi.fn().mockResolvedValue(page([user('old'), { type: 'user_message' }])),
      })
    ).rejects.toThrow('identifiant')
  })
  it('refuses unsupported providers and timeline errors', async () => {
    await expect(
      latestTarget({
        refetch: vi.fn().mockResolvedValue(page([user('id')], { agent: { capabilities: {} } })),
      })
    ).rejects.toThrow('ne prend pas en charge')
    await expect(
      latestTarget({ refetch: vi.fn().mockResolvedValue(page([], { error: 'offline' })) })
    ).rejects.toThrow('offline')
  })
  it('refuses history replaced while paging', async () => {
    const refetch = vi
      .fn()
      .mockResolvedValueOnce(
        page([], { hasOlder: true, startCursor: { epoch: 'epoch-1', seq: 100 } })
      )
      .mockResolvedValueOnce(page([user('id')], { epoch: 'epoch-2' }))
    await expect(latestTarget({ refetch })).rejects.toThrow('conversation a changé')
  })
})
