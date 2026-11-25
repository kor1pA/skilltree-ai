export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, message: string, code = 'APP_ERROR') {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class BadRequestError extends AppError {
  constructor(message: string, code = 'BAD_REQUEST') {
    super(400, message, code);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Необхідна автентифікація.', code = 'UNAUTHORIZED') {
    super(401, message, code);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Недостатньо прав для виконання цієї дії.', code = 'FORBIDDEN') {
    super(403, message, code);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Ресурс не знайдено.', code = 'NOT_FOUND') {
    super(404, message, code);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code = 'CONFLICT') {
    super(409, message, code);
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message = 'Розмір тіла запиту перевищує допустимий ліміт.', code = 'PAYLOAD_TOO_LARGE') {
    super(413, message, code);
  }
}

export class TooManyRequestsError extends AppError {
  readonly retryAfterSeconds: number;

  constructor(
    message = 'Забагато запитів. Спробуйте пізніше.',
    retryAfterSeconds = 60,
    code = 'TOO_MANY_REQUESTS'
  ) {
    super(429, message, code);
    this.retryAfterSeconds = Math.max(1, retryAfterSeconds);
  }
}
