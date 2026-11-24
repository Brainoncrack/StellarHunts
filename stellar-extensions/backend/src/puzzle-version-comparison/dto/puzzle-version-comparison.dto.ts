export type PuzzleVersionChangeKind = 'added' | 'removed' | 'changed';

export class PuzzleVersionContentChangeDto {
  path: string;
  kind: PuzzleVersionChangeKind;
  before?: unknown;
  after?: unknown;
}

export class PuzzleVersionValueChangeDto {
  before: unknown;
  after: unknown;
}

export class PuzzleVersionComparisonDto {
  from: {
    id: string;
    version: number;
  };
  to: {
    id: string;
    version: number;
  };
  contentChanges: PuzzleVersionContentChangeDto[];
  testCases: PuzzleVersionValueChangeDto | null;
  difficulty: PuzzleVersionValueChangeDto | null;
  hints: PuzzleVersionValueChangeDto | null;
}
