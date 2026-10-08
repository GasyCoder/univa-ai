import {
  accountData,
  AccountError,
  apiFailure,
  assistantAccess,
  jsonBody,
  profileFor,
  requireAccount,
} from '@/lib/account';
import { getApmixModelIds } from '@/lib/apmix';
import { transaction } from '@/lib/db';
import { COUNTRIES } from '@/lib/plans';
import { ROLES, reasoningLevelsFor } from '@/lib/chat-models';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    return Response.json(
      await accountData(await requireAccount(request), request.headers.get('accept-language')),
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return apiFailure(error);
  }
}
export async function PUT(request: Request) {
  try {
    const user = await requireAccount(request, true);
    const body = await jsonBody(request);
    const profile = await profileFor(user.id);
    const next = { ...profile };
    if ('role' in body) {
      if (!ROLES.some((item) => item.id === body.role))
        throw new AccountError('invalid_role', 422, 'role');
      next.role = body.role as typeof profile.role;
    }
    if ('institution' in body) {
      if (typeof body.institution !== 'string' || body.institution.trim().length > 120)
        throw new AccountError('invalid_institution', 422, 'institution');
      next.institution = body.institution.trim();
    }
    if ('country' in body) {
      if (
        typeof body.country !== 'string' ||
        (body.country !== '' && !COUNTRIES.includes(body.country))
      )
        throw new AccountError('invalid_country', 422, 'country');
      next.country = body.country;
    }
    if ('theme' in body) {
      if (!['light', 'dark', 'system'].includes(body.theme as string))
        throw new AccountError('invalid_theme', 422, 'theme');
      next.theme = body.theme as typeof profile.theme;
    }
    if ('default_model' in body) {
      const { modelIds } = await assistantAccess(user.id, await getApmixModelIds());
      if (typeof body.default_model !== 'string' || !modelIds.includes(body.default_model))
        throw new AccountError('model_not_allowed', 422, 'default_model');
      next.default_model = body.default_model;
    }
    if ('default_reasoning' in body) {
      if (
        body.default_reasoning !== null &&
        (typeof body.default_reasoning !== 'string' ||
          !(body.default_reasoning in reasoningLevelsFor(next.default_model)))
      )
        throw new AccountError('invalid_reasoning', 422, 'default_reasoning');
      next.default_reasoning = body.default_reasoning as typeof profile.default_reasoning;
    }
    if (
      next.default_reasoning &&
      !(next.default_reasoning in reasoningLevelsFor(next.default_model))
    )
      next.default_reasoning = null;
    let name = user.name;
    let image = user.image ?? null;
    if ('name' in body) {
      if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 100)
        throw new AccountError('invalid_name', 422, 'name');
      name = body.name.trim();
    }
    if ('image' in body) {
      if (body.image !== null && (typeof body.image !== 'string' || !validImage(body.image)))
        throw new AccountError('invalid_image', 422, 'image');
      image = body.image as string | null;
    }
    await transaction(async (client) => {
      if ('name' in body || 'image' in body) {
        const fields = ['name', 'image'].filter((key) => key in body);
        const values = fields.map((key) => (key === 'name' ? name : image));
        await client.query(
          `UPDATE "user" SET ${fields.map((key, i) => `${key}=$${i + 2}`).join(',')},"updatedAt"=NOW() WHERE id=$1`,
          [user.id, ...values]
        );
      }
      const fields = (
        ['role', 'institution', 'country', 'theme', 'default_model', 'default_reasoning'] as const
      ).filter((key) => key in body || (key === 'default_reasoning' && 'default_model' in body));
      if (fields.length)
        await client.query(
          `UPDATE profile SET ${fields.map((key, i) => `${key}=$${i + 2}`).join(',')},updated_at=NOW() WHERE user_id=$1`,
          [user.id, ...fields.map((key) => next[key])]
        );
    });
    return Response.json(
      await accountData({ ...user, name, image }, request.headers.get('accept-language')),
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return apiFailure(error);
  }
}
function validImage(value: string) {
  if (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(value))
    return value.length <= 200000;
  if (value.length > 2048) return false;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}
