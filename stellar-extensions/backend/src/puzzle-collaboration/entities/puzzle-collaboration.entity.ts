import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type PuzzleCollaboratorRole = 'editor' | 'reviewer';

@Entity('puzzle_collaborators')
@Index(['puzzleId', 'userId'], { unique: true })
export class PuzzleCollaborator {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  puzzleId: string;

  @Column('uuid')
  userId: string;

  @Column({ type: 'varchar', length: 16 })
  role: PuzzleCollaboratorRole;
}
