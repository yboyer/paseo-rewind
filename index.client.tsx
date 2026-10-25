import type { PluginButtonRegistration, PluginClientContext } from '@getpaseo/plugin/client'
import { Platform } from 'react-native'

import { LAUNCHER_TITLE } from './client/model'
import { RewindIcon } from './client/rewind'
import { suppressLauncherTooltips } from './client/web'

export default function contribute(client: PluginClientContext) {
  if (Platform.OS !== 'web') return () => {}
  const restoreTooltips = suppressLauncherTooltips()
  const lifetime = new AbortController()
  const pills = new Map<string, PluginButtonRegistration>()
  const register = (agent: { id: string; workspaceId?: string | null }) => {
    if (lifetime.signal.aborted || !agent.workspaceId || pills.has(agent.id)) return
    pills.set(
      agent.id,
      client.addComposerPill({
        id: 'rewind',
        agentId: agent.id,
        workspaceId: agent.workspaceId,
        button: {
          title: LAUNCHER_TITLE,
          icon: RewindIcon,
          behavior: { kind: 'action', onPress: () => {} },
        },
      })
    )
  }
  const removeAll = () => {
    for (const pill of pills.values()) pill.remove()
    pills.clear()
  }
  void client.paseo.agents
    .list({ subscribe: {}, signal: lifetime.signal })
    .then(({ subscription }) => {
      subscription.subscribe({
        snapshot: ({ entries }) => {
          removeAll()
          for (const { agent } of entries) register(agent)
        },
        update: message => {
          if (message.type !== 'agent_update') return
          if (message.payload.kind === 'upsert') register(message.payload.agent)
          else {
            pills.get(message.payload.agentId)?.remove()
            pills.delete(message.payload.agentId)
          }
        },
      })
    })
    .catch((error: unknown) => {
      if (!lifetime.signal.aborted) console.error('[paseo-rewind]', error)
    })
  return () => {
    lifetime.abort()
    removeAll()
    restoreTooltips()
  }
}
