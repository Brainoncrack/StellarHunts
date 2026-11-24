import { ExecutionContext, HttpStatus } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { AdminRole } from '../../../../backend/src/admin/admin-role.enum';
import { Puzzle } from '../../../../backend/src/puzzle/puzzle.entity';
import { PuzzleSubmissionThrottleGuard } from './puzzle-submission-throttle.guard';
import { PuzzleSubmissionThrottleInterceptor } from './puzzle-submission-throttle.interceptor';
import { PuzzleSubmissionThrottleService } from './puzzle-submission-throttle.service';
import { PuzzleSubmissionThrottleSettingsService } from './puzzle-submission-throttle.settings';
import { firstValueFrom, of } from 'rxjs';

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));

function buildContext(
  request: Record<string, any>,
  response: { setHeader: jest.Mock } = { setHeader: jest.fn() },
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
}

describe('PuzzleSubmissionThrottleGuard and interceptor', () => {
  let throttle: PuzzleSubmissionThrottleService;
  let puzzleRepository: { findOne: jest.Mock };
  let guard: PuzzleSubmissionThrottleGuard;

  beforeEach(() => {
    throttle = new PuzzleSubmissionThrottleService(
      new PuzzleSubmissionThrottleSettingsService(),
    );
    puzzleRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'puzzle-1',
        difficulty: 'hard',
      } as Partial<Puzzle>),
    };
    guard = new PuzzleSubmissionThrottleGuard(
      throttle,
      puzzleRepository as unknown as Repository<Puzzle>,
    );
  });

  it('does not consume a puzzle lookup or quota for admin users', async () => {
    const context = buildContext({ user: { role: AdminRole.ADMIN } });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(puzzleRepository.findOne).not.toHaveBeenCalled();
  });

  it('uses persisted difficulty and sends 429 with Retry-After when limited', async () => {
    const request = {
      user: { id: 'user-1' },
      body: { puzzleId: 'puzzle-1' },
    };
    const response = { setHeader: jest.fn() };
    const context = buildContext(request, response);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(await guard.canActivate(context)).toBe(true);
    }
    expect(puzzleRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'puzzle-1' },
      select: { id: true, difficulty: true },
    });

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
    expect(response.setHeader).toHaveBeenCalledWith(
      'Retry-After',
      expect.any(String),
    );
  });

  it('records incorrect and correct grading results through the interceptor', async () => {
    const interceptor = new PuzzleSubmissionThrottleInterceptor(throttle);
    const request = {
      user: { id: 'user-1' },
      body: { puzzleId: 'puzzle-1' },
    };
    const context = buildContext(request);
    const incorrectResult = await firstValueFrom(
      interceptor.intercept(context, {
        handle: () => of({ isCorrect: false }),
      }),
    );

    expect(incorrectResult).toEqual({ isCorrect: false });
    expect(
      throttle.check('user-1', 'puzzle-1', 'easy', Date.now()).allowed,
    ).toBe(false);

    await firstValueFrom(
      interceptor.intercept(context, { handle: () => of({ isCorrect: true }) }),
    );
    expect(
      throttle.check('user-1', 'puzzle-1', 'easy', Date.now()).allowed,
    ).toBe(true);
  });
});
