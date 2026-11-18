import { PaymentStatus, SessionStatus } from './enums.ts';

export interface MentorSessionParams {
  id: number;
  learnerId: number;
  mentorId: number;
  topic?: string;
  startAt: Date | string;
  durationMin?: number;
  price: number;
  status?: SessionStatus;
  paymentStatus?: PaymentStatus;
  rating?: number | null;
  feedback?: string | null;
}

/**
 * Менторська сесія: бронювання, оплата, оцінка та відгук (UC6, UC9).
 */
export class MentorSession {
  id: number;
  learnerId: number;
  mentorId: number;
  topic: string;
  startAt: Date;
  durationMin: number;
  price: number;
  status: SessionStatus;
  paymentStatus: PaymentStatus;
  rating: number | null;
  feedback: string | null;

  constructor(params: MentorSessionParams) {
    this.id = params.id;
    this.learnerId = params.learnerId;
    this.mentorId = params.mentorId;
    this.topic = params.topic ?? 'Індивідуальна менторська сесія';
    this.startAt = new Date(params.startAt);
    this.durationMin = params.durationMin ?? 60;
    this.price = params.price;
    this.status = params.status ?? SessionStatus.BOOKED;
    this.paymentStatus = params.paymentStatus ?? PaymentStatus.PENDING;
    this.rating = params.rating !== undefined ? params.rating : null;
    this.feedback = params.feedback !== undefined ? params.feedback : null;
  }

  pay(): boolean {
    if (this.status === SessionStatus.CANCELLED) {
      return false;
    }
    this.paymentStatus = PaymentStatus.PAID;
    return true;
  }

  cancel(): void {
    this.status = SessionStatus.CANCELLED;
    if (this.paymentStatus === PaymentStatus.PAID) {
      this.paymentStatus = PaymentStatus.REFUNDED;
    }
  }

  leaveFeedback(rating: number, feedback: string): void {
    if (this.status === SessionStatus.CANCELLED) {
      throw new Error('Неможливо залишити відгук для скасованої сесії.');
    }
    if (this.paymentStatus !== PaymentStatus.PAID) {
      throw new Error('Залишити відгук можна лише після оплати сесії.');
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new Error('Оцінка менторської сесії має бути цілим числом від 1 до 5.');
    }
    this.rating = rating;
    this.feedback = feedback.trim();
    this.status = SessionStatus.DONE;
  }

  toJSON() {
    return {
      id: this.id,
      learnerId: this.learnerId,
      mentorId: this.mentorId,
      topic: this.topic,
      startAt: this.startAt.toISOString(),
      durationMin: this.durationMin,
      price: this.price,
      status: this.status,
      paymentStatus: this.paymentStatus,
      rating: this.rating,
      feedback: this.feedback,
    };
  }
}
