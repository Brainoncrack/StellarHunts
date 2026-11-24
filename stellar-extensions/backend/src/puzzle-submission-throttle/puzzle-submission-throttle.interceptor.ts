import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, concatMap } from 'rxjs';
import { PuzzleSubmissionThrottleService } from './puzzle-submission-throttle.service';

interface SubmissionRequest {
  user?: {
    id?: string;
    sub?: string;
  };
  body?: {
    puzzleId?: unknown;
  };
  params?: {
    puzzleId?: string;
  };
}

@Injectable()
export class PuzzleSubmissionThrottleInterceptor implements NestInterceptor {
  constructor(
    private readonly throttleService: PuzzleSubmissionThrottleService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<SubmissionRequest>();

    return next.handle().pipe(
      concatMap(async (result: unknown) => {
        const userId = request.user?.id ?? request.user?.sub;
        const puzzleId = request.body?.puzzleId ?? request.params?.puzzleId;
        if (
          userId &&
          typeof puzzleId === 'string' &&
          this.hasGradingResult(result)
        ) {
          await this.throttleService.recordSubmissionResult(
            userId,
            puzzleId,
            result.isCorrect,
          );
        }
        return result;
      }),
    );
  }

  private hasGradingResult(result: unknown): result is { isCorrect: boolean } {
    return (
      typeof result === 'object' &&
      result !== null &&
      'isCorrect' in result &&
      typeof result.isCorrect === 'boolean'
    );
  }
}
