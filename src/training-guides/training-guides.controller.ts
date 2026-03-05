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
import { writeFile } from 'fs/promises';
import { Response } from 'express';
import * as ExcelJS from 'exceljs';

import { TrainingGuidesService } from './training-guides.service';
import { TypesOfEvaluations } from 'topics/entities/topic.entity';
import {
  CreateTrainingGuideDto,
  SignatureDto,
  UpdateTrainingGuideDto,
} from './dto';

@Controller('training-guides')
export class TrainingGuidesController {
  private readonly filePath: string = join(
    process.cwd(),
    'src/files',
    'geOperarioGeneral.xlsx',
  );

  private readonly filePathNewFile = join(
    process.cwd(),
    'src/files',
    'archivo_actualizado_geOperarioGeneral.xlsx',
  );

  private readonly imageBannerPath = join(
    process.cwd(),
    'src/files',
    'bannerGuiaEntrenamiento.png',
  );

  constructor(private readonly trainingGuidesService: TrainingGuidesService) {}

  @Post()
  create(@Body() createTrainingGuideDto: CreateTrainingGuideDto) {
    return this.trainingGuidesService.create(createTrainingGuideDto);
  }

  @Post('signature/:id')
  createSignature(
    @Param('id') id: string,
    @Body()
    signatureDto: SignatureDto,
  ) {
    return this.trainingGuidesService.createSignature(+id, signatureDto);
  }

  @Get()
  findAll() {
    return this.trainingGuidesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.trainingGuidesService.findOne(+id);
  }

