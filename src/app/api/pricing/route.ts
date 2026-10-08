import { accountPrice } from '@/lib/account';
import { COUNTRIES, suggestedCountry } from '@/lib/plans';
export function GET(request: Request) {
  const chosen = new URL(request.url).searchParams.get('country');
  const country =
    chosen && COUNTRIES.includes(chosen)
      ? chosen
      : suggestedCountry(request.headers.get('accept-language'));
  return Response.json(
    { price: accountPrice(country), country },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
