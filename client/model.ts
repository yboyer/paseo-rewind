export const LAUNCHER_TITLE = 'Retour au dernier message (↑ dans le champ vide)'
export type RewindMode = 'both' | 'conversation'
export interface Target {
  epoch: string
  messageId: string
  mode: RewindMode
  text: string
}
interface Page {
  agent: {
    capabilities: { supportsRewindBoth?: boolean; supportsRewindConversation?: boolean }
  } | null
  entries: { item: { type: string; messageId?: string; text?: string } }[]
  epoch: string
  error: string | null
  hasOlder: boolean
  startCursor: { epoch: string; seq: number } | null
}
interface History {
  refetch(options: {
    direction: 'tail' | 'before'
    limit: number
    cursor?: { epoch: string; seq: number }
  }): Promise<Page>
}

export async function latestTarget(history: History): Promise<Target> {
  let page = await history.refetch({ direction: 'tail', limit: 100 })
  if (page.error) throw new Error(page.error)
  const capabilities = page.agent?.capabilities
  const mode: RewindMode = capabilities?.supportsRewindBoth ? 'both' : 'conversation'
  if (!capabilities?.supportsRewindBoth && !capabilities?.supportsRewindConversation) {
    throw new Error('Cet agent ne prend pas en charge le retour arrière natif.')
  }
  const epoch = page.epoch
  for (let count = 0; count < 100; count++) {
    if (page.error) throw new Error(page.error)
    if (page.epoch !== epoch) throw new Error('La conversation a changé. Réessaie.')
    const item = [...page.entries]
      .reverse()
      .find(({ item: entry }) => entry.type === 'user_message')?.item
    if (item) {
      if (!item.messageId)
        throw new Error('Ce message n’a pas encore d’identifiant de retour arrière.')
      return { messageId: item.messageId, text: item.text ?? '', mode, epoch }
    }
    if (!page.hasOlder || !page.startCursor) break
    page = await history.refetch({ direction: 'before', cursor: page.startCursor, limit: 100 })
  }
  throw new Error('Aucun message utilisateur disponible pour le retour arrière.')
}
