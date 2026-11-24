import {
  Inject,
  Injectable,
  Optional,
  ServiceUnavailableException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { MaintenanceModeService } from '../../../../backend/src/maintenance-mode/maintenance-mode.service';
import { ADMIN_ONLY_KEY } from '../../../../backend/src/maintenance-mode/decorators/admin-only.decorator';
import { MAINTENANCE_EXEMPT_KEY } from '../../../../backend/src/maintenance-mode/decorators/maintenance-exempt.decorator';

export const MAINTENANCE_GUARD_OPTIONS = Symbol('MAINTENANCE_GUARD_OPTIONS');

export interface MaintenanceGuardOptions {
  excludedEndpoints?: string[];
}

interface MaintenanceRequest {
  path: string;
  user?: {
    role?: string;
    roles?: string[];
  };
}

const DEFAULT_EXCLUDED_ENDPOINTS = ['/health', '/auth/*'];

@Injectable()
export class MaintenanceGuard implements CanActivate {
  private readonly excludedEndpoints: string[];

  constructor(
    private readonly maintenanceModeService: MaintenanceModeService,
    private readonly reflector: Reflector,
    @Optional()
    @Inject(MAINTENANCE_GUARD_OPTIONS)
    options: MaintenanceGuardOptions = {},
  ) {
    this.excludedEndpoints = [
      ...DEFAULT_EXCLUDED_ENDPOINTS,
      ...(options.excludedEndpoints ?? []),
    ];
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isExempt = this.reflector.getAllAndOverride<boolean>(
      MAINTENANCE_EXEMPT_KEY,
      [context.getHandler(), context.getClass()],
    );
    const isAdminRoute = this.reflector.getAllAndOverride<boolean>(
      ADMIN_ONLY_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isExempt || isAdminRoute) return true;

    const request = context.switchToHttp().getRequest<MaintenanceRequest>();
    if (this.isAdmin(request)) return true;

    const status = await this.maintenanceModeService.getMaintenanceStatus();
    if (!this.isMaintenanceActive(status)) return true;

    const config = await this.maintenanceModeService.getMaintenanceConfig();
    const excludedRoutes = [
      ...this.excludedEndpoints,
      ...(config.allowedRoutes ?? []),
    ];
    if (this.matchesExcludedRoute(request.path, excludedRoutes)) return true;

    throw new ServiceUnavailableException({
      message:
        status.maintenanceMessage || 'System is currently under maintenance',
      maintenanceMode: true,
      scheduledEnd: status.scheduledEnd ?? null,
      reason: status.reason ?? null,
    });
  }

  private isAdmin(request: MaintenanceRequest): boolean {
    const roles = [request.user?.role, ...(request.user?.roles ?? [])]
      .filter((role): role is string => typeof role === 'string')
      .map((role) => role.toLowerCase());
    return roles.includes('admin') || roles.includes('superadmin');
  }

  private isMaintenanceActive(status: {
    isMaintenanceMode: boolean;
    scheduledStart?: Date | string | null;
    scheduledEnd?: Date | string | null;
  }): boolean {
    const start = this.toTimestamp(status.scheduledStart);
    const end = this.toTimestamp(status.scheduledEnd);
    if (start !== undefined || end !== undefined) {
      const now = Date.now();
      return (start === undefined || now >= start) && (end === undefined || now < end);
    }
    return status.isMaintenanceMode;
  }

  private toTimestamp(value?: Date | string | null): number | undefined {
    if (value == null) return undefined;
    const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
    if (!Number.isFinite(timestamp)) {
      throw new Error('Maintenance schedule contains an invalid date.');
    }
    return timestamp;
  }

  private matchesExcludedRoute(path: string, routes: string[]): boolean {
    const normalizedPath = path.length > 1 ? path.replace(/\/+$/, '') : path;
    return routes.some((route) => {
      const normalizedRoute =
        route.length > 1 ? route.replace(/\/+$/, '') : route;
      if (normalizedRoute.endsWith('*')) {
        return normalizedPath.startsWith(normalizedRoute.slice(0, -1));
      }
      return normalizedPath === normalizedRoute;
    });
  }
}
