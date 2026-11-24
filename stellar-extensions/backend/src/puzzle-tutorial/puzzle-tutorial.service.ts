import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateTutorialDto } from './dto/create-tutorial.dto';
import { TutorialCheckpointDto } from './dto/tutorial-checkpoint.dto';
import { TutorialProgress } from './entities/tutorial-progress.entity';
import { TutorialPuzzle } from './entities/tutorial-puzzle.entity';

@Injectable()
export class PuzzleTutorialService {
  constructor(
    @InjectRepository(TutorialPuzzle)
    private readonly tutorials: Repository<TutorialPuzzle>,
    @InjectRepository(TutorialProgress)
    private readonly progress: Repository<TutorialProgress>,
  ) {}

  create(dto: CreateTutorialDto): Promise<TutorialPuzzle> {
    const tutorial = this.tutorials.create({
      ...dto,
      rewardXp: dto.rewardXp ?? 0,
    });
    return this.tutorials.save(tutorial);
  }

  async list(): Promise<TutorialPuzzle[]> {
    return this.tutorials.find({ where: { isActive: true }, order: { createdAt: 'DESC' } });
  }

  async getProgress(tutorialId: string, userId: string): Promise<TutorialProgress> {
    const tutorial = await this.findTutorial(tutorialId);
    let progress = await this.progress.findOne({ where: { tutorialId, userId } });
    if (!progress) {
      progress = this.progress.create({
        tutorialId,
        userId,
        completedSteps: 0,
        rewardXpGranted: 0,
        completedAt: null,
        skippedAt: null,
        rewardGrantedAt: null,
      });
      progress = await this.progress.save(progress);
    }
    return this.withTutorial(progress, tutorial);
  }

  async checkpoint(
    tutorialId: string,
    userId: string,
    dto: TutorialCheckpointDto,
  ): Promise<TutorialProgress & { rewardXpEarned: number }> {
    const tutorial = await this.findTutorial(tutorialId);
    let progress = await this.progress.findOne({ where: { tutorialId, userId } });
    if (!progress) {
      progress = this.progress.create({
        tutorialId,
        userId,
        completedSteps: 0,
        rewardXpGranted: 0,
        completedAt: null,
        skippedAt: null,
        rewardGrantedAt: null,
      });
    }
    if (progress.completedAt || progress.skippedAt) {
      return Object.assign(this.withTutorial(progress, tutorial), { rewardXpEarned: 0 });
    }
    if (dto.stepIndex !== progress.completedSteps || dto.stepIndex >= tutorial.steps.length) {
      throw new BadRequestException('Tutorial checkpoints must be completed in order');
    }

    progress.completedSteps += 1;
    let rewardXpEarned = 0;
    if (progress.completedSteps === tutorial.steps.length) {
      progress.completedAt = new Date();
      progress.rewardXpGranted = tutorial.rewardXp;
      progress.rewardGrantedAt = new Date();
      rewardXpEarned = tutorial.rewardXp;
    }
    progress = await this.progress.save(progress);
    return Object.assign(this.withTutorial(progress, tutorial), { rewardXpEarned });
  }

  async skip(tutorialId: string, userId: string): Promise<TutorialProgress> {
    const tutorial = await this.findTutorial(tutorialId);
    let progress = await this.progress.findOne({ where: { tutorialId, userId } });
    if (!progress) {
      progress = this.progress.create({
        tutorialId,
        userId,
        completedSteps: 0,
        rewardXpGranted: 0,
        completedAt: null,
        skippedAt: null,
        rewardGrantedAt: null,
      });
    }
    if (!progress.completedAt && !progress.skippedAt) progress.skippedAt = new Date();
    return this.withTutorial(await this.progress.save(progress), tutorial);
  }

  private async findTutorial(id: string): Promise<TutorialPuzzle> {
    const tutorial = await this.tutorials.findOne({ where: { id, isActive: true } });
    if (!tutorial) throw new NotFoundException(`Tutorial "${id}" not found`);
    return tutorial;
  }

  private withTutorial(
    progress: TutorialProgress,
    tutorial: TutorialPuzzle,
  ): TutorialProgress {
    return Object.assign(progress, { tutorial });
  }
}
