import { ConflictException, ForbiddenException } from '@nestjs/common';
jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));
import { PuzzleCollaborationService } from './puzzle-collaboration.service';

describe('PuzzleCollaborationService', () => {
  const draft = { id: 'p1', createdBy: 'owner', status: 'draft', content: { title: 'old' } };
  let service: PuzzleCollaborationService;
  let drafts: any;
  let collaborators: any;
  let changes: any;
  let locks: any;
  let comments: any;

  beforeEach(() => {
    drafts = { findOne: jest.fn().mockResolvedValue({ ...draft }), save: jest.fn((value) => value) };
    collaborators = { findOne: jest.fn().mockResolvedValue(null), find: jest.fn(), create: jest.fn((v) => v), save: jest.fn((v) => v) };
    changes = { create: jest.fn((v) => v), save: jest.fn((v) => v), find: jest.fn() };
    locks = { findOne: jest.fn().mockResolvedValue(null), create: jest.fn((v) => v), save: jest.fn((v) => v), remove: jest.fn() };
    comments = { create: jest.fn((v) => v), save: jest.fn((v) => v), find: jest.fn() };
    service = new PuzzleCollaborationService(drafts, collaborators, changes, locks, comments);
  });

  it('only lets the owner invite collaborators and restricts invites to editor/reviewer roles', async () => {
    collaborators.save.mockImplementation((value: unknown) => Promise.resolve(value));
    await expect(service.invite('p1', 'editor', { userId: 'new-user', role: 'editor' })).rejects.toBeInstanceOf(ForbiddenException);
    await service.invite('p1', 'owner', { userId: 'new-user', role: 'reviewer' });
    expect(collaborators.save).toHaveBeenCalledWith({ puzzleId: 'p1', userId: 'new-user', role: 'reviewer' });
  });

  it('requires the current editor to own an unexpired section lock before changing content', async () => {
    collaborators.findOne.mockResolvedValue({ role: 'editor' });
    locks.findOne.mockResolvedValue({ userId: 'editor', expiresAt: new Date(Date.now() + 60_000) });
    await service.updateSection('p1', 'editor', { section: 'title', value: 'new' });
    expect(drafts.save).toHaveBeenCalledWith(expect.objectContaining({ content: { title: 'new' } }));
    expect(changes.save).toHaveBeenCalledWith(expect.objectContaining({
      authorId: 'editor',
      section: 'title',
      beforeValue: 'old',
      afterValue: 'new',
    }));

    locks.findOne.mockResolvedValue({ userId: 'other', expiresAt: new Date(Date.now() + 60_000) });
    await expect(service.updateSection('p1', 'editor', { section: 'title', value: 'blocked' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects reviewers from acquiring edit locks', async () => {
    collaborators.findOne.mockResolvedValue({ role: 'reviewer' });
    await expect(service.acquireLock('p1', 'reviewer', 'title')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
