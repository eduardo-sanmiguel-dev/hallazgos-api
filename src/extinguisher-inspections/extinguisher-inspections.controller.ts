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

    const startRow = 9;
    const templateEndRow = 34;
    const footerTemplateRow = 35;
    const templateCapacity = templateEndRow - startRow + 1;
    const columnNameToNumber = (columnName: string) => {
      let result = 0;

      for (let i = 0; i < columnName.length; i++) {
        result = result * 26 + (columnName.charCodeAt(i) - 64);
      }

      return result;
    };

    const columnNumberToName = (columnNumber: number) => {
      let result = '';
      let current = columnNumber;

      while (current > 0) {
        const remainder = (current - 1) % 26;
        result = String.fromCharCode(65 + remainder) + result;
        current = Math.floor((current - 1) / 26);
      }

      return result;
    };

    for (const sheet of sheets) {
      sheet
        .cell('B4')
        .value(`RESPONSABLE: ${inspection.responsible?.name || '-'}`);
      sheet.cell('I4').value(inspectionDate);
      sheet.cell('R4').value(inspection.manufacturingPlant?.name || '-');

      // La fila 35 del layout es el footer y debe mantenerse al final.
      const footerRowHeight = sheet.row(footerTemplateRow).height();
      const footerMergeRefs = Object.keys((sheet as any)._mergeCells || {})
        .filter((ref) => {
          const match = ref.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
          if (!match) return false;

          const startRowRef = Number(match[2]);
          const endRowRef = Number(match[4]);
          const startColRef = columnNameToNumber(match[1]);
          const endColRef = columnNameToNumber(match[3]);

          const isFooterRowMerge =
            startRowRef <= footerTemplateRow && endRowRef >= footerTemplateRow;
          const isWithinDataColumns = startColRef >= 2 && endColRef <= 19;

          return isFooterRowMerge && isWithinDataColumns;
        })
        .map((ref) => {
          const match = ref.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
          if (!match) {
            return null;
          }

          return {
            ref,
            startCol: columnNameToNumber(match[1]),
            startRowRef: Number(match[2]),
            endCol: columnNameToNumber(match[3]),
            endRowRef: Number(match[4]),
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      const footerSnapshot = Array.from({ length: 18 }, (_, idx) => {
        const col = 2 + idx;
        const source = sheet.cell(footerTemplateRow, col);

        return {
          col,
          value: source.value(),
          styles: {
            bold: source.style('bold'),
            italic: source.style('italic'),
            underline: source.style('underline'),
            fontColor: source.style('fontColor'),
            fontFamily: source.style('fontFamily'),
            fontSize: source.style('fontSize'),
            fill: source.style('fill'),
            horizontalAlignment: source.style('horizontalAlignment'),
            verticalAlignment: source.style('verticalAlignment'),
            wrapText: source.style('wrapText'),
            numberFormat: source.style('numberFormat'),
            border: source.style('border'),
          },
        };
      });

      const dataBaseFontColorByColumn = Array.from({ length: 18 }, (_, idx) => {
        const col = 2 + idx;
        return {
          col,
          fontColor: sheet.cell(startRow, col).style('fontColor'),
          bold: sheet.cell(startRow, col).style('bold'),
        };
      });

      const rowsToPrepare = Math.max(templateCapacity, evaluations.length);
      const endDynamicRow = startRow + rowsToPrepare - 1;

      // xlsx-populate en este proyecto no expone insertAndCopyDown,
      // por lo que replicamos formato de la fila plantilla hacia abajo.
      if (endDynamicRow > templateEndRow) {
        const templateRowHeight = sheet.row(templateEndRow).height();
        const styleKeys = [
          'bold',
          'italic',
          'underline',
          'fontColor',
          'fontFamily',
          'fontSize',
          'fill',
          'horizontalAlignment',
          'verticalAlignment',
          'wrapText',
          'numberFormat',
          'border',
        ] as const;

        for (let row = templateEndRow + 1; row <= endDynamicRow; row++) {
          if (templateRowHeight !== undefined) {
            sheet.row(row).height(templateRowHeight);
          }

          for (let col = 2; col <= 19; col++) {
            const sourceCell = sheet.cell(templateEndRow, col);
            const targetCell = sheet.cell(row, col);

            for (const styleKey of styleKeys) {
              const styleValue = sourceCell.style(styleKey);
              if (styleValue !== undefined) {
                targetCell.style(styleKey, styleValue);
              }
            }
          }
        }
      }

      for (let row = startRow; row <= endDynamicRow; row++) {
        for (let col = 2; col <= 19; col++) {
          sheet.cell(row, col).value(null);
        }
      }

      evaluations.forEach((evaluation, idx) => {
        const currentRow = startRow + idx;

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

      const footerTargetRow = Math.max(footerTemplateRow, endDynamicRow + 1);

      if (footerTargetRow !== footerTemplateRow) {
        for (const mergeInfo of footerMergeRefs) {
          sheet.range(mergeInfo.ref).merged(false);

          const rowOffset = mergeInfo.startRowRef - footerTemplateRow;
          const endRowOffset = mergeInfo.endRowRef - footerTemplateRow;
          const targetStartRow = footerTargetRow + rowOffset;
          const targetEndRow = footerTargetRow + endRowOffset;
          const targetRef = `${columnNumberToName(mergeInfo.startCol)}${targetStartRow}:${columnNumberToName(mergeInfo.endCol)}${targetEndRow}`;

          sheet.range(targetRef).merged(true);
        }
      }

      if (footerRowHeight !== undefined) {
        sheet.row(footerTargetRow).height(footerRowHeight);
      }

      for (const cellData of footerSnapshot) {
        const target = sheet.cell(footerTargetRow, cellData.col);

        target.value(cellData.value);
        target.style('bold', cellData.styles.bold);
        target.style('italic', cellData.styles.italic);
        target.style('underline', cellData.styles.underline);
        target.style('fontColor', cellData.styles.fontColor);
        target.style('fontFamily', cellData.styles.fontFamily);
        target.style('fontSize', cellData.styles.fontSize);
        target.style('fill', cellData.styles.fill);
        target.style(
          'horizontalAlignment',
          cellData.styles.horizontalAlignment,
        );
        target.style('verticalAlignment', cellData.styles.verticalAlignment);
        target.style('wrapText', cellData.styles.wrapText);
        target.style('numberFormat', cellData.styles.numberFormat);
        target.style('border', cellData.styles.border);
      }

      sheet.definedName(
        '_xlnm.Print_Area',
        sheet.range(`A1:S${footerTargetRow}`),
      );

      // Evita que queden colores heredados del footer (ej. rojo en fila 36).
      for (let row = startRow; row <= endDynamicRow; row++) {
        for (const colorByColumn of dataBaseFontColorByColumn) {
          const target = sheet.cell(row, colorByColumn.col);

          if (colorByColumn.fontColor !== undefined) {
            target.style('fontColor', colorByColumn.fontColor);
          } else {
            target.style('fontColor', '000000');
          }

          if (colorByColumn.bold !== undefined) {
            target.style('bold', colorByColumn.bold);
          } else {
            target.style('bold', false);
          }
        }
      }
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
