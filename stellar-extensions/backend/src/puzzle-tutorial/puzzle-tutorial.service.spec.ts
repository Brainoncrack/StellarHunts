import { BadRequestException } from '@nestjs/common';
jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));
import { PuzzleTutorialService } from './puzzle-tutorial.service';

describe('PuzzleTutorialService', () => {
  const tutorial = {
    id: 't1',
    isActive: true,
    steps: [{ checkpoint: 'one' }, { checkpoint: 'two' }],
    rewardXp: 25,
  };
  let service: PuzzleTutorialService;
  let tutorials: any;
  let progress: any;

  beforeEach(() => {
    tutorials = { create: jest.fn((value) => value), save: jest.fn((value) => value), find: jest.fn(), findOne: jest.fn().mockResolvedValue(tutorial) };
    progress = {
      create: jest.fn((value) => value),
      save: jest.fn((value) => value),
      findOne: jest.fn().mockResolvedValue(null),
    };
    service = new PuzzleTutorialService(tutorials, progress);
  });

  it('saves checkpoint progress and grants the configured reward only on completion', async () => {
    const first = await service.checkpoint('t1', 'user1', { stepIndex: 0 });
    expect(first.completedSteps).toBe(1);
    expect(first.rewardXpEarned).toBe(0);

    progress.findOne.mockResolvedValue({ ...first, tutorial: undefined });
    const completed = await service.checkpoint('t1', 'user1', { stepIndex: 1 });
    expect(completed.completedAt).toBeInstanceOf(Date);
    expect(completed.rewardXpGranted).toBe(25);
    expect(completed.rewardXpEarned).toBe(25);

    progress.findOne.mockResolvedValue(completed);
    await expect(service.checkpoint('t1', 'user1', { stepIndex: 1 })).resolves.toMatchObject({
      rewardXpEarned: 0,
    });
  });

  it('rejects out-of-order checkpoints and supports skip', async () => {
    await expect(service.checkpoint('t1', 'user1', { stepIndex: 1 })).rejects.toBeInstanceOf(BadRequestException);
    const skipped = await service.skip('t1', 'user1');
    expect(skipped.skippedAt).toBeInstanceOf(Date);
  });
});
