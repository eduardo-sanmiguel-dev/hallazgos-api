import { InjectRepository } from '@nestjs/typeorm';
import { REQUEST } from '@nestjs/core';
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Repository } from 'typeorm';
import { Request } from 'express';

import { TrainingGuide, TrainingGuideEvaluation } from './entities';
import { ConfigsTgService } from 'configs-tg/configs-tg.service';
import { EmployeesService } from 'employees/employees.service';
import { User } from 'users/entities/user.entity';
import { ConfigsTg } from 'configs-tg/entities';
import {
  CreateTrainingGuideDto,
  SignatureDto,
  UpdateTrainingGuideDto,
} from './dto';
import { MailService } from 'mail/mail.service';
import { ENV_DEVELOPMENT } from '@shared/constants';

@Injectable()
export class TrainingGuidesService {
  private readonly relations: string[] = [
    'employee',
    'position',
    'area',
    'evaluations',
    'evaluations.topic',
    'areaManager',
    'humanResourceManager',
    'manufacturingPlant',
  ];

  constructor(
    @Inject(REQUEST) private readonly request: Request,
    @InjectRepository(TrainingGuide)
    private readonly trainingGuideRepository: Repository<TrainingGuide>,
    @InjectRepository(ConfigsTg)
    private readonly configsTgRepository: Repository<ConfigsTg>,
    private readonly configsTgService: ConfigsTgService,
    private readonly employeesService: EmployeesService,
    private readonly mailService: MailService,
  ) {}

