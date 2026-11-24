import { ConflictException } from '@nestjs/common';
jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));
import { PuzzleDifficultyAutoAdjustmentService } from './puzzle-difficulty-auto-adjustment.service';

describe('PuzzleDifficultyAutoAdjustmentService', () => {
  let service: PuzzleDifficultyAutoAdjustmentService;
  let puzzles: any;
  let logs: any;
  let analyses: any;

  beforeEach(() => {
    puzzles = {
      find: jest.fn().mockResolvedValue([{ id: 'p1', title: 'Puzzle', difficulty: 'hard' }]),
      findOne: jest.fn().mockResolvedValue({ id: 'p1', difficulty: 'hard' }),
      save: jest.fn((value) => value),
    };
    logs = {
      find: jest.fn().mockResolvedValue([
        { actionType: 'PUZZLE_ATTEMPT', metadata: { puzzleId: 'p1', isCorrect: true, timeTaken: 100 } },
        { actionType: 'PUZZLE_ATTEMPT', metadata: { puzzleId: 'p1', isCorrect: false } },
        { actionType: 'PUZZLE_ABANDONED', metadata: { puzzleId: 'p1' } },
      ]),
    };
    analyses = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest.fn((value) => value),
      find: jest.fn(),
    };
    service = new PuzzleDifficultyAutoAdjustmentService(puzzles, logs, analyses);
  });

  it('aggregates solves, solve time, abandonment, and proposes a new classification', async () => {
    const [result] = await service.analyze();
    expect(result).toMatchObject({
      attempts: 2,
      solves: 1,
      solveRate: 50,
      averageTimeToSolveSeconds: 100,
      abandonmentRate: 100 / 3,
      currentDifficulty: 'hard',
      suggestedDifficulty: 'hard',
    });
  });

  it('rejects applying an analysis after puzzle difficulty changed', async () => {
    analyses.findOne.mockResolvedValue({ currentDifficulty: 'medium', suggestedDifficulty: 'hard' });
    await expect(service.applySuggestion('p1')).rejects.toBeInstanceOf(ConflictException);
  });
});
