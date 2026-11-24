import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export interface TutorialStep {
  title: string;
  instructions: string;
  checkpoint: string;
}

@Entity('tutorial_puzzles')
export class TutorialPuzzle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  title: string;

  @Column('text')
  description: string;

  @Column('jsonb')
  steps: TutorialStep[];

  @Column({ type: 'int', default: 0 })
  rewardXp: number;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
