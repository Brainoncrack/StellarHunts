import { IsIn, IsUUID } from 'class-validator';
import type { PuzzleCollaboratorRole } from '../entities/puzzle-collaboration.entity';

export class InviteCoauthorDto {
  @IsUUID()
  userId: string;

  @IsIn(['editor', 'reviewer'])
  role: PuzzleCollaboratorRole;
}
