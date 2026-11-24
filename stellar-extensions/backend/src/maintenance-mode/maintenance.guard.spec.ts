import { ExecutionContext, HttpStatus } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { MaintenanceModeService } from '../../../../backend/src/maintenance-mode/maintenance-mode.service';
import { MaintenanceGuard } from './maintenance.guard';

function buildContext(
  path: string,
  user?: { role?: string; roles?: string[] },
): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ path, user }),
    }),
  } as unknown as ExecutionContext;
}

describe('MaintenanceGuard', () => {
  let service: {
    getMaintenanceStatus: jest.Mock;
    getMaintenanceConfig: jest.Mock;
  };
  let reflector: { getAllAndOverride: jest.Mock };
  let guard: MaintenanceGuard;

  beforeEach(() => {
    service = {
      getMaintenanceStatus: jest.fn().mockResolvedValue({
        isMaintenanceMode: true,
        maintenanceMessage: 'Maintenance in progress',
        scheduledStart: null,
        scheduledEnd: null,
        reason: 'Upgrade',
      }),
      getMaintenanceConfig: jest.fn().mockResolvedValue({
        allowedRoutes: ['/public/status'],
      }),
    };
    reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    };
    guard = new MaintenanceGuard(
      service as unknown as MaintenanceModeService,
      reflector as unknown as Reflector,
    );
  });

  it('blocks non-admin requests with a 503 maintenance response', async () => {
    await expect(guard.canActivate(buildContext('/puzzles'))).rejects.toMatchObject({
      status: HttpStatus.SERVICE_UNAVAILABLE,
      response: {
        message: 'Maintenance in progress',
        maintenanceMode: true,
      },
    });
  });

  it('allows admins and configured or default excluded endpoints', async () => {
    await expect(
      guard.canActivate(buildContext('/puzzles', { role: 'admin' })),
    ).resolves.toBe(true);
    await expect(guard.canActivate(buildContext('/health'))).resolves.toBe(true);
    await expect(guard.canActivate(buildContext('/auth/login'))).resolves.toBe(
      true,
    );
    await expect(
      guard.canActivate(buildContext('/public/status')),
    ).resolves.toBe(true);
    expect(service.getMaintenanceStatus).toHaveBeenCalledTimes(3);
  });

  it('applies scheduled windows even when the cron has not toggled the flag', async () => {
    service.getMaintenanceStatus.mockResolvedValue({
      isMaintenanceMode: false,
      maintenanceMessage: 'Scheduled maintenance',
      scheduledStart: new Date(Date.now() - 60_000),
      scheduledEnd: new Date(Date.now() + 60_000),
      reason: null,
    });
    await expect(guard.canActivate(buildContext('/puzzles'))).rejects.toMatchObject({
      status: HttpStatus.SERVICE_UNAVAILABLE,
    });
  });

  it('allows traffic outside a scheduled window', async () => {
    service.getMaintenanceStatus.mockResolvedValue({
      isMaintenanceMode: true,
      scheduledStart: new Date(Date.now() + 60_000),
      scheduledEnd: new Date(Date.now() + 120_000),
    });
    await expect(guard.canActivate(buildContext('/puzzles'))).resolves.toBe(true);
  });

  it('honors maintenance-exempt route metadata', async () => {
    reflector.getAllAndOverride.mockReturnValueOnce(true);
    await expect(guard.canActivate(buildContext('/puzzles'))).resolves.toBe(true);
    expect(service.getMaintenanceStatus).not.toHaveBeenCalled();
  });
});
