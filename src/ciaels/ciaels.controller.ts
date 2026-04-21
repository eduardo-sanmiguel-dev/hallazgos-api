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
} from '@nestjs/common';

import * as XlsxPopulate from 'xlsx-populate';
//import * as ExcelJS from 'exceljs';
import { Response } from 'express';

import { calculateAge } from '@shared/utils';
import { CreateCiaelDto, UpdateCiaelDto } from './dto';
import { CiaelsService } from './ciaels.service';

@Controller('ciaels')
export class CiaelsController {
  private readonly filePath: string = join(
    process.cwd(),
    'src/files',
    'CIAEL.xlsx',
  );

  private readonly filePathNewFile = join(
    process.cwd(),
    'src/files',
    'archivo_actualizado_ciael.xlsx',
  );

  constructor(private readonly ciaelsService: CiaelsService) {}

  @Post()
  create(@Body() createCiaelDto: CreateCiaelDto) {
    return this.ciaelsService.create(createCiaelDto);
  }

  @Post('seed')
  seed() {
    return this.ciaelsService.seed();
  }

  @Get('download/excel')
  async downloadFile(@Res() res: Response) {
    const data = await this.ciaelsService.findAll();

    XlsxPopulate.fromFileAsync(this.filePath)
      .then((workbook) => {
        const sheet = workbook.sheet('Registro');

        for (const [idx, ciael] of data.entries()) {
          const currentIdx = 9 + idx;

          const birthdate =
            typeof ciael.employee.birthdate === 'string' &&
            ciael.employee.birthdate
              ? ciael.employee.birthdate
              : '';

          const eventDateObj = new Date(ciael.eventDate);
          const eventYear = eventDateObj.getFullYear();

          sheet.cell(`A${currentIdx}`).value(ciael.typeOfEvent.name);
          sheet.cell(`B${currentIdx}`).value(ciael.description);
          sheet.cell(`C${currentIdx}`).value(ciael.employee.code);
          sheet.cell(`D${currentIdx}`).value(ciael.employee.name);
          sheet.cell(`E${currentIdx}`).value(ciael.employee.gender?.name || '');
          sheet.cell(`F${currentIdx}`).value(birthdate);
          sheet
            .cell(`G${currentIdx}`)
            .value(birthdate ? calculateAge(birthdate) : '');
          sheet.cell(`H${currentIdx}`).value(ciael.eventDate);
          sheet.cell(`I${currentIdx}`).value(eventYear);
          sheet
            .cell(`J${currentIdx}`)
            .value(
              eventDateObj
                .toLocaleString('es-MX', { month: 'long', timeZone: 'UTC' })
                .toUpperCase(),
            );
          sheet.cell(`K${currentIdx}`).value(ciael.cieDiagnosis.name);
          sheet.cell(`L${currentIdx}`).value(ciael.daysOfDisability);
          sheet
            .cell(`M${currentIdx}`)
            .value(ciael.zone.area?.name || 'Sin zona asignada');
          sheet.cell(`N${currentIdx}`).value(ciael.accidentPosition.name);
          sheet.cell(`O${currentIdx}`).value(ciael.bodyPart.name);
          sheet.cell(`P${currentIdx}`).value(ciael.atAgent.name);
          sheet.cell(`Q${currentIdx}`).value(ciael.typeOfInjury.name);
          sheet.cell(`R${currentIdx}`).value(ciael.atMechanism.name);
          sheet.cell(`S${currentIdx}`).value(ciael.workingDay.name);
          sheet.cell(`T${currentIdx}`).value(ciael.timeWorked);
          sheet.cell(`U${currentIdx}`).value(ciael.employee.dateOfAdmission);
          sheet.cell(`V${currentIdx}`).value(ciael.usualWork ? 'SI' : 'NO');
          sheet.cell(`W${currentIdx}`).value(ciael.typeOfLink.name);
          sheet.cell(`X${currentIdx}`).value(ciael.isDeath ? 'SI' : 'NO');
          sheet.cell(`Y${currentIdx}`).value(ciael.machine.name);
          sheet.cell(`Z${currentIdx}`).value(ciael.isInside ? 'SI' : 'NO');
          sheet.cell(`AA${currentIdx}`).value(ciael.monthsOfSeniority);
          sheet.cell(`AB${currentIdx}`).value(ciael.associatedTask.name);
          sheet.cell(`AC${currentIdx}`).value(ciael.zone.name);
          sheet.cell(`AD${currentIdx}`).value(ciael.areaLeader.name);
          sheet.cell(`AE${currentIdx}`).value(ciael.riskFactor.name);
          sheet.cell(`AF${currentIdx}`).value(ciael.natureOfEvent.name);
          sheet.cell(`AG${currentIdx}`).value(ciael.manager?.name || '');
        }

        return workbook.toFileAsync(this.filePathNewFile);
      })
      .then(async () => {
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

  @Get()
  findAll() {
    return this.ciaelsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ciaelsService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateCiaelDto: UpdateCiaelDto) {
    return this.ciaelsService.update(+id, updateCiaelDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.ciaelsService.remove(+id);
  }
}
