import { BadRequestException, Injectable } from '@nestjs/common';

export type PuzzleDifficulty = 'easy' | 'medium' | 'hard';

export interface PuzzleSubmissionThrottleSettings {
  windowMs: number;
  limits: Record<PuzzleDifficulty, number>;
  baseBackoffMs: number;
  maxBackoffMs: number;
}

const DEFAULT_SETTINGS: PuzzleSubmissionThrottleSettings = {
  windowMs: 60_000,
  limits: {
    easy: 10,
    medium: 5,
    hard: 3,
  },
  baseBackoffMs: 30_000,
  maxBackoffMs: 60 * 60 * 1000,
};

const DIFFICULTIES: PuzzleDifficulty[] = ['easy', 'medium', 'hard'];
const SETTING_KEYS = ['windowMs', 'limits', 'baseBackoffMs', 'maxBackoffMs'];

@Injectable()
export class PuzzleSubmissionThrottleSettingsService {
  private settings: PuzzleSubmissionThrottleSettings = {
    ...DEFAULT_SETTINGS,
    limits: { ...DEFAULT_SETTINGS.limits },
  };

  getSettings(): PuzzleSubmissionThrottleSettings {
    return {
      ...this.settings,
      limits: { ...this.settings.limits },
    };
  }

  updateSettings(input: unknown): PuzzleSubmissionThrottleSettings {
    if (!this.isRecord(input)) {
      throw new BadRequestException('Settings must be an object.');
    }

    for (const key of Object.keys(input)) {
      if (!SETTING_KEYS.includes(key)) {
        throw new BadRequestException(`Unknown setting: ${key}`);
      }
    }

    const updated: PuzzleSubmissionThrottleSettings = this.getSettings();
    if ('windowMs' in input) {
      updated.windowMs = this.positiveInteger(input.windowMs, 'windowMs');
    }
    if ('baseBackoffMs' in input) {
      updated.baseBackoffMs = this.positiveInteger(
        input.baseBackoffMs,
        'baseBackoffMs',
      );
    }
    if ('maxBackoffMs' in input) {
      updated.maxBackoffMs = this.positiveInteger(
        input.maxBackoffMs,
        'maxBackoffMs',
      );
    }
    if ('limits' in input) {
      if (!this.isRecord(input.limits)) {
        throw new BadRequestException('limits must be an object.');
      }
      for (const key of Object.keys(input.limits)) {
        if (!DIFFICULTIES.includes(key as PuzzleDifficulty)) {
          throw new BadRequestException(`Unknown puzzle difficulty: ${key}`);
        }
        updated.limits[key as PuzzleDifficulty] = this.positiveInteger(
          input.limits[key],
          `limits.${key}`,
        );
      }
    }

    if (updated.maxBackoffMs < updated.baseBackoffMs) {
      throw new BadRequestException(
        'maxBackoffMs must be greater than or equal to baseBackoffMs.',
      );
    }

    this.settings = updated;
    return this.getSettings();
  }

  private positiveInteger(value: unknown, name: string): number {
    if (
      typeof value !== 'number' ||
      !Number.isSafeInteger(value) ||
      value <= 0
    ) {
      throw new BadRequestException(`${name} must be a positive integer.`);
    }
    return value;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
