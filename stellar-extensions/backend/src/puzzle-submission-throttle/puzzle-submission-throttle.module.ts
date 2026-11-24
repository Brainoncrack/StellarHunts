import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RolesGuard } from '../../../../backend/src/admin/guards/roles.guard';
import { Puzzle } from '../../../../backend/src/puzzle/puzzle.entity';
import { PuzzleSubmissionThrottleAdminController } from './puzzle-submission-throttle.admin.controller';
import { PuzzleSubmissionThrottleGuard } from './puzzle-submission-throttle.guard';
import { PuzzleSubmissionThrottleInterceptor } from './puzzle-submission-throttle.interceptor';
import { PuzzleSubmissionThrottleService } from './puzzle-submission-throttle.service';
import { PuzzleSubmissionThrottleSettingsService } from './puzzle-submission-throttle.settings';

@Module({
  imports: [TypeOrmModule.forFeature([Puzzle])],
  controllers: [PuzzleSubmissionThrottleAdminController],
  providers: [
    RolesGuard,
    PuzzleSubmissionThrottleGuard,
    PuzzleSubmissionThrottleInterceptor,
    PuzzleSubmissionThrottleService,
    PuzzleSubmissionThrottleSettingsService,
  ],
  exports: [
    PuzzleSubmissionThrottleGuard,
    PuzzleSubmissionThrottleInterceptor,
    PuzzleSubmissionThrottleService,
    PuzzleSubmissionThrottleSettingsService,
  ],
})
export class PuzzleSubmissionThrottleModule {}
