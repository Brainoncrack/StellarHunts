import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { CreateSectionCommentDto } from './dto/create-section-comment.dto';
import { InviteCoauthorDto } from './dto/invite-coauthor.dto';
import { UpdateSectionDto } from './dto/update-section.dto';
import { PuzzleCollaborationService } from './puzzle-collaboration.service';

@Controller('drafts/:puzzleId/collaboration')
export class PuzzleCollaborationController {
  constructor(private readonly collaboration: PuzzleCollaborationService) {}

  @Post('invites')
  invite(
    @Param('puzzleId') puzzleId: string,
    @Req() request: Request,
    @Body() dto: InviteCoauthorDto,
  ) {
    return this.collaboration.invite(puzzleId, this.actorId(request), dto);
  }

  @Get('collaborators')
  collaborators(@Param('puzzleId') puzzleId: string, @Req() request: Request) {
    return this.collaboration.listCollaborators(puzzleId, this.actorId(request));
  }

  @Post('sections')
  updateSection(
    @Param('puzzleId') puzzleId: string,
    @Req() request: Request,
    @Body() dto: UpdateSectionDto,
  ) {
    return this.collaboration.updateSection(puzzleId, this.actorId(request), dto);
  }

  @Post('sections/:section/lock')
  lock(
    @Param('puzzleId') puzzleId: string,
    @Param('section') section: string,
    @Req() request: Request,
  ) {
    return this.collaboration.acquireLock(puzzleId, this.actorId(request), section);
  }

  @Post('sections/:section/unlock')
  async unlock(
    @Param('puzzleId') puzzleId: string,
    @Param('section') section: string,
    @Req() request: Request,
  ) {
    await this.collaboration.releaseLock(puzzleId, this.actorId(request), section);
    return { success: true };
  }

  @Post('comments')
  addComment(
    @Param('puzzleId') puzzleId: string,
    @Req() request: Request,
    @Body() dto: CreateSectionCommentDto,
  ) {
    return this.collaboration.addComment(puzzleId, this.actorId(request), dto);
  }

  @Get('comments')
  comments(
    @Param('puzzleId') puzzleId: string,
    @Req() request: Request,
    @Query('section') section: string,
  ) {
    return this.collaboration.listComments(puzzleId, this.actorId(request), section);
  }

  @Get('changes')
  changes(@Param('puzzleId') puzzleId: string, @Req() request: Request) {
    return this.collaboration.listChanges(puzzleId, this.actorId(request));
  }

  private actorId(request: Request): string {
    const user = request.user as { id?: string } | undefined;
    if (!user?.id) throw new UnauthorizedException('Authentication is required');
    return user.id;
  }
}
