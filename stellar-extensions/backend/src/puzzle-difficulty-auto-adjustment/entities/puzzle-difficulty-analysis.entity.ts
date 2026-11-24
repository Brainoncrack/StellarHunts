import { Column, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('puzzle_difficulty_analyses')
@Index(['puzzleId'], { unique: true })
export class PuzzleDifficultyAnalysis {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  puzzleId: string;

  @Column({ length: 255 })
  title: string;

  @Column({ length: 32 })
  currentDifficulty: string;

  @Column({ length: 32 })
  suggestedDifficulty: string;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ type: 'int', default: 0 })
  solves: number;

  @Column({ type: 'float', default: 0 })
  solveRate: number;

  @Column({ type: 'float', default: 0 })
  averageTimeToSolveSeconds: number;

  @Column({ type: 'float', default: 0 })
  abandonmentRate: number;

  @UpdateDateColumn()
  analyzedAt: Date;
}
