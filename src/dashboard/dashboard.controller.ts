import { Controller, Get, ParseIntPipe, Query } from '@nestjs/common';

import { UserPlantPipe } from '../shared/pipes/index.js';
import { DashboardService } from './dashboard.service.js';

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

  private parseMainTypeIds(
    mainTypeIds?: string,
    mainTypeId?: string,
  ): number[] {
    const source = mainTypeIds || mainTypeId || '';

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
    @Query('manufacturingPlantId', UserPlantPipe) manufacturingPlantId: number,
  ) {
    return this.dashboardService.findBusinessIntelligenceEpp(
      manufacturingPlantId,
    );
  }

  @Get('critical-zones')
  findCriticalZones(
    @Query('manufacturingPlantId', UserPlantPipe) manufacturingPlantId: number,
  ) {
    return this.dashboardService.findCriticalZones(manufacturingPlantId);
  }

  @Get('global-summary')
  findGlobalSummary(
    @Query('manufacturingPlantId', UserPlantPipe) manufacturingPlantId: number,
  ) {
    return this.dashboardService.findGlobalSummary(manufacturingPlantId);
  }

  @Get('ranking-of-responsibles')
  findRankingOfResponsibles(
    @Query('manufacturingPlantId', UserPlantPipe) manufacturingPlantId: number,
  ) {
    return this.dashboardService.findRankingOfResponsibles(
      manufacturingPlantId,
    );
  }

  @Get('average-resolution-time')
  findAverageResolutionTime(
    @Query('manufacturingPlantId', UserPlantPipe) manufacturingPlantId: number,
  ) {
    return this.dashboardService.findAverageResolutionTime(
      manufacturingPlantId,
    );
  }
  @Get('monthly-type-trend')
  findMonthlyTypeTrend(
    @Query('manufacturingPlantId', UserPlantPipe) manufacturingPlantId: number,
  ) {
    return this.dashboardService.findMonthlyTypeTrend(manufacturingPlantId);
  }

  @Get('monthly-subtype-trend')
  findMonthlySubtypeTrend(
    @Query('manufacturingPlantId', UserPlantPipe) manufacturingPlantId: number,
  ) {
    return this.dashboardService.findMonthlySubtypeTrend(manufacturingPlantId);
  }

  @Get('status')
  findAllStatus() {
    return this.dashboardService.findAllStatus();
  }

  @Get('status-by-filters')
  findStatusByFilters(
    @Query('manufacturingPlantId', UserPlantPipe) manufacturingPlantId: number,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('areaIds') areaIds?: string,
    @Query('areaId') areaId?: string,
    @Query('responsibleIds') responsibleIds?: string,
    @Query('responsibleId') responsibleId?: string,
    @Query('mainTypeIds') mainTypeIds?: string,
    @Query('mainTypeId') mainTypeId?: string,
  ) {
    return this.dashboardService.findStatusByFilters(
      manufacturingPlantId,
      startDate,
      endDate,
      this.parseAreaIds(areaIds, areaId),
      this.parseResponsibleIds(responsibleIds, responsibleId),
      this.parseMainTypeIds(mainTypeIds, mainTypeId),
    );
  }

  @Get('priority-intervention-by-filters')
  findPriorityInterventionByFilters(
    @Query('manufacturingPlantId', UserPlantPipe) manufacturingPlantId: number,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('areaIds') areaIds?: string,
    @Query('areaId') areaId?: string,
    @Query('responsibleIds') responsibleIds?: string,
    @Query('responsibleId') responsibleId?: string,
    @Query('mainTypeIds') mainTypeIds?: string,
    @Query('mainTypeId') mainTypeId?: string,
  ) {
    return this.dashboardService.findPriorityInterventionByFilters(
      manufacturingPlantId,
      startDate,
      endDate,
      this.parseAreaIds(areaIds, areaId),
      this.parseResponsibleIds(responsibleIds, responsibleId),
      this.parseMainTypeIds(mainTypeIds, mainTypeId),
    );
  }

  @Get('risk-level-by-filters')
  findRiskLevelByFilters(
    @Query('manufacturingPlantId', UserPlantPipe) manufacturingPlantId: number,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('areaIds') areaIds?: string,
    @Query('areaId') areaId?: string,
    @Query('responsibleIds') responsibleIds?: string,
    @Query('responsibleId') responsibleId?: string,
    @Query('mainTypeIds') mainTypeIds?: string,
    @Query('mainTypeId') mainTypeId?: string,
  ) {
    return this.dashboardService.findRiskLevelByFilters(
      manufacturingPlantId,
      startDate,
      endDate,
      this.parseAreaIds(areaIds, areaId),
      this.parseResponsibleIds(responsibleIds, responsibleId),
      this.parseMainTypeIds(mainTypeIds, mainTypeId),
    );
  }

  @Get('areas-by-filters')
  findAreasByFilters(
    @Query('manufacturingPlantId', UserPlantPipe) manufacturingPlantId: number,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('areaIds') areaIds?: string,
    @Query('areaId') areaId?: string,
    @Query('responsibleIds') responsibleIds?: string,
    @Query('responsibleId') responsibleId?: string,
    @Query('mainTypeIds') mainTypeIds?: string,
    @Query('mainTypeId') mainTypeId?: string,
  ) {
    return this.dashboardService.findAreasByFilters(
      manufacturingPlantId,
      startDate,
      endDate,
      this.parseAreaIds(areaIds, areaId),
      this.parseResponsibleIds(responsibleIds, responsibleId),
      this.parseMainTypeIds(mainTypeIds, mainTypeId),
    );
  }

  @Get('main-types-by-filters')
  findMainTypesByFilters(
    @Query('manufacturingPlantId', UserPlantPipe) manufacturingPlantId: number,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('areaIds') areaIds?: string,
    @Query('areaId') areaId?: string,
    @Query('responsibleIds') responsibleIds?: string,
    @Query('responsibleId') responsibleId?: string,
    @Query('mainTypeIds') mainTypeIds?: string,
    @Query('mainTypeId') mainTypeId?: string,
  ) {
    return this.dashboardService.findMainTypesByFilters(
      manufacturingPlantId,
      startDate,
      endDate,
      this.parseAreaIds(areaIds, areaId),
      this.parseResponsibleIds(responsibleIds, responsibleId),
      this.parseMainTypeIds(mainTypeIds, mainTypeId),
    );
  }

  @Get('heatmap-by-filters')
  findHeatmapByFilters(
    @Query('manufacturingPlantId', UserPlantPipe) manufacturingPlantId: number,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('areaIds') areaIds?: string,
    @Query('areaId') areaId?: string,
    @Query('responsibleIds') responsibleIds?: string,
    @Query('responsibleId') responsibleId?: string,
    @Query('mainTypeIds') mainTypeIds?: string,
    @Query('mainTypeId') mainTypeId?: string,
  ) {
    return this.dashboardService.findHeatmapByFilters(
      manufacturingPlantId,
      startDate,
      endDate,
      this.parseAreaIds(areaIds, areaId),
      this.parseResponsibleIds(responsibleIds, responsibleId),
      this.parseMainTypeIds(mainTypeIds, mainTypeId),
    );
  }

  @Get('assigned-responsibles-by-filters')
  findAssignedResponsiblesByFilters(
    @Query('manufacturingPlantId', UserPlantPipe) manufacturingPlantId: number,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('areaIds') areaIds?: string,
    @Query('areaId') areaId?: string,
    @Query('responsibleIds') responsibleIds?: string,
    @Query('responsibleId') responsibleId?: string,
    @Query('mainTypeIds') mainTypeIds?: string,
    @Query('mainTypeId') mainTypeId?: string,
  ) {
    return this.dashboardService.findAssignedResponsiblesByFilters(
      manufacturingPlantId,
      startDate,
      endDate,
      this.parseAreaIds(areaIds, areaId),
      this.parseResponsibleIds(responsibleIds, responsibleId),
      this.parseMainTypeIds(mainTypeIds, mainTypeId),
    );
  }

  @Get('historical-by-month')
  findHistoricalByMonth() {
    return this.dashboardService.findHistoricalByMonth();
  }

  @Get('sankey-by-filters')
  findSankeyByFilters(
    @Query('manufacturingPlantId', UserPlantPipe) manufacturingPlantId: number,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('areaIds') areaIds?: string,
    @Query('areaId') areaId?: string,
    @Query('responsibleIds') responsibleIds?: string,
    @Query('responsibleId') responsibleId?: string,
    @Query('mainTypeIds') mainTypeIds?: string,
    @Query('mainTypeId') mainTypeId?: string,
  ) {
    return this.dashboardService.findSankeyByFilters(
      manufacturingPlantId,
      startDate,
      endDate,
      this.parseAreaIds(areaIds, areaId),
      this.parseResponsibleIds(responsibleIds, responsibleId),
      this.parseMainTypeIds(mainTypeIds, mainTypeId),
    );
  }

  @Get('packed-bubble-by-filters')
  findPackedBubbleByFilters(
    @Query('manufacturingPlantId', UserPlantPipe) manufacturingPlantId: number,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('areaIds') areaIds?: string,
    @Query('areaId') areaId?: string,
    @Query('responsibleIds') responsibleIds?: string,
    @Query('responsibleId') responsibleId?: string,
    @Query('mainTypeIds') mainTypeIds?: string,
    @Query('mainTypeId') mainTypeId?: string,
  ) {
    return this.dashboardService.findPackedBubbleByFilters(
      manufacturingPlantId,
      startDate,
      endDate,
      this.parseAreaIds(areaIds, areaId),
      this.parseResponsibleIds(responsibleIds, responsibleId),
      this.parseMainTypeIds(mainTypeIds, mainTypeId),
    );
  }

  @Get('solid-gauge-kpi-by-filters')
  findSolidGaugeKpiByFilters(
    @Query('manufacturingPlantId', UserPlantPipe) manufacturingPlantId: number,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('areaIds') areaIds?: string,
    @Query('areaId') areaId?: string,
    @Query('responsibleIds') responsibleIds?: string,
    @Query('responsibleId') responsibleId?: string,
    @Query('mainTypeIds') mainTypeIds?: string,
    @Query('mainTypeId') mainTypeId?: string,
  ) {
    return this.dashboardService.findSolidGaugeKpiByFilters(
      manufacturingPlantId,
      startDate,
      endDate,
      this.parseAreaIds(areaIds, areaId),
      this.parseResponsibleIds(responsibleIds, responsibleId),
      this.parseMainTypeIds(mainTypeIds, mainTypeId),
    );
  }

  @Get('area-range-line-by-filters')
  findAreaRangeLineByFilters(
    @Query('manufacturingPlantId', UserPlantPipe) manufacturingPlantId: number,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('areaIds') areaIds?: string,
    @Query('areaId') areaId?: string,
    @Query('responsibleIds') responsibleIds?: string,
    @Query('responsibleId') responsibleId?: string,
    @Query('mainTypeIds') mainTypeIds?: string,
    @Query('mainTypeId') mainTypeId?: string,
  ) {
    return this.dashboardService.findAreaRangeLineByFilters(
      manufacturingPlantId,
      startDate,
      endDate,
      this.parseAreaIds(areaIds, areaId),
      this.parseResponsibleIds(responsibleIds, responsibleId),
      this.parseMainTypeIds(mainTypeIds, mainTypeId),
    );
  }

  @Get('responsibles-by-filters')
  findResponsiblesByFilters(
    @Query('manufacturingPlantId', UserPlantPipe) manufacturingPlantId: number,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('areaIds') areaIds?: string,
    @Query('areaId') areaId?: string,
    @Query('mainTypeIds') mainTypeIds?: string,
    @Query('mainTypeId') mainTypeId?: string,
  ) {
    return this.dashboardService.findResponsiblesByFilters(
      manufacturingPlantId,
      startDate,
      endDate,
      this.parseAreaIds(areaIds, areaId),
      this.parseMainTypeIds(mainTypeIds, mainTypeId),
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
  findAllEvidencesByMonth(
    @Query('year', new ParseIntPipe({ optional: true })) year?: number,
  ) {
    return this.dashboardService.findAllEvidencesByMonth(year);
  }

  @Get('main-types-global-trend')
  findMainTypesGlobalTrend(
    @Query('manufacturingPlantId', UserPlantPipe) manufacturingPlantId: number,
  ) {
    return this.dashboardService.findMainTypesGlobalTrend(manufacturingPlantId);
  }

  @Get('main-types-global-trend-details')
  findMainTypesGlobalTrendDetails(
    @Query('manufacturingPlantId', UserPlantPipe) manufacturingPlantId: number,
    @Query('mainTypeId') mainTypeId: string,
  ) {
    return this.dashboardService.findMainTypesGlobalTrendDetails(
      manufacturingPlantId,
      +mainTypeId,
    );
  }

  @Get('percentage-compliance-by-zone')
  findPercentageComplianceByZone(
    @Query('manufacturingPlantId', UserPlantPipe) manufacturingPlantId: number,
    @Query('mainTypeId') mainTypeId: string,
  ) {
    return this.dashboardService.findPercentageComplianceByZone(
      manufacturingPlantId,
      +mainTypeId,
    );
  }

  @Get('accidents-by-month')
  findAllAccidentsByMonth(
    @Query('year', new ParseIntPipe({ optional: true })) year?: number,
  ) {
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
