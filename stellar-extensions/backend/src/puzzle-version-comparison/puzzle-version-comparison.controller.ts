import { Controller, Get, Param, Query } from '@nestjs/common';
import { ComparePuzzleVersionsDto } from './dto/compare-puzzle-versions.dto';
import { PuzzleVersionComparisonService } from './puzzle-version-comparison.service';

@Controller('puzzle-version-comparison')
export class PuzzleVersionComparisonController {
  constructor(
    private readonly puzzleVersionComparisonService: PuzzleVersionComparisonService,
  ) {}

  @Get('compare')
  compareVersions(@Query() query: ComparePuzzleVersionsDto) {
    return this.puzzleVersionComparisonService.compareVersions(
      query.fromVersionId,
      query.toVersionId,
    );
  }

  @Get('puzzles/:puzzleId/history')
  getHistory(@Param('puzzleId') puzzleId: string) {
    return this.puzzleVersionComparisonService.getHistory(puzzleId);
  }
}
