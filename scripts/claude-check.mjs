import nextEnv from '@next/env';
import Anthropic from '@anthropic-ai/sdk';
nextEnv.loadEnvConfig(process.cwd(), true);

const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
if (!apiKey) {
  console.log('ANTHROPIC_API_KEY is missing. Add it to .env.local, then restart Next.js.');
  process.exitCode = 1;
} else {
  try {
    const ids = [];
    for await (const model of new Anthropic({ apiKey }).models.list({ limit: 100 }))
      ids.push(model.id);
    console.log('Claude API key accepted. Models available to this key:');
    console.log(ids.join('\n'));
    console.log('This check only reads the catalog; it does not generate a response.');
  } catch (error) {
    console.log(
      error instanceof Anthropic.AuthenticationError
        ? 'The Claude API rejected this key. Create one at https://platform.claude.com.'
        : 'Could not load the Claude model catalog. Check the connection and try again.'
    );
    process.exitCode = 1;
  }
}
