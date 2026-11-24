import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DraftPuzzle } from '../../../../backend/src/puzzle-draft/entities/draft-puzzle.entity';
import { Repository } from 'typeorm';
import { CreateSectionCommentDto } from './dto/create-section-comment.dto';
import { InviteCoauthorDto } from './dto/invite-coauthor.dto';
import { UpdateSectionDto } from './dto/update-section.dto';
import { PuzzleCollaborationChange } from './entities/puzzle-collaboration-change.entity';
import { PuzzleCollaborator } from './entities/puzzle-collaboration.entity';
import { PuzzleSectionComment } from './entities/puzzle-section-comment.entity';
import { PuzzleSectionLock } from './entities/puzzle-section-lock.entity';

const SECTION_LOCK_MS = 5 * 60_000;

@Injectable()
export class PuzzleCollaborationService {
  constructor(
    @InjectRepository(DraftPuzzle)
    private readonly drafts: Repository<DraftPuzzle>,
    @InjectRepository(PuzzleCollaborator)
    private readonly collaborators: Repository<PuzzleCollaborator>,
    @InjectRepository(PuzzleCollaborationChange)
    private readonly changes: Repository<PuzzleCollaborationChange>,
    @InjectRepository(PuzzleSectionLock)
    private readonly locks: Repository<PuzzleSectionLock>,
    @InjectRepository(PuzzleSectionComment)
    private readonly comments: Repository<PuzzleSectionComment>,
  ) {}

  async invite(
    puzzleId: string,
    actorId: string,
    dto: InviteCoauthorDto,
  ): Promise<PuzzleCollaborator> {
    const draft = await this.findDraft(puzzleId);
    this.assertOwner(draft, actorId);
    if (dto.userId === actorId) {
      throw new ConflictException('The puzzle owner cannot be invited as a co-author');
    }

    const existing = await this.collaborators.findOne({
      where: { puzzleId, userId: dto.userId },
    });
    if (existing) {
      existing.role = dto.role;
      return this.collaborators.save(existing);
    }
    return this.collaborators.save(
      this.collaborators.create({ puzzleId, userId: dto.userId, role: dto.role }),
    );
  }

  async listCollaborators(puzzleId: string, actorId: string) {
    await this.requireRole(puzzleId, actorId, ['owner', 'editor', 'reviewer']);
    return this.collaborators.find({ where: { puzzleId } });
  }

  async updateSection(
    puzzleId: string,
    actorId: string,
    dto: UpdateSectionDto,
  ): Promise<PuzzleCollaborationChange> {
    const draft = await this.findDraft(puzzleId);
    await this.requireRole(puzzleId, actorId, ['owner', 'editor']);
    const lock = await this.locks.findOne({
      where: { puzzleId, section: dto.section },
    });
    if (!lock || lock.expiresAt.getTime() <= Date.now() || lock.userId !== actorId) {
      throw new ConflictException('Acquire the section lock before editing');
    }

    const content = { ...draft.content };
    const beforeValue = content[dto.section];
    content[dto.section] = dto.value;
    draft.content = content;
    await this.drafts.save(draft);
    return this.changes.save(
      this.changes.create({
        puzzleId,
        authorId: actorId,
        section: dto.section,
        beforeValue,
        afterValue: dto.value,
      }),
    );
  }

  async acquireLock(puzzleId: string, actorId: string, section: string) {
    await this.requireRole(puzzleId, actorId, ['owner', 'editor']);
    const existing = await this.locks.findOne({ where: { puzzleId, section } });
    const now = Date.now();
    if (existing && existing.expiresAt.getTime() > now && existing.userId !== actorId) {
      throw new ConflictException('This puzzle section is locked by another author');
    }

    const lock = existing ?? this.locks.create({ puzzleId, section, userId: actorId });
    lock.userId = actorId;
    lock.expiresAt = new Date(now + SECTION_LOCK_MS);
    return this.locks.save(lock);
  }

  async releaseLock(puzzleId: string, actorId: string, section: string): Promise<void> {
    const lock = await this.locks.findOne({ where: { puzzleId, section } });
    if (!lock) return;
    const role = await this.requireRole(puzzleId, actorId, ['owner', 'editor', 'reviewer']);
    if (lock.userId !== actorId && role !== 'owner') {
      throw new ForbiddenException('Only the lock holder or puzzle owner can release this lock');
    }
    await this.locks.remove(lock);
  }

  async addComment(
    puzzleId: string,
    actorId: string,
    dto: CreateSectionCommentDto,
  ): Promise<PuzzleSectionComment> {
    await this.requireRole(puzzleId, actorId, ['owner', 'editor', 'reviewer']);
    return this.comments.save(
      this.comments.create({ puzzleId, section: dto.section, authorId: actorId, body: dto.body }),
    );
  }

  async listComments(puzzleId: string, actorId: string, section: string) {
    await this.requireRole(puzzleId, actorId, ['owner', 'editor', 'reviewer']);
    return this.comments.find({
      where: { puzzleId, section },
      order: { createdAt: 'ASC' },
    });
  }

  async listChanges(puzzleId: string, actorId: string) {
    await this.requireRole(puzzleId, actorId, ['owner', 'editor', 'reviewer']);
    return this.changes.find({
      where: { puzzleId },
      order: { createdAt: 'ASC' },
    });
  }

  async assertCanCollaborate(puzzleId: string, actorId: string): Promise<void> {
    await this.requireRole(puzzleId, actorId, ['owner', 'editor', 'reviewer']);
  }

  private async requireRole(
    puzzleId: string,
    actorId: string,
    allowed: Array<'owner' | 'editor' | 'reviewer'>,
  ): Promise<'owner' | 'editor' | 'reviewer'> {
    const draft = await this.findDraft(puzzleId);
    const role =
      draft.createdBy === actorId
        ? 'owner'
        : (await this.collaborators.findOne({ where: { puzzleId, userId: actorId } }))
            ?.role;
    if (!role || !allowed.includes(role)) {
      throw new ForbiddenException('You do not have permission to access this puzzle draft');
    }
    return role;
  }

  private async findDraft(puzzleId: string): Promise<DraftPuzzle> {
    const draft = await this.drafts.findOne({ where: { id: puzzleId } });
    if (!draft || draft.status === 'published') {
      throw new NotFoundException('Puzzle draft not found');
    }
    return draft;
  }

  private assertOwner(draft: DraftPuzzle, actorId: string): void {
    if (draft.createdBy !== actorId) {
      throw new ForbiddenException('Only the puzzle owner can invite co-authors');
    }
  }
}
