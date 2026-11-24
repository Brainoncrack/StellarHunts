import {
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdminRole } from '../../../../backend/src/admin/admin-role.enum';
import { JwtAuthGuard } from '../../../../backend/src/admin/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../backend/src/admin/guards/roles.guard';
import { Roles } from '../../../../backend/src/admin/roles.decorator';
import { PuzzleDifficultyAutoAdjustmentService } from './puzzle-difficulty-auto-adjustment.service';

@Controller('admin/puzzle-difficulty')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AdminRole.ADMIN)
export class PuzzleDifficultyAutoAdjustmentController {
  constructor(private readonly service: PuzzleDifficultyAutoAdjustmentService) {}

  @Get('suggestions')
  suggestions() {
    return this.service.listSuggestions();
  }

  @Post('analyze')
  analyze() {
    return this.service.analyze();
  }

  @Patch(':puzzleId/apply')
  apply(@Param('puzzleId') puzzleId: string) {
    return this.service.applySuggestion(puzzleId);
  }
}
