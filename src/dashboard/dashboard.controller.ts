import { Controller, Get, Param, Query } from '@nestjs/common';

import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  private parseAreaIds(areaIds?: string, areaId?: string): number[] {
    const source = areaIds || areaId || '';

    return Array.from(
      new Set(
        source
          .split(',')
          .map((item) => Number(item.trim()))
          .filter((item) => Number.isFinite(item) && item > 0),
      ),
    );
  }

  private parseResponsibleIds(
    responsibleIds?: string,
    responsibleId?: string,
  ): number[] {
    const source = responsibleIds || responsibleId || '';

    return Array.from(
      new Set(
        source
          .split(',')
          .map((item) => Number(item.trim()))
          .filter((item) => Number.isFinite(item) && item > 0),
      ),
    );
  }

  @Get('business-intelligence/epp')
  findBusinessIntelligenceEpp(
    @Query('manufacturingPlantId') manufacturingPlantId: string,
  ) {
    return this.dashboardService.findBusinessIntelligenceEpp(
      +manufacturingPlantId,
    );
  }

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
  @Get('average-resolution-time-by-user')
  findAverageResolutionTimeByUser(
    @Query('manufacturingPlantId') manufacturingPlantId: string,
    @Query('userId') userId: string,
    @Query('assigned') assigned: string,
  ) {
    return this.dashboardService.findAverageResolutionTimeByUser(
      +manufacturingPlantId,
      +userId,
      assigned === 'true',
    );
  }

  @Get('type-evidence-by-user')
  findTypeEvidenceByUser(
    @Query('manufacturingPlantId') manufacturingPlantId: string,
    @Query('userId') userId: string,
  ) {
    return this.dashboardService.findTypeEvidenceByUser(
      +manufacturingPlantId,
      +userId,
    );
  }

  @Get('pending-by-seniority-by-user')
  findPendingBySeniorityByUser(
    @Query('manufacturingPlantId') manufacturingPlantId: string,
    @Query('userId') userId: string,
  ) {
    return this.dashboardService.findPendingBySeniorityByUser(
      +manufacturingPlantId,
      +userId,
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

  @Get('status-by-filters')
  findStatusByFilters(
    @Query('manufacturingPlantId') manufacturingPlantId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('areaIds') areaIds?: string,
    @Query('areaId') areaId?: string,
    @Query('responsibleIds') responsibleIds?: string,
    @Query('responsibleId') responsibleId?: string,
  ) {
    return this.dashboardService.findStatusByFilters(
      +manufacturingPlantId,
      startDate,
      endDate,
      this.parseAreaIds(areaIds, areaId),
      this.parseResponsibleIds(responsibleIds, responsibleId),
    );
  }

  @Get('areas-by-filters')
  findAreasByFilters(
    @Query('manufacturingPlantId') manufacturingPlantId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('areaIds') areaIds?: string,
    @Query('areaId') areaId?: string,
    @Query('responsibleIds') responsibleIds?: string,
    @Query('responsibleId') responsibleId?: string,
  ) {
    return this.dashboardService.findAreasByFilters(
      +manufacturingPlantId,
      startDate,
      endDate,
      this.parseAreaIds(areaIds, areaId),
      this.parseResponsibleIds(responsibleIds, responsibleId),
    );
  }

  @Get('heatmap-by-filters')
  findHeatmapByFilters(
    @Query('manufacturingPlantId') manufacturingPlantId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('areaIds') areaIds?: string,
    @Query('areaId') areaId?: string,
    @Query('responsibleIds') responsibleIds?: string,
    @Query('responsibleId') responsibleId?: string,
  ) {
    return this.dashboardService.findHeatmapByFilters(
      +manufacturingPlantId,
      startDate,
      endDate,
      this.parseAreaIds(areaIds, areaId),
      this.parseResponsibleIds(responsibleIds, responsibleId),
    );
  }

  @Get('assigned-responsibles-by-filters')
  findAssignedResponsiblesByFilters(
    @Query('manufacturingPlantId') manufacturingPlantId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('areaIds') areaIds?: string,
    @Query('areaId') areaId?: string,
    @Query('responsibleIds') responsibleIds?: string,
    @Query('responsibleId') responsibleId?: string,
  ) {
    return this.dashboardService.findAssignedResponsiblesByFilters(
      +manufacturingPlantId,
      startDate,
      endDate,
      this.parseAreaIds(areaIds, areaId),
      this.parseResponsibleIds(responsibleIds, responsibleId),
    );
  }

  @Get('historical-by-month')
  findHistoricalByMonth() {
    return this.dashboardService.findHistoricalByMonth();
  }

  @Get('sankey-by-filters')
  findSankeyByFilters(
    @Query('manufacturingPlantId') manufacturingPlantId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('areaIds') areaIds?: string,
    @Query('areaId') areaId?: string,
    @Query('responsibleIds') responsibleIds?: string,
    @Query('responsibleId') responsibleId?: string,
  ) {
    return this.dashboardService.findSankeyByFilters(
      +manufacturingPlantId,
      startDate,
      endDate,
      this.parseAreaIds(areaIds, areaId),
      this.parseResponsibleIds(responsibleIds, responsibleId),
    );
  }

  @Get('packed-bubble-by-filters')
  findPackedBubbleByFilters(
    @Query('manufacturingPlantId') manufacturingPlantId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('areaIds') areaIds?: string,
    @Query('areaId') areaId?: string,
    @Query('responsibleIds') responsibleIds?: string,
    @Query('responsibleId') responsibleId?: string,
  ) {
    return this.dashboardService.findPackedBubbleByFilters(
      +manufacturingPlantId,
      startDate,
      endDate,
      this.parseAreaIds(areaIds, areaId),
      this.parseResponsibleIds(responsibleIds, responsibleId),
    );
  }

  @Get('solid-gauge-kpi-by-filters')
  findSolidGaugeKpiByFilters(
    @Query('manufacturingPlantId') manufacturingPlantId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('areaIds') areaIds?: string,
    @Query('areaId') areaId?: string,
    @Query('responsibleIds') responsibleIds?: string,
    @Query('responsibleId') responsibleId?: string,
  ) {
    return this.dashboardService.findSolidGaugeKpiByFilters(
      +manufacturingPlantId,
      startDate,
      endDate,
      this.parseAreaIds(areaIds, areaId),
      this.parseResponsibleIds(responsibleIds, responsibleId),
    );
  }

  @Get('area-range-line-by-filters')
  findAreaRangeLineByFilters(
    @Query('manufacturingPlantId') manufacturingPlantId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('areaIds') areaIds?: string,
    @Query('areaId') areaId?: string,
    @Query('responsibleIds') responsibleIds?: string,
    @Query('responsibleId') responsibleId?: string,
  ) {
    return this.dashboardService.findAreaRangeLineByFilters(
      +manufacturingPlantId,
      startDate,
      endDate,
      this.parseAreaIds(areaIds, areaId),
      this.parseResponsibleIds(responsibleIds, responsibleId),
    );
  }

  @Get('responsibles-by-filters')
  findResponsiblesByFilters(
    @Query('manufacturingPlantId') manufacturingPlantId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('areaIds') areaIds?: string,
    @Query('areaId') areaId?: string,
  ) {
    return this.dashboardService.findResponsiblesByFilters(
      +manufacturingPlantId,
      startDate,
      endDate,
      this.parseAreaIds(areaIds, areaId),
    );
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

  @Get('main-types-global-trend')
  findMainTypesGlobalTrend(
    @Query('manufacturingPlantId') manufacturingPlantId: string,
  ) {
    return this.dashboardService.findMainTypesGlobalTrend(
      +manufacturingPlantId,
    );
  }

  @Get('main-types-global-trend-details')
  findMainTypesGlobalTrendDetails(
    @Query('manufacturingPlantId') manufacturingPlantId: string,
    @Query('mainTypeId') mainTypeId: string,
  ) {
    return this.dashboardService.findMainTypesGlobalTrendDetails(
      +manufacturingPlantId,
      +mainTypeId,
    );
  }

  @Get('percentage-compliance-by-zone')
  findPercentageComplianceByZone(
    @Query('manufacturingPlantId') manufacturingPlantId: string,
    @Query('mainTypeId') mainTypeId: string,
  ) {
    return this.dashboardService.findPercentageComplianceByZone(
      +manufacturingPlantId,
      +mainTypeId,
    );
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
