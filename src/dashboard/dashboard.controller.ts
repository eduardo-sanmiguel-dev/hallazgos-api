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

  @Get('global-summary')
  findGlobalSummary(
    @Query('manufacturingPlantId') manufacturingPlantId: string,
  ) {
    return this.dashboardService.findGlobalSummary(+manufacturingPlantId);
  }

  @Get('ranking-of-responsibles')
  findRankingOfResponsibles(
    @Query('manufacturingPlantId') manufacturingPlantId: string,
  ) {
    return this.dashboardService.findRankingOfResponsibles(
      +manufacturingPlantId,
    );
  }

  @Get('average-resolution-time')
  findAverageResolutionTime(
    @Query('manufacturingPlantId') manufacturingPlantId: string,
  ) {
    return this.dashboardService.findAverageResolutionTime(
      +manufacturingPlantId,
    );
  }

  @Get('monthly-global-trend')
  findMonthlyGlobalTrend(
    @Query('manufacturingPlantId') manufacturingPlantId: string,
    @Query('isAdmin') isAdmin: string,
    @Query('userId') userId: string,
  ) {
    return this.dashboardService.findMonthlyGlobalTrend(
      +manufacturingPlantId,
      isAdmin === 'true',
      Number(userId) ? +userId : 0,
    );
  }

  @Get('monthly-type-trend')
  findMonthlyTypeTrend(
    @Query('manufacturingPlantId') manufacturingPlantId: string,
  ) {
    return this.dashboardService.findMonthlyTypeTrend(+manufacturingPlantId);
  }

  @Get('monthly-subtype-trend')
  findMonthlySubtypeTrend(
    @Query('manufacturingPlantId') manufacturingPlantId: string,
  ) {
    return this.dashboardService.findMonthlySubtypeTrend(+manufacturingPlantId);
  }

  @Get('open-evidences')
  findOpenEvidences(
    @Query('manufacturingPlantId') manufacturingPlantId: string,
    @Query('userId') userId: string,
  ) {
    return this.dashboardService.findOpenEvidences(
      +manufacturingPlantId,
      +userId,
    );
  }

  @Get('recent-evidences')
  findRecentEvidences(
    @Query('manufacturingPlantId') manufacturingPlantId: string,
    @Query('userId') userId: string,
  ) {
    return this.dashboardService.findRecentEvidences(
      +manufacturingPlantId,
      +userId,
    );
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
