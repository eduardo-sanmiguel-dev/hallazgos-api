import { join } from 'path';

import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Res,
  Query,
} from '@nestjs/common';

import * as XlsxPopulate from 'xlsx-populate';
import * as ExcelJS from 'exceljs';
import { Response } from 'express';

import { formatDateToYYYYMMDD } from '@shared/utils';
import { CreateEppDto, UpdateEppDto } from './dto';
import { EppsService } from './epps.service';
//import { writeFileSync } from 'fs';
import { writeFile } from 'fs/promises';

@Controller('epps')
export class EppsController {
  private readonly filePath: string = join(
    process.cwd(),
    'src/files',
    'formatoEPP.xlsx',
  );

  private readonly filePathNewFile = join(
    process.cwd(),
    'src/files',
    'archivo_actualizado.xlsx',
  );

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
  findAll(@Query('manufacturingPlantId') manufacturingPlantId: string) {
    return this.eppsService.findAll(+manufacturingPlantId);
  }

  @Get('validate-delivery-frequency')
  validateDeliveryFrequency(
    @Query('equipmentId') equipmentId: string,
    @Query('employeeId') employeeId: string,
  ) {
    return this.eppsService.validateDeliveryFrequency(
      +equipmentId,
      +employeeId,
    );
  }

  @Get('download/file/:employeeId')
  async downloadFile(
    @Param('employeeId') employeeId: string,
    @Res() res: Response,
  ) {
    const epps = await this.eppsService.findEppsByEmployeeId(+employeeId);
    const epp = epps[0];

    const equipments = epps.flatMap((epp) =>
      epp.equipments.map((item) => ({ ...item, signature: epp.signature })),
    );

    XlsxPopulate.fromFileAsync(this.filePath)
      .then((workbook) => {
        const sheet = workbook.sheet('EPP Personas');

        sheet.cell('B4').value('NOMBRE DEL EMPLEADO: ' + epp.employee.name);
        sheet.cell('E4').value('CÉDULA: ' + epp.employee.code);

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

        return workbook.toFileAsync(this.filePathNewFile);
      })
      .then(async () => {
        const workbook = new ExcelJS.Workbook();

        await workbook.xlsx.readFile(this.filePathNewFile).then(async () => {
          const worksheet = workbook.worksheets[0];

          worksheet.pageSetup.printArea = 'A1:G36';

          worksheet.getColumn('F').width = 20;

          for (const [idx, equipment] of equipments.entries()) {
            const base64 = Buffer.from(
              equipment.signature.split(',')[1],
              'base64',
            );

            const currentIdx = 8 + idx;

            const imagePath = join(
              process.cwd(),
              'src/files',
              `${currentIdx}temp-image.png`,
            );

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

          return workbook.xlsx.writeFile(this.filePathNewFile);
        });

        res.download(this.filePathNewFile, (err) => {
          if (err) {
            res.status(500).send('Error al descargar el archivo');
          }
        });
      })
      .catch((err) => {
        console.error('Error al procesar el archivo:', err);
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
}
