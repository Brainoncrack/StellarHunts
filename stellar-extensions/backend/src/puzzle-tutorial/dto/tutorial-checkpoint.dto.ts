import { IsInt, Min } from 'class-validator';

export class TutorialCheckpointDto {
  @IsInt()
  @Min(0)
  stepIndex: number;
}
