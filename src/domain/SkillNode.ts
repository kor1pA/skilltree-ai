import { NodeStatus } from './enums.ts';
import { LearningMaterial } from './LearningMaterial.ts';
import { ChatMessage } from './ChatMessage.ts';

export interface SkillNodeParams {
  id: number;
  title: string;
  orderNumber: number;
  status?: NodeStatus;
  description?: string;
  materials?: LearningMaterial[];
  messages?: ChatMessage[];
}

/**
 * Вузол карти розвитку (навичка) зі статусом проходження, матеріалами та чатом (UC3, UC5, UC10).
 */
export class SkillNode {
  id: number;
  title: string;
  orderNumber: number;
  status: NodeStatus;
  description: string;
  materials: LearningMaterial[];
  messages: ChatMessage[];

  constructor(params: SkillNodeParams) {
    this.id = params.id;
    this.title = params.title;
    this.orderNumber = params.orderNumber;
    this.status = params.status ?? NodeStatus.NOT_STARTED;
    this.description = params.description ?? '';
    this.materials = params.materials ?? [];
    this.messages = params.messages ?? [];
  }

  start(): void {
    if (this.status === NodeStatus.DONE) {
      return;
    }
    this.status = NodeStatus.IN_PROGRESS;
  }

  complete(): void {
    this.status = NodeStatus.DONE;
  }

  addMaterial(material: LearningMaterial): void {
    this.materials.push(material);
  }

  addMessage(message: ChatMessage): void {
    this.messages.push(message);
  }

  toJSON() {
    return {
      id: this.id,
      title: this.title,
      orderNumber: this.orderNumber,
      status: this.status,
      description: this.description,
      materials: this.materials.map((m) => m.toJSON()),
      messages: this.messages.map((msg) => msg.toJSON()),
    };
  }
}
