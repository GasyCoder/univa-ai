@AGENTS.md

## Commands

```bash
npm run dev          # http://127.0.0.1:4200
npm run check        # TypeScript
npm run build
npm run test:api     # needs DATABASE_URL; the Claude API is mocked
npm run test:e2e     # build first; Playwright against a temporary schema
npm run claude:check # lists the models the ANTHROPIC_API_KEY can use
```

## Claude API

`src/lib/claude.ts` is the only module that calls Anthropic, through `@anthropic-ai/sdk`.
Model ids, prices and reasoning levels live in `src/lib/chat-models.ts`; plans and usage
allowances in `src/lib/plans.ts`. When adding or changing a model, update both and the
`UPDATE profile` list in `src/lib/schema.ts`.
