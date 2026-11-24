import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminRole } from '../../../../backend/src/admin/admin-role.enum';
import { Puzzle } from '../../../../backend/src/puzzle/puzzle.entity';
import { PuzzleSubmissionThrottleService } from './puzzle-submission-throttle.service';

interface SubmissionRequest {
  user?: {
    id?: string;
    sub?: string;
    role?: string;
  };
  body?: {
    puzzleId?: unknown;
  };
  params?: {
    puzzleId?: string;
  };
}

@Injectable()
export class PuzzleSubmissionThrottleGuard implements CanActivate {
  constructor(
    private readonly throttleService: PuzzleSubmissionThrottleService,
    @InjectRepository(Puzzle)
    private readonly puzzleRepository: Repository<Puzzle>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<SubmissionRequest>();

    if (
      request.user?.role === AdminRole.ADMIN ||
      request.user?.role === AdminRole.SUPERADMIN
    ) {
      return true;
    }

    const userId = request.user?.id ?? request.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Authentication is required.');
    }

    const puzzleId = request.body?.puzzleId ?? request.params?.puzzleId;
    if (typeof puzzleId !== 'string' || puzzleId.length === 0) {
      throw new BadRequestException('A puzzleId is required.');
    }

    const puzzle = await this.puzzleRepository.findOne({
      where: { id: puzzleId },
      select: { id: true, difficulty: true },
    });
    if (!puzzle) {
      throw new NotFoundException(`Puzzle with ID ${puzzleId} not found`);
    }

    const decision = this.throttleService.check(
      userId,
      puzzleId,
      puzzle.difficulty,
    );
    if (decision.allowed) return true;

    context
      .switchToHttp()
      .getResponse()
      ?.setHeader?.('Retry-After', String(decision.retryAfterSeconds));

    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: 'Too many puzzle submissions. Please try again later.',
        retryAfterSeconds: decision.retryAfterSeconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
