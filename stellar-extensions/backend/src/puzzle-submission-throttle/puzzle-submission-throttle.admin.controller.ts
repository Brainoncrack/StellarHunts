import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { AdminRole } from '../../../../backend/src/admin/admin-role.enum';
import { JwtAuthGuard } from '../../../../backend/src/admin/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../backend/src/admin/guards/roles.guard';
import { Roles } from '../../../../backend/src/admin/roles.decorator';
import { PuzzleSubmissionThrottleSettingsService } from './puzzle-submission-throttle.settings';

@Controller('admin/settings/puzzle-submission-throttle')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AdminRole.ADMIN, AdminRole.SUPERADMIN)
export class PuzzleSubmissionThrottleAdminController {
  constructor(
    private readonly settingsService: PuzzleSubmissionThrottleSettingsService,
  ) {}

  @Get()
  getSettings() {
    return this.settingsService.getSettings();
  }

  @Patch()
  updateSettings(@Body() settings: unknown) {
    return this.settingsService.updateSettings(settings);
  }
}
