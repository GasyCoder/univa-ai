import { MODELS, type UniversityRole, type ReasoningLevel } from './chat-models';

export type PlanId = 'free' | 'pro';
export const PLANS = {
  free: { label: 'Free', requestsPerMinute: 10, modelIds: ['claude-sonnet-4-6-free'] },
  pro: { label: 'Pro', requestsPerMinute: 30, modelIds: MODELS.map((model) => model.id) },
};
const countryCodes =
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW';
export const COUNTRIES = countryCodes.split(' ');
const euroCountries = new Set(
  'AT BE BG CY DE EE ES FI FR GR HR IE IT LT LU LV MT NL PT SI SK'.split(' ')
);
export type Price = { amount: number; currency: 'USD' | 'EUR' | 'MGA'; formatted: string };
export function proPrice(country: string, mgaAmount?: number): Price {
  if (country === 'MG' && mgaAmount && Number.isSafeInteger(mgaAmount) && mgaAmount > 0)
    return {
      amount: mgaAmount,
      currency: 'MGA',
      formatted: `${new Intl.NumberFormat('en-US').format(mgaAmount)} Ar`,
    };
  if (euroCountries.has(country)) return { amount: 1200, currency: 'EUR', formatted: '€12' };
  return { amount: 1200, currency: 'USD', formatted: '$12' };
}
export function suggestedCountry(language: string | null) {
  for (const tag of (language || '').split(',')) {
    const parts = tag.split(';')[0].trim().split('-');
    const region = parts.find((part, index) => index > 0 && /^[A-Z]{2}$/.test(part.toUpperCase()));
    if (region && COUNTRIES.includes(region.toUpperCase())) return region.toUpperCase();
  }
  return '';
}
export interface Profile {
  role: UniversityRole;
  institution: string;
  country: string;
  theme: 'light' | 'dark' | 'system';
  default_model: string;
  default_reasoning: ReasoningLevel | null;
}
export interface AccountData {
  user: { id: string; name: string; email: string; image: string | null };
  profile: Profile;
  plan: PlanId;
  subscription: { status: string; current_period_end: string } | null;
  isAdmin: boolean;
  hasPassword: boolean;
  providerModelIds: string[] | null;
  paymentMethods: { id: 'mobile_money' | 'card'; label: string; instructions: string }[];
  price: Price;
  countrySuggestion: string;
}
