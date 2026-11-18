import type { Learner } from './User.ts';
import { SkillMatrixService, type SkillMatrixReport } from '../services/SkillMatrixService.ts';

export interface TeamParams {
  id: number;
  name: string;
  hrManagerId: number;
  members?: Learner[];
}

/**
 * Команда працівників; джерело даних для B2B Skill Matrix (UC7).
 */
export class Team {
  id: number;
  name: string;
  hrManagerId: number;
  members: Learner[];

  constructor(params: TeamParams) {
    this.id = params.id;
    this.name = params.name;
    this.hrManagerId = params.hrManagerId;
    this.members = params.members ?? [];
  }

  addMember(learner: Learner): void {
    const exists = this.members.some((m) => m.id === learner.id);
    if (!exists) {
      this.members.push(learner);
    }
  }

  /**
   * Повертає середній рівень прогресу по кожній цільовій навичці/професії команди.
   */
  getSkillMatrix(): Record<string, number> {
    return SkillMatrixService.calculateProfessionAverages(this);
  }

  getDetailedMatrix(): SkillMatrixReport {
    return SkillMatrixService.buildDetailedReport(this);
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      hrManagerId: this.hrManagerId,
      memberIds: this.members.map((m) => m.id),
      skillMatrix: this.getSkillMatrix(),
      detailedMatrix: this.getDetailedMatrix(),
    };
  }
}
