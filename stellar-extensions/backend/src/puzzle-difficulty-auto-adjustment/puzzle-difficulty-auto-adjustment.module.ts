import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminAuthModule } from '../../../../backend/src/admin/admin-auth.module';
import { ActivityLog } from '../../../../backend/src/user-activity-log/entities/activity-log.entity';
import { Puzzle } from '../../../../backend/src/puzzle/puzzle.entity';
import { PuzzleDifficultyAnalysis } from './entities/puzzle-difficulty-analysis.entity';
import { PuzzleDifficultyAutoAdjustmentController } from './puzzle-difficulty-auto-adjustment.controller';
import { PuzzleDifficultyAutoAdjustmentService } from './puzzle-difficulty-auto-adjustment.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Puzzle, ActivityLog, PuzzleDifficultyAnalysis]),
    AdminAuthModule,
  ],
  controllers: [PuzzleDifficultyAutoAdjustmentController],
  providers: [PuzzleDifficultyAutoAdjustmentService],
  exports: [PuzzleDifficultyAutoAdjustmentService],
})
export class PuzzleDifficultyAutoAdjustmentModule {}
