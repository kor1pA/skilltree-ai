export interface ChatMessageParams {
  id: number;
  nodeId: number;
  learnerId: number;
  question: string;
  answer: string;
  responseTimeMs: number;
  isHelpful?: boolean | null;
  createdAt?: Date | string;
}

/**
 * Запитання студента, відповідь ШІ-асистента та її оцінка (UC4, UC11).
 */
export class ChatMessage {
  id: number;
  nodeId: number;
  learnerId: number;
  question: string;
  answer: string;
  responseTimeMs: number;
  isHelpful: boolean | null;
  createdAt: Date;

  constructor(params: ChatMessageParams) {
    this.id = params.id;
    this.nodeId = params.nodeId;
    this.learnerId = params.learnerId;
    this.question = params.question;
    this.answer = params.answer;
    this.responseTimeMs = params.responseTimeMs;
    this.isHelpful = params.isHelpful !== undefined ? params.isHelpful : null;
    this.createdAt = params.createdAt ? new Date(params.createdAt) : new Date();
  }

  /**
   * Фіксує оцінку «корисно / некорисно» (UC11).
   */
  rate(helpful: boolean): void {
    this.isHelpful = Boolean(helpful);
  }

  toJSON() {
    return {
      id: this.id,
      nodeId: this.nodeId,
      learnerId: this.learnerId,
      question: this.question,
      answer: this.answer,
      responseTimeMs: this.responseTimeMs,
      isHelpful: this.isHelpful,
      createdAt: this.createdAt.toISOString(),
    };
  }
}
