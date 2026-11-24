import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('puzzle_section_locks')
@Index(['puzzleId', 'section'], { unique: true })
export class PuzzleSectionLock {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  puzzleId: string;

  @Column({ length: 255 })
  section: string;

  @Column('uuid')
  userId: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;
}
