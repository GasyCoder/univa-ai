import { NextResponse, type NextRequest } from 'next/server';

const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]']);

export function proxy(request: NextRequest) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return NextResponse.next();
  const canonical = new URL(process.env.BETTER_AUTH_URL || 'http://127.0.0.1:4200');
  // OAuth state cookies must be set on the same origin as Google's registered callback.
  // Normalize local page navigation only; never forward API writes or trust foreign origins.
  let incoming: URL;
  try {
    const host = request.headers.get('host');
    incoming = host ? new URL(`${request.nextUrl.protocol}//${host}`) : request.nextUrl;
  } catch {
    return NextResponse.next();
  }
  if (
    !loopbackHosts.has(canonical.hostname) ||
    !loopbackHosts.has(incoming.hostname) ||
    incoming.origin === canonical.origin
  )
    return NextResponse.next();
  canonical.pathname = request.nextUrl.pathname;
  canonical.search = request.nextUrl.search;
  const response = NextResponse.redirect(canonical, 307);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export const config = { matcher: ['/', '/assistant', '/account', '/admin/:path*'] };
