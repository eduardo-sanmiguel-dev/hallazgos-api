import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { REQUEST } from '@nestjs/core';

import * as QRCode from 'qrcode';
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
  private readonly relations = ['createdBy', 'updatedBy'];

  constructor(
    @InjectRepository(EmergencyTeam)
    private readonly emergencyTeamRepository: Repository<EmergencyTeam>,
    @Inject(REQUEST) private readonly request: Request,
  ) {}

  async create(createEmergencyTeamDto: CreateEmergencyTeamDto) {
    const { id: createdBy } = this.request['user'] as User;

    const emergencyTeam = this.emergencyTeamRepository.create({
      ...createEmergencyTeamDto,
      qrCode: '',
      createdBy: { id: createdBy } as User,
      createdAt: new Date(),
    });

    const savedEmergencyTeam =
      await this.emergencyTeamRepository.save(emergencyTeam);

    const qrCode = await QRCode.toDataURL(savedEmergencyTeam.id.toString());
    savedEmergencyTeam.qrCode = qrCode;

    return this.emergencyTeamRepository.save(savedEmergencyTeam);
  }

  findAll(queryEmergencyTeamDto: QueryEmergencyTeamDto) {
    const { search } = queryEmergencyTeamDto;

    const queryBuilder = this.emergencyTeamRepository
      .createQueryBuilder('emergencyTeam')
      .leftJoinAndSelect('emergencyTeam.createdBy', 'createdBy')
      .leftJoinAndSelect('emergencyTeam.updatedBy', 'updatedBy')
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

    const emergencyTeam = await this.findOne(id);

    const updatedEmergencyTeam = this.emergencyTeamRepository.merge(
      emergencyTeam,
      updateEmergencyTeamDto,
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
