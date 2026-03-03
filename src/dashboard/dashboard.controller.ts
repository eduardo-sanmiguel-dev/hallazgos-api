import { Controller, Get, Param, Query } from '@nestjs/common';

import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('my-evidences/:userId')
  findMyEvidences(@Param('userId') userId: number) {
    return this.dashboardService.findMyEvidences(userId);
  }

  @Get('critical-zones')
  findCriticalZones(
    @Query('manufacturingPlantId') manufacturingPlantId: string,
  ) {
    return this.dashboardService.findCriticalZones(+manufacturingPlantId);
  }

  @Get('status')
  findAllStatus() {
    return this.dashboardService.findAllStatus();
  }

  @Get('zones')
  findAllZones() {
    return this.dashboardService.findAllZones();
  }

  @Get('main-types')
  findAllMainTypes() {
    return this.dashboardService.findAllMainTypes();
  }

  @Get('evidences-by-month')
  findAllEvidencesByMonth(@Query('year') year: number) {
    return this.dashboardService.findAllEvidencesByMonth(year);
  }

  @Get('accidents-by-month')
  findAllAccidentsByMonth(@Query('year') year: number) {
    return this.dashboardService.findAllAccidentsByMonth(year);
  }

  @Get('top-users-by-plant')
  findTopUsersByPlant() {
    return this.dashboardService.findTopUsersByPlant();
  }

  @Get('open-vs-closed')
  findOpenVsClosed() {
    return this.dashboardService.findOpenVsClosed();
  }

  @Get('accidents-rate')
  findAccidentsRate() {
    return this.dashboardService.findAccidentsRate();
  }
}
