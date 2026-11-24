import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DraftPuzzle } from '../../../../backend/src/puzzle-draft/entities/draft-puzzle.entity';
import { PuzzleCollaborationChange } from './entities/puzzle-collaboration-change.entity';
import { PuzzleCollaborator } from './entities/puzzle-collaboration.entity';
import { PuzzleSectionComment } from './entities/puzzle-section-comment.entity';
import { PuzzleSectionLock } from './entities/puzzle-section-lock.entity';
import { PuzzleCollaborationController } from './puzzle-collaboration.controller';
import { PuzzleCollaborationGateway } from './puzzle-collaboration.gateway';
import { PuzzleCollaborationService } from './puzzle-collaboration.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DraftPuzzle,
      PuzzleCollaborator,
      PuzzleCollaborationChange,
      PuzzleSectionLock,
      PuzzleSectionComment,
    ]),
  ],
  controllers: [PuzzleCollaborationController],
  providers: [PuzzleCollaborationGateway, PuzzleCollaborationService],
  exports: [PuzzleCollaborationService],
})
export class PuzzleCollaborationModule {}
