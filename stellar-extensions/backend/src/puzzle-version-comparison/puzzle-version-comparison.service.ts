import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PuzzleVersion } from '../../../../backend/src/puzzle-versioning/entities/puzzle-version.entity';
import { PuzzleVersionHistoryItemDto } from './dto/puzzle-version-history.dto';
import {
  PuzzleVersionComparisonDto,
  PuzzleVersionContentChangeDto,
  PuzzleVersionValueChangeDto,
} from './dto/puzzle-version-comparison.dto';

type JsonRecord = Record<string, unknown>;

@Injectable()
export class PuzzleVersionComparisonService {
  constructor(
    @InjectRepository(PuzzleVersion)
    private readonly puzzleVersionRepository: Repository<PuzzleVersion>,
  ) {}

  async compareVersions(
    fromVersionId: string,
    toVersionId: string,
  ): Promise<PuzzleVersionComparisonDto> {
    const [from, to] = await Promise.all([
      this.findVersion(fromVersionId),
      this.findVersion(toVersionId),
    ]);

    if (from.puzzleId !== to.puzzleId) {
      throw new BadRequestException(
        'Puzzle versions must belong to the same puzzle',
      );
    }

    return {
      from: { id: from.id, version: from.version },
      to: { id: to.id, version: to.version },
      contentChanges: this.diffContent(from.content, to.content),
      testCases: this.diffField(from.content, to.content, 'testCases'),
      difficulty: this.diffField(from.content, to.content, 'difficulty'),
      hints: this.diffHints(from.content, to.content),
    };
  }

  async getHistory(puzzleId: string): Promise<PuzzleVersionHistoryItemDto[]> {
    const versions = await this.puzzleVersionRepository.find({
      where: { puzzleId },
      order: { version: 'ASC' },
    });

    if (versions.length === 0) {
      throw new NotFoundException(`No puzzle found with ID "${puzzleId}"`);
    }

    return versions.map(({ id, version, title, createdAt }) => ({
      id,
      puzzleId,
      version,
      title,
      createdAt,
    }));
  }

  private async findVersion(id: string): Promise<PuzzleVersion> {
    const version = await this.puzzleVersionRepository.findOne({
      where: { id },
    });

    if (!version) {
      throw new NotFoundException(`Puzzle version with ID "${id}" not found`);
    }

    return version;
  }

  private diffContent(
    before: JsonRecord,
    after: JsonRecord,
  ): PuzzleVersionContentChangeDto[] {
    return this.diffValues(before, after, '');
  }

  private diffValues(
    before: unknown,
    after: unknown,
    path: string,
  ): PuzzleVersionContentChangeDto[] {
    if (this.valuesEqual(before, after)) {
      return [];
    }

    if (this.isRecord(before) && this.isRecord(after)) {
      const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])]
        .sort();

      return keys.flatMap((key) => {
        const hasBefore = Object.prototype.hasOwnProperty.call(before, key);
        const hasAfter = Object.prototype.hasOwnProperty.call(after, key);
        const childPath = `${path}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`;

        if (!hasBefore) {
          return [{ path: childPath, kind: 'added' as const, after: after[key] }];
        }
        if (!hasAfter) {
          return [
            { path: childPath, kind: 'removed' as const, before: before[key] },
          ];
        }

        return this.diffValues(before[key], after[key], childPath);
      });
    }

    return [
      {
        path: path || '/',
        kind: before === undefined ? 'added' : after === undefined ? 'removed' : 'changed',
        ...(before === undefined ? {} : { before }),
        ...(after === undefined ? {} : { after }),
      },
    ];
  }

  private diffField(
    before: JsonRecord,
    after: JsonRecord,
    field: string,
  ): PuzzleVersionValueChangeDto | null {
    const beforeValue = this.readContentField(before, field);
    const afterValue = this.readContentField(after, field);

    if (
      !beforeValue.found &&
      !afterValue.found
    ) {
      return null;
    }

    if (
      beforeValue.found === afterValue.found &&
      this.valuesEqual(beforeValue.value, afterValue.value)
    ) {
      return null;
    }

    return {
      before: beforeValue.found ? beforeValue.value : null,
      after: afterValue.found ? afterValue.value : null,
    };
  }

  private diffHints(
    before: JsonRecord,
    after: JsonRecord,
  ): PuzzleVersionValueChangeDto | null {
    const beforeHints = this.readContentField(before, 'hints', 'hint');
    const afterHints = this.readContentField(after, 'hints', 'hint');

    if (
      beforeHints.found === afterHints.found &&
      this.valuesEqual(beforeHints.value, afterHints.value)
    ) {
      return null;
    }

    if (!beforeHints.found && !afterHints.found) {
      return null;
    }

    return {
      before: beforeHints.found ? beforeHints.value : null,
      after: afterHints.found ? afterHints.value : null,
    };
  }

  private readContentField(
    content: JsonRecord,
    ...names: string[]
  ): { found: boolean; value?: unknown } {
    for (const name of names) {
      if (Object.prototype.hasOwnProperty.call(content, name)) {
        return { found: true, value: content[name] };
      }
    }

    const nestedContent = content.content;
    if (this.isRecord(nestedContent)) {
      for (const name of names) {
        if (Object.prototype.hasOwnProperty.call(nestedContent, name)) {
          return { found: true, value: nestedContent[name] };
        }
      }
    }

    return { found: false };
  }

  private valuesEqual(before: unknown, after: unknown): boolean {
    if (Object.is(before, after)) {
      return true;
    }

    if (Array.isArray(before) && Array.isArray(after)) {
      return (
        before.length === after.length &&
        before.every((value, index) => this.valuesEqual(value, after[index]))
      );
    }

    if (this.isRecord(before) && this.isRecord(after)) {
      const beforeKeys = Object.keys(before).sort();
      const afterKeys = Object.keys(after).sort();

      return (
        beforeKeys.length === afterKeys.length &&
        beforeKeys.every(
          (key, index) =>
            key === afterKeys[index] &&
            this.valuesEqual(before[key], after[key]),
        )
      );
    }

    return false;
  }

  private isRecord(value: unknown): value is JsonRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