  async create(createTrainingGuideDto: CreateTrainingGuideDto) {
    const createdBy = this.request['user'] as User;

    const {
      manufacturingPlantId,
      startDate,
      positionId,
      employeeId,
      evaluations = [],
      areaTgeId,
      humanResourceTgeId,
    } = createTrainingGuideDto;

    const configTg =
      await this.configsTgService.findByPositionAndManufacturingPlant(
        positionId,
        manufacturingPlantId,
      );

    let currentEvaluations = evaluations;

    const totalTopics = configTg.topics.length + 3;
    const completedTopics = currentEvaluations.filter(
      (ev) => ev.date !== null,
    ).length;
    const percentageOfCompliance = (completedTopics / totalTopics) * 100;

    const employee = await this.employeesService.findOne(employeeId);

    try {
      const trainingGuideNew = this.trainingGuideRepository.create({
        position: { id: positionId },
        employee: { id: employeeId },
        areaManager: { id: areaTgeId },
        manufacturingPlant: { id: manufacturingPlantId },
        humanResourceManager: { id: humanResourceTgeId },
        area: { id: employee.area.id },
        percentageOfCompliance,
        evaluations: currentEvaluations.map((evaluationDto) => {
          return {
            topic: { id: evaluationDto.topicId },
            evaluationDate: evaluationDto.date
              ? new Date(evaluationDto.date)
              : null,
            evaluationValue: evaluationDto.evaluation,
            observations: evaluationDto.observations,
            createdAt: new Date(),
            updatedAt: new Date(),
          } as TrainingGuideEvaluation;
        }),
        startDate: new Date(startDate),
        createdBy,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const trainingGuide =
        await this.trainingGuideRepository.save(trainingGuideNew);

      return this.findOne(trainingGuide.id);
    } catch (error) {
      if (error.code === '23505') {
        throw new ConflictException(
          `The configuration already exists, the combination of position and manufacturing plant must be unique`,
        );
      }
      throw new Error(error);
    }
  }

  findAll() {
    return this.trainingGuideRepository.find({
      where: { isActive: true },
      relations: this.relations,
    });
  }

  async findOne(id: number) {
    const trainingGuide = await this.trainingGuideRepository.findOne({
      where: { id, isActive: true },
      relations: this.relations,
    });

    if (!trainingGuide) {
      throw new NotFoundException(`TrainingGuide with id ${id} not found`);
    }

    return trainingGuide;
  }

  async update(id: number, updateTrainingGuideDto: UpdateTrainingGuideDto) {
    const updatedBy = this.request['user'] as User;

    const trainingGuide = await this.findOne(id);

    const { startDate, evaluations } = updateTrainingGuideDto;

    let totalTopics = trainingGuide.evaluations.length + 3;

    if (trainingGuide.signatureAreaManager) {
      totalTopics -= 1;
    }

    if (trainingGuide.signatureHumanResourceManager) {
      totalTopics -= 1;
    }

    if (trainingGuide.signatureEmployee) {
      totalTopics -= 1;
    }

    const percentageOfCompliance =
      (evaluations.filter((ev) => ev.date !== null).length / totalTopics) * 100;

    await this.trainingGuideRepository.update(id, {
      percentageOfCompliance,
      startDate,
      updatedBy,
      updatedAt: new Date(),
    });

    for (const evalDto of evaluations) {
      const evaluation = trainingGuide.evaluations.find(
        (ev) => ev.topic.id === evalDto.topicId,
      );
      if (evaluation) {
        await this.trainingGuideRepository
          .createQueryBuilder()
          .update(TrainingGuideEvaluation)
          .set({
            evaluationDate: evalDto.date,
            evaluationValue: evalDto.evaluation,
            observations: evalDto.observations,
          })
          .where('id = :id', { id: evaluation.id })
          .execute();
      }
    }

    return this.findOne(id);
  }

  async createSignature(id: number, signatureDto: SignatureDto) {
    const updatedBy = this.request['user'] as User;

    const { userId, type, signature } = signatureDto;

    userId;

    const trainingGuideRow = await this.findOne(id);

    const whereDefault = { id, isActive: true };

    switch (type) {
      case 'employee':
        await this.trainingGuideRepository.update(
          { id, isActive: true },
          {
            signatureEmployee: signature,
            signatureEmployeeDate: new Date(),
          },
        );

        //const { areaManager, humanResourceManager } = trainingGuideRow

        if (process.env.NODE_ENV === ENV_DEVELOPMENT) {
          await this.mailService.sendPendingTrainingGuide(
            trainingGuideRow,
            'eduardo-266@hotmail.com',
          );
        } else {
          await this.mailService.sendPendingTrainingGuide(
            trainingGuideRow,
            'ggarcia@hadamexico.com',
          );
          /* this.mailService.sendPendingTrainingGuide(
            trainingGuideRow,
            areaManager.email,
          );
          this.mailService.sendPendingTrainingGuide(
            trainingGuideRow,
            humanResourceManager.email,
          ); */
        }

        break;
      case 'areaManager':
        await this.trainingGuideRepository.update(whereDefault, {
          signatureAreaManager: signature,
          signatureAreaManagerDate: new Date(),
        });
        break;
      case 'humanResourceManager':
        await this.trainingGuideRepository.update(whereDefault, {
          signatureHumanResourceManager: signature,
          signatureHumanResourceManagerDate: new Date(),
        });
        break;
    }

    const trainingGuide = await this.findOne(id);

    const evaluations = trainingGuide.evaluations;

    let totalTopics = evaluations.length + 3;

    if (trainingGuide.signatureAreaManager) {
      totalTopics -= 1;
    }

    if (trainingGuide.signatureHumanResourceManager) {
      totalTopics -= 1;
    }

    if (trainingGuide.signatureEmployee) {
      totalTopics -= 1;
    }

    const percentageOfCompliance =
      (evaluations.filter((ev) => ev.evaluationDate !== null).length /
        totalTopics) *
      100;

    await this.trainingGuideRepository.update(id, {
      percentageOfCompliance,
      updatedBy,
      updatedAt: new Date(),
    });

    return { message: 'Signature saved successfully' };
  }

  async remove(id: number) {
    const updatedBy = this.request['user'] as User;

    const trainingGuide = await this.findOne(id);

    await this.trainingGuideRepository.update(id, {
      isActive: false,
      updatedBy,
      updatedAt: new Date(),
    });

    return { ...trainingGuide, isActive: false };
  }

  async findOneByPositionIdAndEmployeeId({
    positionId,
    employeeId,
    manufacturingPlantId,
  }: {
    positionId: number;
    employeeId: number;
    manufacturingPlantId: number;
  }) {
    const trainingGuides = await this.trainingGuideRepository.find({
      where: {
        employee: { id: employeeId },
        isActive: true,
      },
      relations: this.relations,
    });

    const position = await this.employeesService.findPositionById(positionId);

    const configTg = await this.configsTgRepository.findOne({
      where: {
        position: { id: positionId },
        manufacturingPlant: { id: manufacturingPlantId },
        isActive: true,
      },
      order: {
        topics: { order: 'ASC' },
      },
      relations: [
        'position',
        'manufacturingPlant',
        'areaManager',
        'humanResourceManager',
        'topics',
        'topics.topic',
        'topics.responsibles',
      ],
    });

    if (!configTg) {
      throw new NotFoundException(
        `No se encontró la guía de entrenamiento para el puesto: ${position.name}`,
      );
    }

    return {
      configTg,
      trainingGuide: trainingGuides.find((tg) => tg.position.id === positionId),
      previousTopics: trainingGuides
        .filter((tg) => tg.position.id !== positionId)
        .flatMap((tg) => tg.evaluations),
    };
  }
}
