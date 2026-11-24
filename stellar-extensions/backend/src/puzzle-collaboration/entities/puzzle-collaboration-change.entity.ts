import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('puzzle_collaboration_changes')
@Index(['puzzleId', 'createdAt'])
export class PuzzleCollaborationChange {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  puzzleId: string;

  @Column('uuid')
  authorId: string;

  @Column({ length: 255 })
  section: string;

  @Column('jsonb', { nullable: true })
  beforeValue: unknown;

  @Column('jsonb', { nullable: true })
  afterValue: unknown;

  @CreateDateColumn()
  createdAt: Date;
}
