import type { Learner } from './User.ts';

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
    const sums: Record<string, { total: number; count: number }> = {};

    for (const member of this.members) {
      for (const tree of member.skillTrees) {
        const key = tree.targetProfession;
        if (!sums[key]) {
          sums[key] = { total: 0, count: 0 };
        }
        sums[key].total += tree.calculateProgress();
        sums[key].count += 1;
      }
    }

    const matrix: Record<string, number> = {};
    for (const [skill, data] of Object.entries(sums)) {
      matrix[skill] = Number((data.total / data.count).toFixed(1));
    }
    return matrix;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      hrManagerId: this.hrManagerId,
      memberIds: this.members.map((m) => m.id),
      skillMatrix: this.getSkillMatrix(),
    };
  }
}
