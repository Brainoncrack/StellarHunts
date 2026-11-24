import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminAuthModule } from '../../../../backend/src/admin/admin-auth.module';
import { TutorialProgress } from './entities/tutorial-progress.entity';
import { TutorialPuzzle } from './entities/tutorial-puzzle.entity';
import { PuzzleTutorialController } from './puzzle-tutorial.controller';
import { PuzzleTutorialService } from './puzzle-tutorial.service';

@Module({
  imports: [TypeOrmModule.forFeature([TutorialPuzzle, TutorialProgress]), AdminAuthModule],
  controllers: [PuzzleTutorialController],
  providers: [PuzzleTutorialService],
  exports: [PuzzleTutorialService],
})
export class PuzzleTutorialModule {}
