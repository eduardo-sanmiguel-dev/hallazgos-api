import { join } from 'path';

import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  ParseIntPipe,
  Delete,
  Res,
  Query,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import XlsxPopulate from 'xlsx-populate';
import * as ExcelJS from 'exceljs';
import type { Response } from 'express';

import {
  buildAttachmentContentDisposition,
  createTempDir,
  formatDateToYYYYMMDD,
  removeTempDir,
} from '@shared/utils';
import { UserPlantPipe } from '@shared/pipes';
import { CreateEppDto, QueryEppDto, UpdateEppDto } from './dto';
import { EppsService } from './epps.service';
//import { writeFileSync } from 'fs';
import { writeFile } from 'fs/promises';

@Controller('epps')
export class EppsController {
  private readonly logger = new Logger(EppsController.name);

  private readonly filePath: string = join(
    process.cwd(),
    'src/files',
    'formatoEPP.xlsx',
  );

  // Nombre del archivo generado; se escribe en una carpeta temporal propia
  // de cada descarga (ver createTempDir).
  private readonly newFileName = 'archivo_actualizado.xlsx';

  private readonly imageBannerPath = join(
    process.cwd(),
    'src/files',
    'banner.png',
  );

  constructor(private readonly eppsService: EppsService) {}

  @Post()
  create(@Body() createEppDto: CreateEppDto) {
    return this.eppsService.create(createEppDto);
  }

  @Get()
  findAll(
    @Query() query: QueryEppDto,
    @Query('manufacturingPlantId', UserPlantPipe) manufacturingPlantId: number,
  ) {
    // Con `page` responde paginado ({ data, count, page, limit }); sin él, la
    // lista completa como antes (compatibilidad durante el despliegue).
    return query.page
      ? this.eppsService.findPaginated({ ...query, manufacturingPlantId })
      : this.eppsService.findAll(manufacturingPlantId);
  }

  @Get('validate-delivery-frequency')
  async validateDeliveryFrequency(
    @Query('equipmentId', ParseIntPipe) equipmentId: number,
    @Query('employeeId', ParseIntPipe) employeeId: number,
  ) {
    await this.eppsService.assertEmployeeInUserPlants(employeeId);

    return this.eppsService.validateDeliveryFrequency(equipmentId, employeeId);
  }

  @Get('download/file/:employeeId')
  async downloadFile(
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Query('timeZone') timeZone: string,
    @Res() res: Response,
  ) {
    await this.eppsService.assertEmployeeInUserPlants(employeeId);

    const fileName = await this.eppsService.getDownloadFileName(
      +employeeId,
      timeZone,
    );
    const epps = await this.eppsService.findEppsByEmployeeId(+employeeId);
    const epp = epps[0];

    // Antes, sin EPP registrados el archivo fallaba al armarse y respondía 500.
    if (!epp) {
      throw new NotFoundException(
        `El empleado #${employeeId} no tiene EPP registrados`,
      );
    }

    const equipments = epps.flatMap((epp) =>
      epp.equipments.map((item) => ({ ...item, signature: epp.signature })),
    );

    // Cada descarga trabaja en su propia carpeta: con una ruta compartida, dos
    // descargas simultáneas se pisaban y se podía entregar el archivo de otro.
    const tempDir = await createTempDir('epp');
    const filePathNewFile = join(tempDir, this.newFileName);

    XlsxPopulate.fromFileAsync(this.filePath)
      .then((workbook) => {
        const sheet = workbook.sheet('EPP Personas');

        const name = epp.employee.name;
        const code = epp.employee.code;

        sheet.cell('B4').value('NOMBRE DEL EMPLEADO: ' + name);
        sheet.cell('E4').value('CÉDULA: ' + code);

        const legalTextCell = sheet.cell('B34');
        const legalTextTemplate = legalTextCell.value();

        if (typeof legalTextTemplate === 'string') {
          const legalTextWithEmployeeData = legalTextTemplate
            .replace(/El Sr\. \(a\)\s*_+/i, `El Sr. (a) ${name}`)
            .replace(/No:\s*_+/i, `No: ${code}`);

          legalTextCell.value(legalTextWithEmployeeData);
        }

        sheet.cell('B5').value('CARGO: ' + epp.employee.position.name);
        sheet.cell('E5').value('ÁREA: ' + epp.employee.area.name);

        for (const [idx, equipment] of equipments.entries()) {
          const currentIdx = 9 + idx;

          sheet.cell(`B${currentIdx}`).value(equipment.equipment.name);
          sheet
            .cell(`C${currentIdx}`)
            .value(formatDateToYYYYMMDD(equipment.deliveryDate.toISOString()));
          sheet.cell(`E${currentIdx}`).value(equipment.observations);
        }

        return workbook.toFileAsync(filePathNewFile);
      })
      .then(async () => {
        const workbook = new ExcelJS.Workbook();

        await workbook.xlsx.readFile(filePathNewFile).then(async () => {
          const worksheet = workbook.worksheets[0];

          worksheet.pageSetup.printArea = 'A1:G36';

          worksheet.getColumn('F').width = 20;

          for (const [idx, equipment] of equipments.entries()) {
            const base64 = Buffer.from(
              equipment.signature.split(',')[1],
              'base64',
            );

            const currentIdx = 8 + idx;

            const imagePath = join(tempDir, `${currentIdx}temp-image.png`);

            await writeFile(imagePath, base64);

            const imageId = workbook.addImage({
              filename: imagePath,
              extension: 'png',
            });

            worksheet.addImage(imageId, {
              tl: { col: 5, row: currentIdx },
              ext: { width: 100, height: 25 },
            });
          }

          const imageIdBanner = workbook.addImage({
            filename: this.imageBannerPath,
            extension: 'png',
          });

          worksheet.addImage(imageIdBanner, {
            tl: { col: 1, row: 0 },
            ext: { width: 720, height: 160 },
          });

          return workbook.xlsx.writeFile(filePathNewFile);
        });

        // sendFile en lugar de download: download reemplazaría Content-Disposition
        // y no incluiría filename*.
        res.setHeader(
          'Content-Disposition',
          buildAttachmentContentDisposition(fileName),
        );
        res.sendFile(filePathNewFile, (err) => {
          void removeTempDir(tempDir);
          if (err) {
            res.status(500).send('Error al descargar el archivo');
          }
        });
      })
      .catch((err) => {
        void removeTempDir(tempDir);
        this.logger.error('Error al procesar el archivo', err?.stack ?? err);
        res.status(500).send('Error al procesar el archivo');
      });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.eppsService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateEppDto: UpdateEppDto) {
    return this.eppsService.update(+id, updateEppDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.eppsService.remove(+id);
  }

  @Delete('history/:equipmentHistoryId')
  removeHistory(@Param('equipmentHistoryId') equipmentHistoryId: string) {
    return this.eppsService.removeHistory(+equipmentHistoryId);
  }
}
