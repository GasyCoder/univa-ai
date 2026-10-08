export const accountErrors: Record<string, string> = {
  invalid_name: 'Enter a name of up to 100 characters.',
  invalid_image: 'Choose a JPG, PNG or WebP profile photo.',
  invalid_country: 'Choose a country from the list.',
  invalid_institution: 'Use up to 120 characters for your institution.',
  model_not_allowed: 'This model is not available on your current plan.',
  invalid_reasoning: 'Choose a supported reasoning level.',
  payment_not_configured: 'Payments are not available yet. Please contact support.',
  invalid_reference: 'Enter a payment reference of 3 to 120 characters.',
  request_pending: 'Your previous request is still awaiting review.',
  reference_used: 'This reference has already been submitted.',
  request_conflict: 'A request with this reference already exists.',
  already_reviewed: 'This request has already been reviewed. Refresh to see its status.',
  note_required: 'Add a note explaining the rejection.',
  sign_in_required: 'Please sign in again to continue.',
  not_found: 'This record is not available.',
};
export async function accountRequest<T>(url: string, body?: unknown, method = 'POST'): Promise<T> {
  const response = await fetch(url, {
    ...(body !== undefined
      ? { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : {}),
    cache: 'no-store',
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      accountErrors[data.error?.code] || 'Unable to save your changes. Please try again.'
    );
  return data;
}
export interface PaymentRecord {
  id: string;
  user_id?: string;
  amount: number;
  currency: string;
  method: string;
  reference: string;
  status: string;
  created_at: string;
  reviewed_at: string | null;
  note: string;
  name?: string;
  email?: string;
}
export function paymentAmount(item: Pick<PaymentRecord, 'amount' | 'currency'>) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: item.currency,
    maximumFractionDigits: item.currency === 'MGA' ? 0 : 2,
  }).format(item.currency === 'MGA' ? item.amount : item.amount / 100);
}
export function displayDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(value)
  );
}
