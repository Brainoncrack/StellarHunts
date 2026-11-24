import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PuzzleVersion } from '../../../../backend/src/puzzle-versioning/entities/puzzle-version.entity';
import { PuzzleVersionComparisonController } from './puzzle-version-comparison.controller';
import { PuzzleVersionComparisonService } from './puzzle-version-comparison.service';

@Module({
  imports: [TypeOrmModule.forFeature([PuzzleVersion])],
  controllers: [PuzzleVersionComparisonController],
  providers: [PuzzleVersionComparisonService],
  exports: [PuzzleVersionComparisonService],
})
export class PuzzleVersionComparisonModule {}
