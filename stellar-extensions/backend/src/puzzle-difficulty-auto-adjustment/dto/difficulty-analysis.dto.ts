export class DifficultyAnalysisDto {
  puzzleId: string;
  title: string;
  currentDifficulty: string;
  suggestedDifficulty: string;
  attempts: number;
  solves: number;
  solveRate: number;
  averageTimeToSolveSeconds: number;
  abandonmentRate: number;
  analyzedAt: Date;
}
