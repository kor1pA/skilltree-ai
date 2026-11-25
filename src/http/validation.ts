import type { Context } from 'hono';
import { BadRequestError, PayloadTooLargeError } from './errors.ts';

const DEFAULT_MAX_JSON_BYTES = 131_072; // 128 KB

export async function parseJsonBody(
  c: Context,
  maxBytes = DEFAULT_MAX_JSON_BYTES
): Promise<Record<string, unknown>> {
  const declaredLen = c.req.header('content-length');
  if (declaredLen !== undefined) {
    const numericLen = Number(declaredLen);
    if (Number.isFinite(numericLen) && numericLen > maxBytes) {
      throw new PayloadTooLargeError();
    }
  }

  const rawText = await c.req.text();
  if (Buffer.byteLength(rawText, 'utf8') > maxBytes) {
    throw new PayloadTooLargeError();
  }

  const trimmed = rawText.trim();
  if (!trimmed) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new BadRequestError('Невалідний формат JSON у тілі запиту.');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new BadRequestError('Тіло запиту має бути JSON-об’єктом.');
  }

  return parsed as Record<string, unknown>;
}

export function requireString(
  val: unknown,
  fieldLabel: string,
  opts: { min?: number; max?: number } = {}
): string {
  const min = opts.min ?? 1;
  const max = opts.max ?? 500;
  if (typeof val !== 'string') {
    throw new BadRequestError(`Поле «${fieldLabel}» має бути текстом.`);
  }
  const clean = val.trim();
  if (clean.length < min) {
    throw new BadRequestError(
      min <= 1
        ? `Вкажіть ${fieldLabel}.`
        : `Поле «${fieldLabel}» має містити щонайменше ${min} симв.`
    );
  }
  if (clean.length > max) {
    throw new BadRequestError(`Поле «${fieldLabel}» перевищує ліміт ${max} символів.`);
  }
  return clean;
}

export function optionalString(
  val: unknown,
  fieldLabel: string,
  opts: { max?: number } = {}
): string {
  if (val === undefined || val === null) {
    return '';
  }
  if (typeof val !== 'string') {
    throw new BadRequestError(`Поле «${fieldLabel}» має бути текстом.`);
  }
  const clean = val.trim();
  const max = opts.max ?? 4000;
  if (clean.length > max) {
    throw new BadRequestError(`Поле «${fieldLabel}» перевищує ліміт ${max} символів.`);
  }
  return clean;
}

export function requireEmail(val: unknown): string {
  const email = requireString(val, 'email', { min: 5, max: 254 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    throw new BadRequestError('Вкажіть коректну електронну адресу (email).');
  }
  return email;
}

export function requirePassword(val: unknown, min = 8): string {
  if (typeof val !== 'string') {
    throw new BadRequestError('Пароль має бути текстом.');
  }
  if (val.length < min) {
    throw new BadRequestError(`Пароль має містити щонайменше ${min} символів.`);
  }
  if (val.length > 256) {
    throw new BadRequestError('Пароль занадто довгий (максимум 256 символів).');
  }
  return val;
}

export function requirePositiveInt(val: unknown, fieldLabel: string, max = 1_000_000_000): number {
  const n = typeof val === 'number' ? val : Number(val);
  if (!Number.isSafeInteger(n) || n <= 0 || n > max) {
    throw new BadRequestError(`Поле «${fieldLabel}» має бути додатним цілим числом.`);
  }
  return n;
}

export function requirePositiveNumber(val: unknown, fieldLabel: string, max = 1_000_000): number {
  const n = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(n) || n <= 0 || n > max) {
    throw new BadRequestError(`Поле «${fieldLabel}» має бути додатним числом (до ${max}).`);
  }
  return n;
}

export function requireEnum<T extends Record<string, string>>(
  val: unknown,
  enumObj: T,
  fieldLabel: string,
  fallback?: T[keyof T]
): T[keyof T] {
  if ((val === undefined || val === null || val === '') && fallback !== undefined) {
    return fallback;
  }
  const allowed = Object.values(enumObj);
  if (typeof val !== 'string' || !allowed.includes(val)) {
    throw new BadRequestError(
      `Неприпустиме значення для «${fieldLabel}». Дозволено: ${allowed.join(', ')}.`
    );
  }
  return val as T[keyof T];
}

export function validateSafeUrl(val: unknown, opts: { allowEmpty?: boolean } = {}): string {
  const allowEmpty = opts.allowEmpty ?? true;
  if (val === undefined || val === null) {
    if (allowEmpty) return '';
    throw new BadRequestError('Вкажіть URL-посилання.');
  }
  if (typeof val !== 'string') {
    throw new BadRequestError('URL має бути текстом.');
  }
  const clean = val.trim();
  if (!clean) {
    if (allowEmpty) return '';
    throw new BadRequestError('URL не може бути порожнім.');
  }
  if (clean.length > 2048) {
    throw new BadRequestError('URL занадто довгий.');
  }
  let parsed: URL;
  try {
    parsed = new URL(clean);
  } catch {
    throw new BadRequestError('Некоректний формат URL. Посилання має починатися з http:// або https://.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new BadRequestError(
      'Дозволені лише безпечні протоколи http:// або https:// для зовнішніх посилань.'
    );
  }
  return parsed.toString();
}

export function requireValidDate(val: unknown, fieldLabel: string): Date {
  if (typeof val !== 'string' && !(val instanceof Date)) {
    throw new BadRequestError(`Некоректна дата для поля «${fieldLabel}».`);
  }
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestError(`Некоректний формат дати для поля «${fieldLabel}».`);
  }
  return d;
}
