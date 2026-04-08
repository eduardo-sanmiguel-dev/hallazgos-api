import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { REQUEST } from '@nestjs/core';

import { Brackets, Repository } from 'typeorm';

import {
  CreateEmergencyTeamDto,
  QueryEmergencyTeamDto,
  UpdateEmergencyTeamDto,
} from './dto';
import { EmergencyTeam } from './entities/emergency-team.entity';
import { User } from 'users/entities/user.entity';

@Injectable()
export class EmergencyTeamsService {
  private readonly relations = ['createdBy', 'updatedBy', 'manufacturingPlant'];

  constructor(
    @InjectRepository(EmergencyTeam)
    private readonly emergencyTeamRepository: Repository<EmergencyTeam>,
    @Inject(REQUEST) private readonly request: Request,
  ) {}

  async create(createEmergencyTeamDto: CreateEmergencyTeamDto) {
    const { id: createdBy } = this.request['user'] as User;

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

  findAll(queryEmergencyTeamDto: QueryEmergencyTeamDto) {
    const { search, manufacturingPlantId } = queryEmergencyTeamDto;

    const queryBuilder = this.emergencyTeamRepository
      .createQueryBuilder('emergencyTeam')
      .leftJoinAndSelect('emergencyTeam.createdBy', 'createdBy')
      .leftJoinAndSelect('emergencyTeam.updatedBy', 'updatedBy')
      .leftJoinAndSelect(
        'emergencyTeam.manufacturingPlant',
        'manufacturingPlant',
      )
      .where('emergencyTeam.isActive = :isActive', { isActive: true })
      .orderBy('emergencyTeam.id', 'DESC');

    if (search) {
      queryBuilder.andWhere(
        new Brackets((qb) => {
          qb.where('emergencyTeam.location ILIKE :search', {
            search: `%${search}%`,
          }).orWhere(
            'CAST(emergencyTeam.extinguisherNumber AS TEXT) ILIKE :search',
            {
              search: `%${search}%`,
            },
          );
        }),
      );
    }

    if (manufacturingPlantId) {
      queryBuilder.andWhere('manufacturingPlant.id = :manufacturingPlantId', {
        manufacturingPlantId,
      });
    }

    return queryBuilder.getMany();
  }

  async findOne(id: number) {
    const emergencyTeam = await this.emergencyTeamRepository.findOne({
      where: { id, isActive: true },
      relations: this.relations,
    });

    if (!emergencyTeam) {
      throw new NotFoundException(`Emergency team with id ${id} not found`);
    }
    return emergencyTeam;
  }

  async update(id: number, updateEmergencyTeamDto: UpdateEmergencyTeamDto) {
    const { id: updatedBy } = this.request['user'] as User;
    const { manufacturingPlantId, ...restUpdateEmergencyTeamDto } =
      updateEmergencyTeamDto;

    const emergencyTeam = await this.findOne(id);

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
    const { id: updatedBy } = this.request['user'] as User;
    const emergencyTeam = await this.findOne(id);
    emergencyTeam.isActive = false;
    emergencyTeam.updatedBy = { id: updatedBy } as User;
    emergencyTeam.updatedAt = new Date();
    return this.emergencyTeamRepository.save(emergencyTeam);
  }
}
