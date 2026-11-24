import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('puzzle_section_comments')
@Index(['puzzleId', 'section', 'createdAt'])
export class PuzzleSectionComment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  puzzleId: string;

  @Column({ length: 255 })
  section: string;

  @Column('uuid')
  authorId: string;

  @Column('text')
  body: string;

  @CreateDateColumn()
  createdAt: Date;
}
