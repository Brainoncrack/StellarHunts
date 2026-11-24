import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminRole } from '../../../../backend/src/admin/admin-role.enum';
import { JwtAuthGuard } from '../../../../backend/src/admin/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../backend/src/admin/guards/roles.guard';
import { Roles } from '../../../../backend/src/admin/roles.decorator';
import { CreateTutorialDto } from './dto/create-tutorial.dto';
import { TutorialCheckpointDto } from './dto/tutorial-checkpoint.dto';
import { PuzzleTutorialService } from './puzzle-tutorial.service';

@Controller('tutorials')
export class PuzzleTutorialController {
  constructor(private readonly tutorials: PuzzleTutorialService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AdminRole.ADMIN)
  create(@Body() dto: CreateTutorialDto) {
    return this.tutorials.create(dto);
  }

  @Get()
  list() {
    return this.tutorials.list();
  }

  @Get(':tutorialId/progress')
  getProgress(@Param('tutorialId') tutorialId: string, @Req() request: Request) {
    return this.tutorials.getProgress(tutorialId, this.actorId(request));
  }

  @Post(':tutorialId/checkpoints')
  checkpoint(
    @Param('tutorialId') tutorialId: string,
    @Req() request: Request,
    @Body() dto: TutorialCheckpointDto,
  ) {
    return this.tutorials.checkpoint(tutorialId, this.actorId(request), dto);
  }

  @Post(':tutorialId/skip')
  skip(@Param('tutorialId') tutorialId: string, @Req() request: Request) {
    return this.tutorials.skip(tutorialId, this.actorId(request));
  }

  private actorId(request: Request): string {
    const user = request.user as { id?: string } | undefined;
    if (!user?.id) throw new UnauthorizedException('Authentication is required');
    return user.id;
  }
}
