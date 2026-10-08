import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd(), true);

const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
const origin = process.env.BETTER_AUTH_URL || 'http://127.0.0.1:4200';
const callback = new URL('/api/auth/callback/google', origin).href;

console.log('Google OAuth configuration');
console.log(`Client ID: ${clientId ? 'configured' : 'missing'}`);
console.log(`Client secret: ${clientSecret ? 'configured' : 'missing'}`);
console.log(`Auth origin: ${origin}`);
console.log(`Authorized redirect URI: ${callback}`);

if (!clientId || !clientSecret) {
  console.log('Add the missing credentials to .env.local, then restart Next.js.');
  process.exitCode = 1;
} else if (!clientId.endsWith('.apps.googleusercontent.com')) {
  console.log('Check the Client ID: use the Google OAuth web application client.');
  process.exitCode = 1;
} else {
  console.log('Credentials are present. Google must also allow the redirect URI shown above.');
}
