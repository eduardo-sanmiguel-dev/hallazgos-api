import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RequestContextService } from '../shared/services/request-context.service.js';

import { Brackets, Repository, In } from 'typeorm';

import { EmergencyTeam } from './entities/emergency-team.entity.js';
import { User } from '../users/entities/user.entity.js';
import {
  CreateEmergencyTeamDto,
  QueryEmergencyTeamDto,
  UpdateEmergencyTeamDto,
} from './dto/index.js';

@Injectable()
export class EmergencyTeamsService {
  private readonly relations = ['createdBy', 'updatedBy', 'manufacturingPlant'];

  constructor(
    @InjectRepository(EmergencyTeam)
    private readonly emergencyTeamRepository: Repository<EmergencyTeam>,
    private readonly requestContext: RequestContextService,
  ) {}

  create(createEmergencyTeamDto: CreateEmergencyTeamDto) {
    const createdBy = this.requestContext.userId;

    this.requestContext.assertManufacturingPlant(
      createEmergencyTeamDto.manufacturingPlantId,
    );
    const emergencyTeam = this.emergencyTeamRepository.create({
      ...createEmergencyTeamDto,
      manufacturingPlant: {
        id: createEmergencyTeamDto.manufacturingPlantId,
      },
      createdBy: { id: createdBy } as User,
      createdAt: new Date(),
    });

    return this.emergencyTeamRepository.save(emergencyTeam);
  }

  async findAll(queryEmergencyTeamDto: QueryEmergencyTeamDto) {
    const { search, manufacturingPlantId, typeOfExtinguisher, page, limit } =
      queryEmergencyTeamDto;

    const queryBuilder = this.emergencyTeamRepository
      .createQueryBuilder('emergencyTeam')
      .leftJoinAndSelect('emergencyTeam.createdBy', 'createdBy')
      .leftJoinAndSelect('emergencyTeam.updatedBy', 'updatedBy')
      .leftJoinAndSelect(
        'emergencyTeam.manufacturingPlant',
        'manufacturingPlant',
      )
      .where('emergencyTeam.isActive = :isActive', { isActive: true })
      .andWhere('manufacturingPlant.id IN (:...allowedPlantIds)', {
        allowedPlantIds: this.requestContext.manufacturingPlantIds.length
          ? this.requestContext.manufacturingPlantIds
          : [-1],
      })
      .orderBy('emergencyTeam.id', 'DESC');

    if (search) {
      queryBuilder.andWhere(
        new Brackets((qb) => {
          qb.where('emergencyTeam.location ILIKE :search', {
            search: `%${search}%`,
          }).orWhere('emergencyTeam.extinguisherNumber ILIKE :search', {
            search: `%${search}%`,
          });
        }),
      );
    }

    if (manufacturingPlantId) {
      queryBuilder.andWhere('manufacturingPlant.id = :manufacturingPlantId', {
        manufacturingPlantId,
      });
    }

    if (typeOfExtinguisher) {
      queryBuilder.andWhere(
        'emergencyTeam.typeOfExtinguisher = :typeOfExtinguisher',
        { typeOfExtinguisher },
      );
    }

    if (!page || !limit) {
      return queryBuilder.getMany();
    }

    const limitNumber = Number(limit);

    if (limitNumber > 0) {
      queryBuilder.skip((Number(page) - 1) * limitNumber).take(limitNumber);
    }

    const [data, count] = await queryBuilder.getManyAndCount();

    return { data, count };
  }

  async findOne(id: number) {
    const emergencyTeam = await this.emergencyTeamRepository.findOne({
      where: {
        id,
        isActive: true,
        manufacturingPlant: {
          id: In(this.requestContext.manufacturingPlantIds),
        },
      },
      relations: this.relations,
    });

    if (!emergencyTeam) {
      throw new NotFoundException(`Emergency team with id ${id} not found`);
    }
    return emergencyTeam;
  }

  async update(id: number, updateEmergencyTeamDto: UpdateEmergencyTeamDto) {
    const updatedBy = this.requestContext.userId;
    const { manufacturingPlantId, ...restUpdateEmergencyTeamDto } =
      updateEmergencyTeamDto;

    const emergencyTeam = await this.findOne(id);
    if (manufacturingPlantId)
      this.requestContext.assertManufacturingPlant(manufacturingPlantId);

    const updatedEmergencyTeam = this.emergencyTeamRepository.merge(
      emergencyTeam,
      restUpdateEmergencyTeamDto,
      manufacturingPlantId
        ? {
            manufacturingPlant: {
              id: manufacturingPlantId,
            },
          }
        : {},
      { updatedBy: { id: updatedBy } as User },
      { updatedAt: new Date() },
    );

    return this.emergencyTeamRepository.save(updatedEmergencyTeam);
  }

  async remove(id: number) {
    const updatedBy = this.requestContext.userId;
    const emergencyTeam = await this.findOne(id);
    emergencyTeam.isActive = false;
    emergencyTeam.updatedBy = { id: updatedBy } as User;
    emergencyTeam.updatedAt = new Date();
    return this.emergencyTeamRepository.save(emergencyTeam);
  }
}
