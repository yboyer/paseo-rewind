# paseo-rewind

A native rewind plugin for Paseo web and desktop.

Press ↑ in the empty message field to open a confirmation dialog. No button is displayed in the composer. Press Esc to cancel or confirm to rewind to the latest user message, including file changes when the agent supports it. Codex keeps file changes.

The plugin creates no backups or commits and makes no requests to external services. It reads the daemon's timeline and uses Paseo's existing Rewind menu. Paseo handles errors and restores the message to the composer.

Targeting relies on Paseo 0.12/0.13 DOM attributes. If the exact agent or button cannot be found, the plugin refuses the action. Finding the latest message may require automatically scrolling through the virtualized history. Messages without text may not have a native Rewind button.

Install: `paseo plugin install github:yboyer/paseo-rewind`.

Validate: `npm run lint` and `npm test`. Format with `npm run format`.
