import { MaterialType } from './enums.ts';

export interface LearningMaterialParams {
  id: number;
  title: string;
  type: MaterialType;
  url: string;
  publishedAt?: Date | string;
  authorId?: number;
  description?: string;
  content?: string;
}

/**
 * Навчальний матеріал, прив'язаний до вузла карти розвитку (UC5).
 */
export class LearningMaterial {
  id: number;
  title: string;
  type: MaterialType;
  url: string;
  publishedAt: Date;
  authorId?: number;
  description?: string;
  content?: string;

  constructor(params: LearningMaterialParams) {
    this.id = params.id;
    this.title = params.title;
    this.type = params.type;
    this.url = params.url;
    this.publishedAt = params.publishedAt ? new Date(params.publishedAt) : new Date();
    this.authorId = params.authorId;
    this.description = params.description;
    this.content = params.content;
  }

  toJSON() {
    return {
      id: this.id,
      title: this.title,
      type: this.type,
      url: this.url,
      publishedAt: this.publishedAt.toISOString(),
      authorId: this.authorId,
      description: this.description,
      content: this.content,
    };
  }
}
