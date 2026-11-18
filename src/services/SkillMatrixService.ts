import { NodeStatus } from '../domain/enums.ts';
import type { Team } from '../domain/Team.ts';

export interface MemberMatrixRow {
  learnerId: number;
  fullName: string;
  email: string;
  targetProfession: string;
  level: string;
  treesCount: number;
  totalNodes: number;
  doneNodes: number;
  progressPct: number;
  points: number;
  badges: string[];
}

export interface SkillMatrixReport {
  teamId: number;
  teamName: string;
  professionAverages: Record<string, number>;
  skillNodeAverages: Record<string, number>;
  members: MemberMatrixRow[];
  teamAverageProgress: number;
}

/**
 * Сервіс аналітики B2B Skill Matrix та експорту звітів (UC7, UC12).
 */
export class SkillMatrixService {
  static calculateProfessionAverages(team: Team): Record<string, number> {
    const sums: Record<string, { total: number; count: number }> = {};

    for (const member of team.members) {
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

  static buildDetailedReport(team: Team): SkillMatrixReport {
    const nodeSums: Record<string, { scoreSum: number; count: number }> = {};
    const members: MemberMatrixRow[] = [];

    for (const member of team.members) {
      let totalNodes = 0;
      let doneNodes = 0;

      for (const tree of member.skillTrees) {
        for (const node of tree.nodes) {
          totalNodes += 1;
          let nodeScore = 0;
          if (node.status === NodeStatus.DONE) {
            doneNodes += 1;
            nodeScore = 100;
          } else if (node.status === NodeStatus.IN_PROGRESS) {
            nodeScore = 50;
          }

          if (!nodeSums[node.title]) {
            nodeSums[node.title] = { scoreSum: 0, count: 0 };
          }
          nodeSums[node.title].scoreSum += nodeScore;
          nodeSums[node.title].count += 1;
        }
      }

      const progressPct =
        member.skillTrees.length > 0
          ? Number(
              (
                member.skillTrees.reduce((sum, t) => sum + t.calculateProgress(), 0) /
                member.skillTrees.length
              ).toFixed(1)
            )
          : 0;

      members.push({
        learnerId: member.id,
        fullName: member.fullName,
        email: member.email,
        targetProfession: member.targetProfession,
        level: member.level,
        treesCount: member.skillTrees.length,
        totalNodes,
        doneNodes,
        progressPct,
        points: member.points,
        badges: [...member.badges],
      });
    }

    const skillNodeAverages: Record<string, number> = {};
    for (const [nodeTitle, data] of Object.entries(nodeSums)) {
      skillNodeAverages[nodeTitle] = Number((data.scoreSum / data.count).toFixed(1));
    }

    const teamAverageProgress =
      members.length > 0
        ? Number(
            (members.reduce((sum, m) => sum + m.progressPct, 0) / members.length).toFixed(1)
          )
        : 0;

    return {
      teamId: team.id,
      teamName: team.name,
      professionAverages: this.calculateProfessionAverages(team),
      skillNodeAverages,
      members,
      teamAverageProgress,
    };
  }

  /**
   * Екранує комірку згідно зі стандартом RFC-4180.
   */
  static escapeCsvCell(value: string | number): string {
    const raw = String(value);
    if (/[",\r\n]/.test(raw)) {
      return `"${raw.replace(/"/g, '""')}"`;
    }
    return raw;
  }

  /**
   * Формує CSV-звіт з UTF-8 BOM для коректного відкриття кирилиці в Excel (UC12).
   */
  static exportCsv(team: Team): string {
    const report = this.buildDetailedReport(team);
    const headers = [
      'ID',
      'ПІБ співробітника',
      'Email',
      'Цільова професія',
      'Рівень',
      'Кількість карт',
      'Завершено вузлів',
      'Загальний прогрес %',
      'Бали',
    ];

    const lines = [headers.map((h) => this.escapeCsvCell(h)).join(',')];

    for (const row of report.members) {
      const cells = [
        row.learnerId,
        row.fullName,
        row.email,
        row.targetProfession,
        row.level,
        row.treesCount,
        `${row.doneNodes}/${row.totalNodes}`,
        row.progressPct.toFixed(1),
        row.points,
      ];
      lines.push(cells.map((c) => this.escapeCsvCell(c)).join(','));
    }

    return `\uFEFF${lines.join('\r\n')}`;
  }
}