  @Get('download/file/:id')
  async downloadFile(@Param('id') id: string, @Res() res: Response) {
    const trainingGuideRow = await this.trainingGuidesService.findOne(+id);

    const { configTg, trainingGuide } =
      await this.trainingGuidesService.findOneByPositionIdAndEmployeeId({
        positionId: trainingGuideRow.position.id,
        employeeId: trainingGuideRow.employee.id,
        manufacturingPlantId: trainingGuideRow.manufacturingPlant.id,
      });

    XlsxPopulate.fromFileAsync(this.filePath)
      .then(async (workbook) => {
        const sheet = workbook.sheet('Guia entrenamiento Ver. 04 (2)');

        const currentIdxInitial = 4;

        sheet
          .cell(`A${currentIdxInitial}`)
          .value(
            `${trainingGuide.employee.code} - ${trainingGuide.employee.name}`,
          );
        sheet
          .cell(`C${currentIdxInitial}`)
          .value(trainingGuide.startDate.toISOString().split('T')[0]);
        sheet.cell(`E${currentIdxInitial}`).value(trainingGuide.position.name);
        sheet.cell(`G${currentIdxInitial}`).value(trainingGuide.area.name);

        let evaluationSum = 0;

        for (const [idx, evaluation] of configTg.topics.entries()) {
          const currentEvaluation = trainingGuide.evaluations.find(
            (ev) => Number(ev.topic.id) === Number(evaluation.topic.id),
          );

          const currentIdx = 6 + idx;
          sheet.cell(`A${currentIdx}`).value(evaluation.topic.name);
          sheet
            .cell(`C${currentIdx}`)
            .value(
              currentEvaluation?.evaluationDate?.toISOString().split('T')[0] ||
                '',
            );
          sheet.cell(`D${currentIdx}`).value(evaluation.topic.duration);

          const responsibles =
            configTg.topics.find(
              (t) => Number(t.topic.id) === Number(evaluation.topic.id),
            )?.responsibles || [];

          sheet
            .cell(`E${currentIdx}`)
            .value(
              responsibles.map((responsible) => responsible.name).join(' / '),
            );
          sheet
            .cell(`F${currentIdx}`)
            .value(
              currentEvaluation.topic.typeOfEvaluation ===
                TypesOfEvaluations.BOOLEAN
                ? currentEvaluation.evaluationValue === 'true'
                  ? 'Aprobado'
                  : 'Reprobado'
                : currentEvaluation.evaluationValue,
            );
          sheet
            .cell(`H${currentIdx}`)
            .value(currentEvaluation?.observations || '');

          evaluationSum +=
            currentEvaluation.topic.typeOfEvaluation !==
            TypesOfEvaluations.BOOLEAN
              ? Number(currentEvaluation.evaluationValue)
              : currentEvaluation.evaluationValue === 'true'
                ? 5
                : 0;
        }

        const average = Number(
          (evaluationSum / trainingGuide.evaluations.length || 0).toFixed(2),
        );

        sheet.cell(`F25`).value(average);

        return workbook.toFileAsync(this.filePathNewFile);
      })
      .then(async () => {
        const workbook = new ExcelJS.Workbook();

        const dimensions = { width: 120, height: 50 };

        await workbook.xlsx.readFile(this.filePathNewFile).then(async () => {
          const worksheet = workbook.worksheets[0];

          worksheet.pageSetup.printArea = 'A1:I32';

          //worksheet.getColumn('A').width = 20;

          if (trainingGuide.signatureEmployee) {
            const base64 = Buffer.from(
              trainingGuide.signatureEmployee.split(',')[1],
              'base64',
            );

            const imagePath = join(
              process.cwd(),
              'src/files',
              `signatureEmployee-temp-image.png`,
            );

            await writeFile(imagePath, base64);

            const imageId = workbook.addImage({
              filename: imagePath,
              extension: 'png',
            });

            for (const [idx, _] of trainingGuide.evaluations.entries()) {
              const currentIdx = 5 + idx;
              //worksheet.getRow(currentIdx).height = 30;
              worksheet.addImage(imageId, {
                tl: { col: 6, row: currentIdx },
                ext: { width: 100, height: 30 },
              });
            }

            worksheet.addImage(imageId, {
              tl: { col: 1, row: 27 },
              ext: dimensions,
            });
          }

          if (trainingGuide.signatureAreaManager) {
            const base64 = Buffer.from(
              trainingGuide.signatureAreaManager.split(',')[1],
              'base64',
            );

            const imagePath = join(
              process.cwd(),
              'src/files',
              `signatureAreaManager-temp-image.png`,
            );

            await writeFile(imagePath, base64);

            const imageId = workbook.addImage({
              filename: imagePath,
              extension: 'png',
            });

            worksheet.addImage(imageId, {
              tl: { col: 4, row: 27 },
              ext: dimensions,
            });
          }

          if (trainingGuide.signatureHumanResourceManager) {
            const base64 = Buffer.from(
              trainingGuide.signatureHumanResourceManager.split(',')[1],
              'base64',
            );

            const imagePath = join(
              process.cwd(),
              'src/files',
              `signatureHumanResourceManager-temp-image.png`,
            );

            await writeFile(imagePath, base64);

            const imageId = workbook.addImage({
              filename: imagePath,
              extension: 'png',
            });

            worksheet.addImage(imageId, {
              tl: { col: 7, row: 27 },
              ext: dimensions,
            });
          }

          const imageIdBanner = workbook.addImage({
            filename: this.imageBannerPath,
            extension: 'png',
          });

          worksheet.addImage(imageIdBanner, {
            tl: { col: 0, row: 0 },
            ext: { width: 125, height: 74 },
          });

          await workbook.xlsx.writeFile(this.filePathNewFile);

          return 'ok';
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

  @Get(
    'position/:positionId/employee/:employeeId/manufacturingPlant/:manufacturingPlantId',
  )
  findOneByPositionIdAndEmployeeId(
    @Param('positionId') positionId: string,
    @Param('employeeId') employeeId: string,
    @Param('manufacturingPlantId') manufacturingPlantId: string,
  ) {
    return this.trainingGuidesService.findOneByPositionIdAndEmployeeId({
      positionId: +positionId,
      employeeId: +employeeId,
      manufacturingPlantId: +manufacturingPlantId,
    });
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateTrainingGuideDto: UpdateTrainingGuideDto,
  ) {
    return this.trainingGuidesService.update(+id, updateTrainingGuideDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.trainingGuidesService.remove(+id);
  }
}
