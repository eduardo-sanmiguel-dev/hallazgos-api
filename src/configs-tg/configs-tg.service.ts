import { InjectRepository } from '@nestjs/typeorm';
import { REQUEST } from '@nestjs/core';
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { FindOptionsSelect, FindOptionsWhere, Repository } from 'typeorm';
import { Request } from 'express';

import { ConfigsTg } from './entities/configs-tg.entity';
import { User } from 'users/entities/user.entity';
import { ConfigsTopicTg } from './entities';
import {
  CreateConfigsTgDto,
  QueryConfigsTgDto,
  UpdateConfigsTgDto,
} from './dto';

@Injectable()
export class ConfigsTgService {
  private readonly relations: string[] = [
    'topics',
    'topics.topic',
    'topics.responsibles',
    'position',
    'manufacturingPlant',
    'areaManager',
    'humanResourceManager',
    'createdBy',
    'updatedBy',
  ];

  private readonly select: FindOptionsSelect<ConfigsTg> = {
    position: { id: true, name: true },
    manufacturingPlant: { id: true, name: true },
    topics: {
      id: true,
      order: true,
      topic: {
        id: true,
        name: true,
        typeOfEvaluation: true,
        duration: true,
      },
      responsibles: { id: true, name: true },
    },
    areaManager: { id: true, name: true },
    humanResourceManager: { id: true, name: true },
  };

  private readonly where: FindOptionsWhere<ConfigsTg> = { isActive: true };

  private optionsDefault = {
    where: this.where,
    relations: this.relations,
    select: this.select,
  };

  constructor(
    @Inject(REQUEST) private readonly request: Request,
    @InjectRepository(ConfigsTg)
    private readonly configsTgRepository: Repository<ConfigsTg>,
    @InjectRepository(ConfigsTopicTg)
    private readonly configsTopicTgRepository: Repository<ConfigsTopicTg>,
  ) {}

  async create(createConfigsTgDto: CreateConfigsTgDto) {
    const createdBy = this.request['user'] as User;

    const {
      positionId,
      areaManagerId,
      humanResourceManagerId,
      topics,
      manufacturingPlantId,
    } = createConfigsTgDto;

    try {
      const configNew = this.configsTgRepository.create({
        position: { id: positionId },
        areaManager: { id: areaManagerId },
        humanResourceManager: { id: humanResourceManagerId },
        manufacturingPlant: { id: manufacturingPlantId },
        createdBy,
        createdAt: new Date(),
        updatedAt: new Date(),
        topics: topics.map((topicDto, idx) => {
          return {
            order: idx + 1,
            topic: { id: topicDto.id },
            responsibles: topicDto.responsibleIds.map((responsibleId) => ({
              id: responsibleId,
            })),
          } as ConfigsTopicTg;
        }),
      });

      const config = await this.configsTgRepository.save(configNew);

      return this.findOne(config.id);
    } catch (error) {
      if (error.code === '23505') {
        throw new ConflictException(
          `The configuration already exists, the combination of position and manufacturing plant must be unique`,
        );
      }
      throw new Error(error);
    }
  }

  findAll(queryConfigsTgDto: QueryConfigsTgDto) {
    const { positionId, manufacturingPlantId } = queryConfigsTgDto;

    const where: FindOptionsWhere<ConfigsTg> = { ...this.where };

    if (positionId) {
      where.position = { id: positionId };
    }

    if (manufacturingPlantId) {
      where.manufacturingPlant = { id: manufacturingPlantId };
    }

    return this.configsTgRepository.find({
      ...this.optionsDefault,
      where,
    });
  }

  async findOne(id: number) {
    const where: FindOptionsWhere<ConfigsTg> = { id, ...this.where };

    const config = await this.configsTgRepository.findOne({
      ...this.optionsDefault,
      where,
      order: {
        topics: { order: 'ASC' },
      },
    });

    if (!config) {
      throw new NotFoundException(`Config with id ${id} not found`);
    }

    return config;
  }

  async findByPositionAndManufacturingPlant(
    positionId: number,
    manufacturingPlantId: number,
  ) {
    const where: FindOptionsWhere<ConfigsTg> = {
      position: { id: positionId },
      manufacturingPlant: { id: manufacturingPlantId },
      ...this.where,
    };

    const config = await this.configsTgRepository.findOne({
      ...this.optionsDefault,
      where,
    });

    if (!config) {
      throw new NotFoundException(
        `Configuration for position id ${positionId} and manufacturing plant id ${manufacturingPlantId} not found`,
      );
    }

    return config;
  }

  async update(id: number, updateConfigsTgDto: UpdateConfigsTgDto) {
    const updatedBy = this.request['user'] as User;

    const config = await this.findOne(id);

    const {
      positionId,
      areaManagerId,
      humanResourceManagerId,
      manufacturingPlantId,
      topics,
    } = updateConfigsTgDto;

    Object.assign(config, {
      ...(positionId && { position: { id: positionId } }),
      ...(areaManagerId && { areaManager: { id: areaManagerId } }),
      ...(humanResourceManagerId && {
        humanResourceManager: { id: humanResourceManagerId },
      }),
      ...(manufacturingPlantId && {
        manufacturingPlant: { id: manufacturingPlantId },
      }),
      topics: [],
      updatedBy,
      updatedAt: new Date(),
    });

    try {
      await this.configsTgRepository.save(config);

      await this.configsTopicTgRepository.delete({
        configTg: { id: config.id },
      });

      config.topics = topics.map((topicDto, idx) => {
        return {
          order: idx + 1,
          topic: { id: topicDto.id },
          responsibles: topicDto.responsibleIds.map((responsibleId) => ({
            id: responsibleId,
          })),
        } as ConfigsTopicTg;
      });

      await this.configsTgRepository.save(config);

      return this.findOne(config.id);
    } catch (error) {
      throw new Error(error);
    }
  }

  async remove(id: number) {
    const config = await this.findOne(id);
    config.isActive = false;
    return this.configsTgRepository.save(config);
  }
}
