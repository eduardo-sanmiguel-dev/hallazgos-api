import { InjectRepository } from '@nestjs/typeorm';
import { REQUEST } from '@nestjs/core';
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { FindOptionsWhere, ILike, In, Repository } from 'typeorm';
import type { Request } from 'express';

import { CreateTopicDto, QueryTopicDto, UpdateTopicDto } from './dto';
import { User } from 'users/entities/user.entity';
import { Topic } from './entities/topic.entity';

@Injectable()
export class TopicsService {
  private readonly relations: string[] = [
    'manufacturingPlants',
    'createdBy',
    'updatedBy',
  ];

  constructor(
    @Inject(REQUEST) private readonly request: Request,
    @InjectRepository(Topic)
    private readonly topicRepository: Repository<Topic>,
  ) {}

  getManufacturingPlantsIdsValid(manufacturingPlantsIds: number[]) {
    const user = this.request['user'] as User;
    return user.manufacturingPlants.filter((mp) =>
      manufacturingPlantsIds.includes(mp.id),
    );
  }

  async create(createTopicDto: CreateTopicDto) {
    const createdBy = this.request['user'] as User;

    const { name, duration, typeOfEvaluation, manufacturingPlantsIds } =
      createTopicDto;

    const manufacturingPlants = this.getManufacturingPlantsIdsValid(
      manufacturingPlantsIds,
    );

    try {
      const topicNew = this.topicRepository.create({
        name,
        duration,
        typeOfEvaluation,
        createdBy,
        manufacturingPlants,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const topic = await this.topicRepository.save(topicNew);

      return this.findOne(topic.id);
    } catch (error) {
      if (error.code === '23505') {
        throw new ConflictException('Topic with this name already exists');
      }
      throw new Error(error);
    }
  }

  findAll(queryTopicDto: QueryTopicDto) {
    const { manufacturingPlantId, name } = queryTopicDto;

    const where: FindOptionsWhere<Topic> = { isActive: true };

    if (name) {
      where.name = ILike(`%${name}%`);
    }

    if (manufacturingPlantId) {
      where.manufacturingPlants = {
        id: In([manufacturingPlantId]),
      };
    }

    return this.topicRepository.find({
      where,
      relations: this.relations,
      select: {
        manufacturingPlants: {
          id: true,
          name: true,
        },
      },
      order: { name: 'ASC' },
    });
  }

  async findOne(id: number) {
    const topic = await this.topicRepository.findOne({
      where: { id, isActive: true },
      relations: this.relations,
    });

    if (!topic) {
      throw new NotFoundException(`Topic with id ${id} not found`);
    }

    return topic;
  }

  async update(id: number, updateTopicDto: UpdateTopicDto) {
    const updatedBy = this.request['user'] as User;

    const topic = await this.findOne(id);

    const { manufacturingPlantsIds, ...data } = updateTopicDto;

    const manufacturingPlants = this.getManufacturingPlantsIdsValid(
      manufacturingPlantsIds,
    );

    Object.assign(topic, {
      ...data,
      manufacturingPlants,
      updatedBy,
      updatedAt: new Date(),
    });

    try {
      await this.topicRepository.save(topic);
      return this.findOne(id);
    } catch (error) {
      if (error.code === '23505') {
        throw new ConflictException(
          `Topic with name '${updateTopicDto.name}' already exists`,
        );
      }

      throw new Error(error);
    }
  }

  async remove(id: number) {
    const topic = await this.findOne(id);
    topic.isActive = false;
    return this.topicRepository.save(topic);
  }
}
