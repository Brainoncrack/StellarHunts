import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { ActivityLog } from '../../../../backend/src/user-activity-log/entities/activity-log.entity';
import { Puzzle } from '../../../../backend/src/puzzle/puzzle.entity';
import { Repository } from 'typeorm';
import type { DifficultyAnalysisDto } from './dto/difficulty-analysis.dto';
import { PuzzleDifficultyAnalysis } from './entities/puzzle-difficulty-analysis.entity';

type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';

@Injectable()
export class PuzzleDifficultyAutoAdjustmentService {
  private readonly levels: Difficulty[] = ['easy', 'medium', 'hard', 'expert'];

  constructor(
    @InjectRepository(Puzzle)
    private readonly puzzles: Repository<Puzzle>,
    @InjectRepository(ActivityLog)
    private readonly activityLogs: Repository<ActivityLog>,
    @InjectRepository(PuzzleDifficultyAnalysis)
    private readonly analyses: Repository<PuzzleDifficultyAnalysis>,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async runScheduledAnalysis(): Promise<DifficultyAnalysisDto[]> {
    return this.analyze();
  }

  async analyze(): Promise<DifficultyAnalysisDto[]> {
    const [puzzles, activityLogs] = await Promise.all([
      this.puzzles.find(),
      this.activityLogs.find({
        where: [
          { actionType: 'PUZZLE_ATTEMPT' },
          { actionType: 'PUZZLE_ABANDONED' },
        ],
      }),
    ]);

    const eventsByPuzzle = new Map<string, ActivityLog[]>();
    for (const log of activityLogs) {
      const puzzleId = this.readPuzzleId(log.metadata);
      if (!puzzleId) continue;
      const events = eventsByPuzzle.get(puzzleId) ?? [];
      events.push(log);
      eventsByPuzzle.set(puzzleId, events);
    }

    const results: DifficultyAnalysisDto[] = [];
    for (const puzzle of puzzles) {
      const stats = this.aggregate(eventsByPuzzle.get(puzzle.id) ?? []);
      const analysis = await this.analyses.findOne({ where: { puzzleId: puzzle.id } });
      const entity = analysis ?? this.analyses.create({ puzzleId: puzzle.id });
      Object.assign(entity, {
        title: puzzle.title,
        currentDifficulty: puzzle.difficulty,
        suggestedDifficulty: this.suggestDifficulty(puzzle.difficulty, stats),
        ...stats,
      });
      results.push(await this.analyses.save(entity));
    }
    return results;
  }

  async listSuggestions(): Promise<DifficultyAnalysisDto[]> {
    return this.analyses.find({ order: { analyzedAt: 'DESC' } });
  }

  async applySuggestion(puzzleId: string): Promise<Puzzle> {
    const analysis = await this.analyses.findOne({ where: { puzzleId } });
    if (!analysis) {
      throw new NotFoundException(`No difficulty analysis found for puzzle "${puzzleId}"`);
    }
    const puzzle = await this.puzzles.findOne({ where: { id: puzzleId } });
    if (!puzzle) throw new NotFoundException(`Puzzle "${puzzleId}" not found`);
    if (puzzle.difficulty !== analysis.currentDifficulty) {
      throw new ConflictException('Puzzle difficulty changed after this analysis; run analysis again');
    }
    puzzle.difficulty = analysis.suggestedDifficulty;
    return this.puzzles.save(puzzle);
  }

  private aggregate(events: ActivityLog[]) {
    let attempts = 0;
    let solves = 0;
    let abandons = 0;
    const solveTimes: number[] = [];

    for (const event of events) {
      const metadata = event.metadata ?? {};
      if (event.actionType === 'PUZZLE_ABANDONED' || metadata.abandoned === true) {
        abandons += 1;
        continue;
      }
      if (event.actionType !== 'PUZZLE_ATTEMPT') continue;
      attempts += 1;
      if (
        metadata.isCorrect === true ||
        metadata.is_correct === true ||
        metadata.solved === true
      ) {
        solves += 1;
        const time = Number(
          metadata.timeToSolveSeconds ?? metadata.timeTaken ?? metadata.timeToSolve,
        );
        if (Number.isFinite(time) && time >= 0) solveTimes.push(time);
      }
    }

    return {
      attempts,
      solves,
      solveRate: attempts ? (solves / attempts) * 100 : 0,
      averageTimeToSolveSeconds: solveTimes.length
        ? solveTimes.reduce((total, seconds) => total + seconds, 0) / solveTimes.length
        : 0,
      abandonmentRate: attempts + abandons
        ? (abandons / (attempts + abandons)) * 100
        : 0,
    };
  }

  private suggestDifficulty(current: string, stats: ReturnType<PuzzleDifficultyAutoAdjustmentService['aggregate']>): Difficulty {
    const normalized = current.toLowerCase() as Difficulty;
    const currentIndex = this.levels.indexOf(normalized);
    if (currentIndex < 0 || stats.attempts === 0) {
      return this.levels[Math.max(0, currentIndex)];
    }

    const consistentlyEasy =
      stats.solveRate >= 80 &&
      (stats.averageTimeToSolveSeconds === 0 || stats.averageTimeToSolveSeconds <= 600);
    const consistentlyHard =
      stats.solveRate <= 25 ||
      (stats.abandonmentRate >= 50 && stats.solveRate < 50);
    if (consistentlyEasy) return this.levels[Math.min(this.levels.length - 1, currentIndex + 1)];
    if (consistentlyHard) return this.levels[Math.max(0, currentIndex - 1)];
    return normalized;
  }

  private readPuzzleId(metadata: Record<string, unknown> | null): string | undefined {
    const id = metadata?.puzzleId ?? metadata?.puzzle_id;
    return typeof id === 'string' && id.length > 0 ? id : undefined;
  }
}
