import { usePaseo, type PluginButtonIconProps } from '@getpaseo/plugin/client'
// Compatibility entry remains available on Paseo 0.12 and 0.13.
import { Modal, useToast } from '@getpaseo/plugin/client/react-native'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Pressable, Text, View } from 'react-native'

import { latestTarget, type Target } from './model'
import {
  focusConfirmationButton,
  focusComposer,
  marker,
  nativeRewind,
  hideLauncher,
  watchShortcut,
  type ElementLike,
} from './web'

function AgentRewind({ agentId, theme }: PluginButtonIconProps & { agentId: string }) {
  const paseo = usePaseo()
  const toast = useToast()
  const [target, setTarget] = useState<Target | null>(null)
  const [busy, setBusy] = useState(false)
  const locked = useRef(false)
  const mounted = useRef(true)
  const paneRef = useRef<ElementLike | null>(null)
  const open = useCallback(
    async (pane: ElementLike | null) => {
      if (!pane || locked.current) return
      locked.current = true
      paneRef.current = pane
      try {
        const next = await latestTarget(paseo.agents.ref(agentId).timeline)
        if (mounted.current && pane.isConnected) setTarget(next)
        else locked.current = false
      } catch (error) {
        locked.current = false
        if (mounted.current) toast.error(error instanceof Error ? error.message : String(error))
      }
    },
    [agentId, paseo, toast]
  )
  useLayoutEffect(() => hideLauncher(agentId), [agentId])
  useEffect(() => {
    mounted.current = true
    const remove = watchShortcut(agentId, pane => {
      void open(pane)
    })
    return () => {
      mounted.current = false
      remove()
    }
  }, [agentId, open])
  const close = useCallback(() => {
    if (busy) return
    setTarget(null)
    locked.current = false
    if (paneRef.current) focusComposer(paneRef.current)
  }, [busy])
  const confirm = async () => {
    if (!target || !paneRef.current || busy) return
    setBusy(true)
    try {
      const current = await latestTarget(paseo.agents.ref(agentId).timeline)
      if (
        current.messageId !== target.messageId ||
        current.epoch !== target.epoch ||
        current.mode !== target.mode
      ) {
        throw new Error('La conversation a changé. Ferme cette fenêtre et réessaie.')
      }
      const pane = paneRef.current
      // Close our dialog before opening Paseo's own menu; its native mutation owns errors and draft restoration.
      setTarget(null)
      await new Promise<void>(resolve => setTimeout(resolve, 100))
      if (!mounted.current) return
      await nativeRewind(pane, target.messageId, target.mode)
      focusComposer(pane)
    } catch (error) {
      if (mounted.current) toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      locked.current = false
      if (mounted.current) setBusy(false)
    }
  }
  const textStyle = { color: theme.colors.foreground }
  return (
    <>
      <View testID={marker(agentId)} />
      <Modal
        onOpenChange={value => {
          if (!value) close()
        }}
        open={target !== null}
        title="Revenir au dernier message ?"
      >
        <Modal.Content>
          <Text style={textStyle}>
            {target?.mode === 'both'
              ? 'Revenir à ton dernier message en annulant les modifications de fichiers effectuées depuis ce message ?'
              : 'Revenir à ton dernier message ? Cet agent ne permet pas d’annuler les modifications de fichiers : elles seront conservées.'}
          </Text>
          {target?.text ? (
            <Text numberOfLines={4} style={{ color: theme.colors.foregroundMuted }}>
              {target.text}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }}>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={close}
              style={{ padding: 12, borderRadius: 8, backgroundColor: theme.colors.surface2 }}
              testID="paseo-rewind-cancel"
            >
              <Text style={textStyle}>Annuler (Esc)</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => {
                void confirm()
              }}
              ref={target ? focusConfirmationButton : undefined}
              style={{ padding: 12, borderRadius: 8, backgroundColor: theme.colors.accent }}
              testID="paseo-rewind-confirm"
            >
              <Text style={{ color: theme.colors.accentForeground }}>
                {busy ? 'Retour…' : 'Oui'}
              </Text>
            </Pressable>
          </View>
        </Modal.Content>
      </Modal>
    </>
  )
}

export function RewindIcon(props: PluginButtonIconProps) {
  if (props.context !== 'agent') return null
  return <AgentRewind {...props} agentId={props.agentId} />
}
