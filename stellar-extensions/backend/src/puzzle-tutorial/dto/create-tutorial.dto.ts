import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateTutorialStepDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  instructions: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  checkpoint: string;
}

export class CreateTutorialDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  description: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateTutorialStepDto)
  steps: CreateTutorialStepDto[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  rewardXp?: number;
}
