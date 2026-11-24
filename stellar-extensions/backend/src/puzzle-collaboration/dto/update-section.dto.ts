import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpdateSectionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  section: string;

  value: unknown;
}
