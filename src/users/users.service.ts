import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { REQUEST } from '@nestjs/core';

import { ILike, In, Not, Repository } from 'typeorm';
import { Request } from 'express';
import * as argon2 from 'argon2';

import { CreateUserDto, QueryUserDto, UpdateUserDto } from './dto';
import { User } from './entities/user.entity';
import { ROLE_SUPERVISOR } from '@shared/constants';
import { ManufacturingPlantsService } from 'manufacturing-plants/manufacturing-plants.service';
import { ZonesService } from 'zones/zones.service';
import { ProcessesService } from 'processes/processes.service';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @Inject(REQUEST) private readonly request: Request,
    private readonly manufacturingPlantsService: ManufacturingPlantsService,
    private readonly zonesService: ZonesService,
    private readonly processesService: ProcessesService,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    const {
      name,
      email,
      password,
      rule,
      manufacturingPlantNames,
      zoneNames,
      processNames,
    } = createUserDto;

    const manufacturingPlants =
      await this.manufacturingPlantsService.findAllByNames(
        manufacturingPlantNames,
      );

    const zones =
      await this.zonesService.findAllByManufacturingPlantNames(zoneNames);

    const processes =
      await this.processesService.findAllByManufacturingPlantNames(
        processNames,
      );

    const user = await this.userRepository.save(
      this.userRepository.create({
        name,
        email,
        ...(password && { password }),
        role: rule,
        manufacturingPlants,
        zones,
        processes,
      }),
    );

    return this.findOne(user.id);
  }

  findAll(queryUserDto: QueryUserDto): Promise<User[]> {
    const { name, manufacturingPlantId, rule, zoneId, orderBy } = queryUserDto;

    let order;

    if (orderBy) {
      const [key, direction] = orderBy.split('|');
      order = { [key]: direction.toUpperCase() };
    }

    return this.userRepository.find({
      where: {
        isActive: true,
        ...(name && { name: ILike(`%${name}%`) }),
        ...(manufacturingPlantId && {
          manufacturingPlants: { id: In([manufacturingPlantId]) },
        }),
        ...(rule && { role: rule }),
        ...(zoneId && { zones: { id: In([zoneId]) }, role: ROLE_SUPERVISOR }),
      },
      relations: [
        'manufacturingPlants',
        'zones',
        'zones.manufacturingPlant',
        'processes',
        'processes.manufacturingPlant',
      ],
      order: {
        ...(order
          ? {
              [Object.keys(order)[0]]: Object.values(order)[0],
            }
          : { id: 'DESC' }),
        manufacturingPlants: {
          name: 'ASC',
        },
        zones: {
          name: 'ASC',
        },
      },
    });
  }

  findAllByPlant(plantId: number): Promise<User[]> {
    if (plantId === 3) {
      return this.userRepository.find({
        where: {
          isActive: true,
          manufacturingPlants: {
            id: plantId,
          },
          email: In([
            'strujillo@hadamexico.com',
            'Dspaggiari@hadamexico.com',
            'Aholguin@hada.com.co',
            'Cvelasquez@hada.com.co',
            'sst@hadamexico.com',
            'Btorres@hadainternational.com',
          ]),
        },
      });
    }

    return this.userRepository.find({
      where: {
        isActive: true,
        manufacturingPlants: {
          id: plantId,
        },
        email: Not(
          In([
            'eduardo-266@hotmail.com',
            'eduardo-supervisor@hotmail.com',
            'eduardo-general@hotmail.com',
          ]),
        ),
      },
    });
  }

  async findOne(id: number): Promise<User> {
    const user = await this.userRepository.findOne({
      where: {
        id,
        isActive: true,
        manufacturingPlants: { isActive: true },
      },
      relations: [
        'manufacturingPlants',
        'zones',
        'zones.manufacturingPlant',
        'processes',
        'processes.manufacturingPlant',
      ],
    });

    if (!user)
      throw new NotFoundException(`Usuario con id ${id} no encontrado`);

    return user;
  }

  async findSupervisor({
    manufacturingPlantId,
    zoneId,
    supervisorId,
  }: {
    manufacturingPlantId: number;
    zoneId: number;
    supervisorId: number;
  }): Promise<User[]> {
    const whereDefault = {
      isActive: true,
      role: ROLE_SUPERVISOR,
      manufacturingPlants: {
        id: manufacturingPlantId,
      },
      zones: {
        id: zoneId,
      },
      email: Not(
        In([
          'eduardo-266@hotmail.com',
          'eduardo-supervisor@hotmail.com',
          'eduardo-general@hotmail.com',
        ]),
      ),
    };

    if (supervisorId) {
      return this.userRepository.find({
        where: {
          ...whereDefault,
          id: supervisorId,
        },
      });
    }

    return this.userRepository.find({
      where: whereDefault,
    });
  }

  async findProcesses({
    manufacturingPlantId,
    processId,
    supervisorId,
  }: {
    manufacturingPlantId: number;
    processId: number;
    supervisorId: number;
  }): Promise<User[]> {
    const whereDefault = {
      isActive: true,
      role: ROLE_SUPERVISOR,
      manufacturingPlants: {
        id: manufacturingPlantId,
      },
      processes: {
        id: processId,
      },
      email: Not(
        In([
          'eduardo-266@hotmail.com',
          'eduardo-supervisor@hotmail.com',
          'eduardo-general@hotmail.com',
        ]),
      ),
    };

    if (supervisorId) {
      return this.userRepository.find({
        where: {
          ...whereDefault,
          id: supervisorId,
        },
      });
    }

    return this.userRepository.find({
      where: whereDefault,
    });
  }

  async getSupervisors(): Promise<User[]> {
    const { manufacturingPlants } = this.request['user'] as User;

    const manufacturingPlantsIds = manufacturingPlants.map(
      (manufacturingPlant) => manufacturingPlant.id,
    );

    return this.userRepository.find({
      where: {
        isActive: true,
        role: ROLE_SUPERVISOR,
        manufacturingPlants: {
          id: In(manufacturingPlantsIds),
        },
        email: Not(In(['eduardo-supervisor@hotmail.com'])),
      },
      relations: ['manufacturingPlants', 'zones', 'processes'],
      order: {
        name: 'ASC',
      },
    });
  }

  async getInformationCurrentUser(): Promise<User> {
    const { id: userId } = this.request['user'] as User;

    const user = await this.userRepository.findOne({
      where: {
        id: userId,
        isActive: true,
        manufacturingPlants: {
          isActive: true,
        },
      },
      relations: ['manufacturingPlants', 'zones', 'processes'],
    });

    if (!user)
      throw new NotFoundException(`Usuario con id ${userId} no encontrado`);

    return user;
  }

  async update(id: number, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);

    const {
      name,
      email,
      password,
      rule,
      manufacturingPlantNames,
      zoneNames,
      processNames,
    } = updateUserDto;

    const manufacturingPlants =
      await this.manufacturingPlantsService.findAllByNames(
        manufacturingPlantNames,
      );

    let zones = [];
    let processes = [];

    if (rule === ROLE_SUPERVISOR) {
      zones =
        await this.zonesService.findAllByManufacturingPlantNames(zoneNames);

      processes =
        await this.processesService.findAllByManufacturingPlantNames(
          processNames,
        );
    }

    user.name = name;
    user.email = email;
    if (password) {
      user.password = await argon2.hash(password);
    }
    user.role = rule;
    user.zones = zones;
    user.processes = processes;
    user.manufacturingPlants = manufacturingPlants;

    return this.userRepository.save({ ...user });
  }

  async remove(id: number): Promise<User> {
    await this.findOne(id);

    return await this.userRepository.save({
      id,
      isActive: false,
    });
  }
}
