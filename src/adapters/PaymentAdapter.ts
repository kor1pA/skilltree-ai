import { MentorSession, PaymentStatus } from '../domain/index.ts';

export interface PaymentReceipt {
  transactionId: string;
  sessionId: number;
  amount: number;
  currency: string;
  status: PaymentStatus;
  processedAt: string;
}

/**
 * Адаптер зовнішнього платіжного сервісу (UC9: Оплатити сесію).
 */
export class PaymentAdapter {
  readonly currency = 'UAH';

  processPayment(session: MentorSession): PaymentReceipt {
    const ok = session.pay();
    if (!ok) {
      throw new Error('Неможливо оплатити скасовану менторську сесію.');
    }

    return {
      transactionId: `TXN-${session.id}-${Date.now().toString(36).toUpperCase()}`,
      sessionId: session.id,
      amount: session.price,
      currency: this.currency,
      status: session.paymentStatus,
      processedAt: new Date().toISOString(),
    };
  }

  refundPayment(session: MentorSession): void {
    session.cancel();
  }
}
