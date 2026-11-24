import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateSectionCommentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  section: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  body: string;
}
