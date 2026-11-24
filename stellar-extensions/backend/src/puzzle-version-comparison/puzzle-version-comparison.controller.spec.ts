import { Test, TestingModule } from '@nestjs/testing';
import { ComparePuzzleVersionsDto } from './dto/compare-puzzle-versions.dto';
import { PuzzleVersionComparisonController } from './puzzle-version-comparison.controller';
import { PuzzleVersionComparisonService } from './puzzle-version-comparison.service';

describe('PuzzleVersionComparisonController', () => {
  let controller: PuzzleVersionComparisonController;
  let service: jest.Mocked<
    Pick<PuzzleVersionComparisonService, 'compareVersions' | 'getHistory'>
  >;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PuzzleVersionComparisonController],
      providers: [
        {
          provide: PuzzleVersionComparisonService,
          useValue: {
            compareVersions: jest.fn(),
            getHistory: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(PuzzleVersionComparisonController);
    service = module.get(PuzzleVersionComparisonService);
  });

  it('passes version IDs from the query to the comparison service', async () => {
    const query: ComparePuzzleVersionsDto = {
      fromVersionId: 'version-1',
      toVersionId: 'version-2',
    };

    await controller.compareVersions(query);

    expect(service.compareVersions).toHaveBeenCalledWith(
      'version-1',
      'version-2',
    );
  });

  it('passes the puzzle ID to the history service', async () => {
    await controller.getHistory('puzzle-1');

    expect(service.getHistory).toHaveBeenCalledWith('puzzle-1');
  });
});
