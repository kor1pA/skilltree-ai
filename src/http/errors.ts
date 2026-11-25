import {
  AppError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  PayloadTooLargeError,
  TooManyRequestsError,
  UnauthorizedError,
} from '../repositories/errors.ts';

export {
  AppError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  PayloadTooLargeError,
  TooManyRequestsError,
  UnauthorizedError,
};

export const HttpError = AppError;
export type HttpError = AppError;

const KNOWN_DOMAIN_ERROR_PATTERNS: RegExp[] = [
  /Новий пароль має містити/,
  /Тривалість сесії має бути/,
  /Некоректна дата початку сесії/,
  /Неможливо підтвердити/,
  /Неможливо скасувати/,
  /Неможливо оплатити/,
  /Неможливо залишити відгук/,
  /Залишити відгук можна лише/,
  /Оцінка менторської сесії має бути/,
  /Сесія вже оплачена/,
  /Вузол з ID .* не знайдено/,
  /Карту з ID .* не знайдено/,
];

export function mapErrorToHttp(err: unknown): AppError {
  if (err instanceof AppError) {
    return err;
  }

  if (err instanceof Error) {
    const msg = err.message || '';
    if (/UNIQUE constraint failed/i.test(msg)) {
      return new ConflictError('Запис із такими унікальними даними вже існує.');
    }
    if (/FOREIGN KEY constraint failed/i.test(msg)) {
      return new BadRequestError('Порушено посилальну цілісність даних.');
    }
    if (KNOWN_DOMAIN_ERROR_PATTERNS.some((pattern) => pattern.test(msg))) {
      return new BadRequestError(msg, 'DOMAIN_VALIDATION_ERROR');
    }
  }

  console.error('[API Internal Error]', err);
  return new AppError(500, 'Внутрішня помилка сервера.', 'INTERNAL_ERROR');
}
