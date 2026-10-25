import { createElement } from 'react'

export const Platform = { OS: 'web' }

export function View({ testID, children, ...props }) {
  return createElement('div', { ...props, 'data-testid': testID }, children)
}

export function Text({ children, numberOfLines: _, ...props }) {
  return createElement('span', props, children)
}

export function Pressable({ testID, onPress, accessibilityRole: _, children, ...props }) {
  return createElement(
    'button',
    { type: 'button', ...props, 'data-testid': testID, onClick: onPress },
    children
  )
}
