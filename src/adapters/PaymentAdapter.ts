import { randomBytes } from 'node:crypto';
import { MentorSession, PaymentStatus } from '../domain/index.ts';

export type PaymentMethod = 'CARD' | 'APPLE_PAY' | 'GOOGLE_PAY' | 'INVOICE';

export interface PaymentReceipt {
  transactionId: string;
  sessionId: number;
  amount: number;
  currency: string;
  method: PaymentMethod;
  status: PaymentStatus;
  processedAt: string;
}

/**
 * Адаптер зовнішнього платіжного сервісу (UC9: Оплатити сесію).
 */
export class PaymentAdapter {
  readonly currency = 'UAH';

  processPayment(session: MentorSession, method: PaymentMethod = 'CARD'): PaymentReceipt {
    if (session.paymentStatus === PaymentStatus.PAID) {
      throw new Error('Сесія вже оплачена.');
    }
    const ok = session.pay();
    if (!ok) {
      throw new Error('Неможливо оплатити скасовану менторську сесію.');
    }

    const rand = randomBytes(4).toString('hex').toUpperCase();
    return {
      transactionId: `TXN-${session.id}-${rand}`,
      sessionId: session.id,
      amount: session.price,
      currency: this.currency,
      method,
      status: session.paymentStatus,
      processedAt: new Date().toISOString(),
    };
  }

  refundPayment(session: MentorSession): void {
    session.cancel();
  }
}
