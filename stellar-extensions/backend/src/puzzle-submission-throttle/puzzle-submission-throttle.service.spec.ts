import { BadRequestException } from '@nestjs/common';
import { PuzzleSubmissionThrottleService } from './puzzle-submission-throttle.service';
import { PuzzleSubmissionThrottleSettingsService } from './puzzle-submission-throttle.settings';

describe('PuzzleSubmissionThrottleService', () => {
  let settings: PuzzleSubmissionThrottleSettingsService;
  let service: PuzzleSubmissionThrottleService;

  beforeEach(() => {
    settings = new PuzzleSubmissionThrottleSettingsService();
    service = new PuzzleSubmissionThrottleService(settings);
  });

  it('applies higher per-minute limits to easier puzzles per user', () => {
    settings.updateSettings({
      windowMs: 60_000,
      limits: { easy: 2, hard: 1 },
    });

    expect(service.check('user-1', 'easy-1', 'easy', 1_000).allowed).toBe(true);
    expect(service.check('user-1', 'easy-2', 'easy', 2_000).allowed).toBe(true);
    expect(service.check('user-1', 'easy-3', 'easy', 3_000).allowed).toBe(
      false,
    );
    expect(service.check('user-2', 'hard-1', 'hard', 1_000).allowed).toBe(true);
    expect(service.check('user-2', 'hard-2', 'hard', 2_000).allowed).toBe(
      false,
    );
  });

  it('expires requests at the rolling window boundary', () => {
    settings.updateSettings({ windowMs: 1_000, limits: { easy: 1 } });
    expect(service.check('user-1', 'puzzle-1', 'easy', 100).allowed).toBe(true);

    const limited = service.check('user-1', 'puzzle-2', 'easy', 1_099);
    expect(limited).toEqual({ allowed: false, retryAfterSeconds: 1 });
    expect(service.check('user-1', 'puzzle-2', 'easy', 1_100).allowed).toBe(
      true,
    );
  });

  it('escalates failure backoff, caps it, and clears it after a correct answer', () => {
    settings.updateSettings({ baseBackoffMs: 1_000, maxBackoffMs: 3_000 });
    service.recordSubmissionResult('user-1', 'puzzle-1', false, 10_000);
    expect(service.check('user-1', 'puzzle-1', 'easy', 10_500)).toEqual({
      allowed: false,
      retryAfterSeconds: 1,
    });

    service.recordSubmissionResult('user-1', 'puzzle-1', false, 11_000);
    expect(service.check('user-1', 'puzzle-1', 'easy', 12_500)).toEqual({
      allowed: false,
      retryAfterSeconds: 1,
    });

    service.recordSubmissionResult('user-1', 'puzzle-1', false, 13_000);
    expect(service.check('user-1', 'puzzle-1', 'easy', 15_000)).toEqual({
      allowed: false,
      retryAfterSeconds: 1,
    });

    service.recordSubmissionResult('user-1', 'puzzle-1', true, 16_000);
    expect(service.check('user-1', 'puzzle-1', 'easy', 16_000).allowed).toBe(
      true,
    );
  });

  it('validates admin setting updates while allowing partial configuration', () => {
    expect(() => settings.updateSettings({ limits: { hard: 0 } })).toThrow(
      BadRequestException,
    );
    expect(() =>
      settings.updateSettings({ baseBackoffMs: 2_000, maxBackoffMs: 1_000 }),
    ).toThrow(BadRequestException);
    expect(settings.updateSettings({ limits: { easy: 12 } }).limits.easy).toBe(
      12,
    );
  });
});
