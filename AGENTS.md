<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## UI and UX

Use shadcn/ui for all pages and interface controls. Reuse the components in
`src/components/ui` and add missing primitives using the configured shadcn CLI.
Use the shared semantic theme tokens in `src/app/globals.css` for light and dark
mode. Compose layouts with Tailwind utilities; do not introduce a separate
component library, native controls outside the UI primitives, hard-coded UI
colors, or CSS that overrides primitive variants, focus rings or disabled states.
Keep keyboard navigation, accessible labels, responsive layouts and touch targets
of at least 44 px for primary mobile actions.
