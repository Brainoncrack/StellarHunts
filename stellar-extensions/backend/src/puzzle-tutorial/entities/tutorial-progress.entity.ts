import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('tutorial_progress')
@Index(['userId', 'tutorialId'], { unique: true })
export class TutorialProgress {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @Column('uuid')
  tutorialId: string;

  @Column({ type: 'int', default: 0 })
  completedSteps: number;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  skippedAt: Date | null;

  @Column({ type: 'int', default: 0 })
  rewardXpGranted: number;

  @Column({ type: 'timestamptz', nullable: true })
  rewardGrantedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
