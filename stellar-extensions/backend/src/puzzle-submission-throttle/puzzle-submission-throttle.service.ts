import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  PuzzleDifficulty,
  PuzzleSubmissionThrottleSettingsService,
} from './puzzle-submission-throttle.settings';

interface UserWindow {
  timestamps: number[];
}

interface PuzzleFailureState {
  failures: number;
  blockedUntil: number;
  lastFailureAt: number;
}

export interface PuzzleSubmissionThrottleDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

@Injectable()
export class PuzzleSubmissionThrottleService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly userWindows = new Map<string, UserWindow>();
  private readonly puzzleFailures = new Map<string, PuzzleFailureState>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly settingsService: PuzzleSubmissionThrottleSettingsService,
  ) {}

  onModuleInit(): void {
    this.cleanupTimer = setInterval(() => this.evictExpired(), 30_000);
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

  check(
    userId: string,
    puzzleId: string,
    difficulty: string,
    now: number = Date.now(),
  ): PuzzleSubmissionThrottleDecision {
    const settings = this.settingsService.getSettings();
    const failureKey = this.failureKey(userId, puzzleId);
    let failureState = this.puzzleFailures.get(failureKey);
    if (
      failureState &&
      failureState.blockedUntil <= now &&
      now - failureState.lastFailureAt >= settings.windowMs
    ) {
      this.puzzleFailures.delete(failureKey);
      failureState = undefined;
    }
    if (failureState && failureState.blockedUntil > now) {
      return {
        allowed: false,
        retryAfterSeconds: this.retryAfterSeconds(
          failureState.blockedUntil - now,
        ),
      };
    }

    const window = this.userWindows.get(userId) ?? { timestamps: [] };
    window.timestamps = window.timestamps.filter(
      (timestamp) => now - timestamp < settings.windowMs,
    );

    const limit = settings.limits[this.normalizeDifficulty(difficulty)];
    if (window.timestamps.length >= limit) {
      const retryAfterMs = window.timestamps[0] + settings.windowMs - now;
      this.userWindows.set(userId, window);
      return {
        allowed: false,
        retryAfterSeconds: this.retryAfterSeconds(retryAfterMs),
      };
    }

    window.timestamps.push(now);
    this.userWindows.set(userId, window);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  recordSubmissionResult(
    userId: string,
    puzzleId: string,
    isCorrect: boolean,
    now: number = Date.now(),
  ): void {
    const key = this.failureKey(userId, puzzleId);
    if (isCorrect) {
      this.puzzleFailures.delete(key);
      return;
    }

    const settings = this.settingsService.getSettings();
    const previousState = this.puzzleFailures.get(key);
    const priorFailures =
      previousState && now - previousState.lastFailureAt < settings.windowMs
        ? previousState.failures
        : 0;
    const failures = priorFailures + 1;
    const backoffMs = Math.min(
      settings.baseBackoffMs * 2 ** (failures - 1),
      settings.maxBackoffMs,
    );
    this.puzzleFailures.set(key, {
      failures,
      blockedUntil: now + backoffMs,
      lastFailureAt: now,
    });
  }

  private evictExpired(): void {
    const now = Date.now();
    const windowMs = this.settingsService.getSettings().windowMs;

    for (const [userId, window] of this.userWindows) {
      window.timestamps = window.timestamps.filter(
        (timestamp) => now - timestamp < windowMs,
      );
      if (window.timestamps.length === 0) this.userWindows.delete(userId);
    }

    for (const [key, state] of this.puzzleFailures) {
      if (state.blockedUntil <= now && now - state.lastFailureAt >= windowMs) {
        this.puzzleFailures.delete(key);
      }
    }
  }

  private normalizeDifficulty(difficulty: string): PuzzleDifficulty {
    const normalized = difficulty.trim().toLowerCase();
    if (normalized === 'easy') return 'easy';
    if (normalized === 'hard' || normalized === 'expert') return 'hard';
    return 'medium';
  }

  private failureKey(userId: string, puzzleId: string): string {
    return `${userId}:${puzzleId}`;
  }

  private retryAfterSeconds(milliseconds: number): number {
    return Math.max(1, Math.ceil(milliseconds / 1000));
  }
}
