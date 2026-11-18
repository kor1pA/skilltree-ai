import { NodeStatus, SkillLevel } from './enums.ts';
import { SkillNode } from './SkillNode.ts';

export interface SkillTreeParams {
  id: number;
  title: string;
  targetProfession: string;
  level?: SkillLevel;
  learnerId: number;
  createdAt?: Date | string;
  nodes?: SkillNode[];
}

/**
 * Персоналізована карта розвитку (композиція 1 : 1..* з SkillNode) (UC2, UC3, UC8, UC10).
 */
export class SkillTree {
  id: number;
  title: string;
  targetProfession: string;
  level: SkillLevel;
  learnerId: number;
  createdAt: Date;
  nodes: SkillNode[];

  constructor(params: SkillTreeParams) {
    this.id = params.id;
    this.title = params.title;
    this.targetProfession = params.targetProfession;
    this.level = params.level ?? SkillLevel.BEGINNER;
    this.learnerId = params.learnerId;
    this.createdAt = params.createdAt ? new Date(params.createdAt) : new Date();
    this.nodes = params.nodes ?? [];
  }

  addNode(node: SkillNode): void {
    if (!node.orderNumber || node.orderNumber <= 0) {
      node.orderNumber = this.nodes.length + 1;
    }
    this.nodes.push(node);
    this.nodes.sort((a, b) => a.orderNumber - b.orderNumber);
  }

  /**
   * Видаляє вузол з карти. Забезпечує інваріант композиції 1 : 1..* (останній вузол видалити не можна).
   */
  removeNode(nodeId: number): boolean {
    if (this.nodes.length <= 1) {
      return false;
    }
    const index = this.nodes.findIndex((n) => n.id === nodeId);
    if (index === -1) {
      return false;
    }
    this.nodes.splice(index, 1);
    this.nodes.forEach((node, idx) => {
      node.orderNumber = idx + 1;
    });
    return true;
  }

  /**
   * Рахує відсоток виконання карти на основі вузлів у статусі DONE (UC3).
   */
  calculateProgress(): number {
    if (this.nodes.length === 0) {
      return 0;
    }
    const doneCount = this.nodes.filter((n) => n.status === NodeStatus.DONE).length;
    return Number(((doneCount / this.nodes.length) * 100).toFixed(1));
  }

  toJSON() {
    return {
      id: this.id,
      title: this.title,
      targetProfession: this.targetProfession,
      level: this.level,
      learnerId: this.learnerId,
      createdAt: this.createdAt.toISOString(),
      progress: this.calculateProgress(),
      nodes: this.nodes.map((n) => n.toJSON()),
    };
  }
}
