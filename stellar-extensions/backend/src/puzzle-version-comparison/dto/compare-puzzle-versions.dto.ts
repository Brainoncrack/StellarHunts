import { IsNotEmpty, IsString } from 'class-validator';

export class ComparePuzzleVersionsDto {
  @IsString()
  @IsNotEmpty()
  fromVersionId: string;

  @IsString()
  @IsNotEmpty()
  toVersionId: string;
}
