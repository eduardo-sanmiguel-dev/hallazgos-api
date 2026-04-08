import { join } from 'path';

import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Res,
} from '@nestjs/common';

import * as XlsxPopulate from 'xlsx-populate';
import { Response } from 'express';

import { formatDateToDDMMYYYY } from '@shared/utils';

import { ExtinguisherInspectionsService } from './extinguisher-inspections.service';
import {
  CreateExtinguisherInspectionDto,
  QueryExtinguisherInspectionDto,
  UpdateExtinguisherInspectionDto,
} from './dto';

@Controller('extinguisher-inspections')
export class ExtinguisherInspectionsController {
  private readonly filePath: string = join(
    process.cwd(),
    'src/files',
    'RGOSGSST49 Revisión y mantenimiento de extintores.xlsx',
  );

  constructor(
    private readonly extinguisherInspectionsService: ExtinguisherInspectionsService,
  ) {}

  @Post()
  create(
    @Body() createExtinguisherInspectionDto: CreateExtinguisherInspectionDto,
  ) {
    return this.extinguisherInspectionsService.create(
      createExtinguisherInspectionDto,
    );
  }

  @Get()
  findAll(
    @Query() queryExtinguisherInspectionDto: QueryExtinguisherInspectionDto,
  ) {
    return this.extinguisherInspectionsService.findAll(
      queryExtinguisherInspectionDto,
    );
  }

  @Get('download/file/:id')
  async downloadFile(@Param('id') id: string, @Res() res: Response) {
    const inspection = await this.extinguisherInspectionsService.findOne(+id);
    const evaluations = inspection.evaluations || [];

    const workbook = await XlsxPopulate.fromFileAsync(this.filePath);

    const sheets = workbook
      .sheets()
      .filter((currentSheet) =>
        currentSheet.name().startsWith('RESGISTRO EXTINTORES'),
      );

    const inspectionDate = formatDateToDDMMYYYY(
      new Date(inspection.inspectionDate).toISOString(),
    );

    for (const sheet of sheets) {
      sheet
        .cell('B4')
        .value(`RESPONSABLE: ${inspection.responsible?.name || '-'}`);
      sheet.cell('I4').value(inspectionDate);
      sheet.cell('R4').value(inspection.manufacturingPlant?.name || '-');

      for (let row = 9; row <= 34; row++) {
        for (let col = 2; col <= 19; col++) {
          sheet.cell(row, col).value(null);
        }
      }

      evaluations.forEach((evaluation, idx) => {
        const currentRow = 9 + idx;
        if (currentRow > 34) {
          return;
        }

        sheet.cell(`B${currentRow}`).value(evaluation.location || '-');
        sheet
          .cell(`C${currentRow}`)
          .value(evaluation.extinguisherNumber || '-');
        sheet
          .cell(`D${currentRow}`)
          .value(evaluation.typeOfExtinguisher || '-');
        sheet.cell(`E${currentRow}`).value(evaluation.capacity || '-');

        sheet.cell(`F${currentRow}`).value(evaluation.pressureManometer || 'C');
        sheet.cell(`G${currentRow}`).value(evaluation.valve || 'C');
        sheet.cell(`H${currentRow}`).value(evaluation.hose || 'C');
        sheet.cell(`I${currentRow}`).value(evaluation.cylinder || 'C');
        sheet.cell(`J${currentRow}`).value(evaluation.barrette || 'C');
        sheet.cell(`K${currentRow}`).value(evaluation.seal || 'C');
        sheet.cell(`L${currentRow}`).value(evaluation.cornet || 'C');
        sheet.cell(`M${currentRow}`).value(evaluation.access || 'C');
        sheet.cell(`N${currentRow}`).value(evaluation.support || 'C');
        sheet.cell(`O${currentRow}`).value(evaluation.signaling || 'C');

        sheet
          .cell(`P${currentRow}`)
          .value(
            formatDateToDDMMYYYY(
              new Date(evaluation.nextRechargeDate).toISOString(),
            ),
          );
        sheet
          .cell(`Q${currentRow}`)
          .value(
            formatDateToDDMMYYYY(
              new Date(evaluation.maintenanceDate).toISOString(),
            ),
          );
        sheet.cell(`R${currentRow}`).value(evaluation.observations || '');
      });
    }

    const fileBuffer = await workbook.outputAsync();

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="RGOSGSST49_Inspeccion_${inspection.id}.xlsx"`,
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );

    return res.send(fileBuffer);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.extinguisherInspectionsService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateExtinguisherInspectionDto: UpdateExtinguisherInspectionDto,
  ) {
    return this.extinguisherInspectionsService.update(
      +id,
      updateExtinguisherInspectionDto,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.extinguisherInspectionsService.remove(+id);
  }
}
