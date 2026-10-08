import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd(), true);

const apiKey = process.env.APMIX_API_KEY?.trim();
if (!apiKey) {
  console.log('APMIX_API_KEY is missing. Add it to .env.local, then restart Next.js.');
  process.exitCode = 1;
} else {
  try {
    const response = await fetch('https://api.apmix.ai/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      console.log(
        `APMIX rejected the catalog request (HTTP ${response.status}). Check your key and plan.`
      );
      process.exitCode = 1;
    } else {
      const data = await response.json();
      if (!Array.isArray(data.data)) throw new Error('Invalid catalog');
      const ids = data.data
        .map((item) => item.id)
        .filter((id) => typeof id === 'string' && /^[a-zA-Z0-9._/-]{1,100}$/.test(id));
      console.log('APMIX key accepted. Models available to this key:');
      console.log(ids.join('\n'));
      console.log('This check only reads the catalog; it does not generate a response.');
    }
  } catch {
    console.log('Could not load the APMIX catalog. Check the connection and try again.');
    process.exitCode = 1;
  }
}
