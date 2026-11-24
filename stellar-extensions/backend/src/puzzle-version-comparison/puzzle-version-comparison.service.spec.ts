import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PuzzleVersion } from '../../../../backend/src/puzzle-versioning/entities/puzzle-version.entity';
import { PuzzleVersionComparisonService } from './puzzle-version-comparison.service';

describe('PuzzleVersionComparisonService', () => {
  let service: PuzzleVersionComparisonService;
  let repository: jest.Mocked<
    Pick<Repository<PuzzleVersion>, 'find' | 'findOne'>
  >;

  const versions: Record<string, PuzzleVersion> = {
    old: {
      id: 'old',
      puzzleId: 'puzzle-1',
      version: 1,
      title: 'Puzzle',
      content: {
        prompt: 'Old prompt',
        testCases: [{ input: 1, expected: 2 }],
        difficulty: 'easy',
        hint: 'Old hint',
      },
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    },
    current: {
      id: 'current',
      puzzleId: 'puzzle-1',
      version: 2,
      title: 'Puzzle',
      content: {
        prompt: 'New prompt',
        testCases: [{ input: 1, expected: 3 }],
        difficulty: 'medium',
        hints: ['New hint'],
      },
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
    },
  };

  beforeEach(async () => {
    const mockRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PuzzleVersionComparisonService,
        {
          provide: getRepositoryToken(PuzzleVersion),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get(PuzzleVersionComparisonService);
    repository = module.get(getRepositoryToken(PuzzleVersion));
    jest.clearAllMocks();
  });

  it('returns content and specialized changes for two versions', async () => {
    repository.findOne
      .mockResolvedValueOnce(versions.old)
      .mockResolvedValueOnce(versions.current);

    await expect(service.compareVersions('old', 'current')).resolves.toEqual({
      from: { id: 'old', version: 1 },
      to: { id: 'current', version: 2 },
      contentChanges: [
        { path: '/difficulty', kind: 'changed', before: 'easy', after: 'medium' },
        { path: '/hint', kind: 'removed', before: 'Old hint' },
        { path: '/hints', kind: 'added', after: ['New hint'] },
        { path: '/prompt', kind: 'changed', before: 'Old prompt', after: 'New prompt' },
        {
          path: '/testCases',
          kind: 'changed',
          before: [{ input: 1, expected: 2 }],
          after: [{ input: 1, expected: 3 }],
        },
      ],
      testCases: {
        before: [{ input: 1, expected: 2 }],
        after: [{ input: 1, expected: 3 }],
      },
      difficulty: { before: 'easy', after: 'medium' },
      hints: { before: 'Old hint', after: ['New hint'] },
    });
  });

  it('throws NotFoundException when either version does not exist', async () => {
    repository.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

    await expect(service.compareVersions('missing', 'also-missing')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('rejects comparisons across different puzzles', async () => {
    repository.findOne
      .mockResolvedValueOnce(versions.old)
      .mockResolvedValueOnce({
        ...versions.current,
        puzzleId: 'puzzle-2',
      });

    await expect(service.compareVersions('old', 'current')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('returns puzzle history in ascending version order', async () => {
    repository.find.mockResolvedValue([versions.old, versions.current]);

    await expect(service.getHistory('puzzle-1')).resolves.toEqual([
      {
        id: 'old',
        puzzleId: 'puzzle-1',
        version: 1,
        title: 'Puzzle',
        createdAt: versions.old.createdAt,
      },
      {
        id: 'current',
        puzzleId: 'puzzle-1',
        version: 2,
        title: 'Puzzle',
        createdAt: versions.current.createdAt,
      },
    ]);
    expect(repository.find).toHaveBeenCalledWith({
      where: { puzzleId: 'puzzle-1' },
      order: { version: 'ASC' },
    });
  });

  it('throws NotFoundException when a puzzle has no version history', async () => {
    repository.find.mockResolvedValue([]);

    await expect(service.getHistory('missing')).rejects.toThrow(
      NotFoundException,
    );
  });
});
