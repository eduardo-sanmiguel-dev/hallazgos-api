import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RequestContextService } from 'shared/services/request-context.service';

import { FindOptionsWhere, ILike, Repository } from 'typeorm';

import { RulesOfLife } from 'rules-of-life/entities';
import { CreateIcsDto, FiltersIcsDto, UpdateIcsDto } from './dto';
import { Ics } from './entities/ics.entity';

@Injectable()
export class IcsService {
  private readonly relations: string[] = [
    'createdBy',
    'manufacturingPlant',
    'ruleOfLife',
    'standardOfBehavior',
    'areaOfBehavior',
    'employees',
  ];

  constructor(
    private readonly requestContext: RequestContextService,
    @InjectRepository(Ics)
    private readonly icsRepository: Repository<Ics>,
    @InjectRepository(RulesOfLife)
    private readonly rulesOfLifeRepository: Repository<RulesOfLife>,
  ) {}

  create(createIcsDto: CreateIcsDto, file: Express.Multer.File) {
    const createdBy = this.requestContext.userId;

    const {
      description,
      manufacturingPlantId,
      totalPeople,
      ruleOfLifeId,
      standardOfBehaviorId,
      areaOfBehaviorId,
      employeesIds,
    } = createIcsDto;

    let imgEvidence = '';

    if (file) {
      imgEvidence = file.filename;
    }

    const totalIncorrectPeople = employeesIds.length;

    // Antes se guardaban personas correctas y porcentaje negativos.
    if (totalIncorrectPeople > totalPeople) {
      throw new BadRequestException(
        'Las personas con comportamiento incorrecto no pueden ser más que el total de personas',
      );
    }

    const totalCorrectPeople = totalPeople - totalIncorrectPeople;

    return this.icsRepository.save({
      description,
      totalPeople,
      totalCorrectPeople,
      totalIncorrectPeople: totalIncorrectPeople,
      icsPercentage: Number(
        ((totalCorrectPeople / totalPeople) * 100).toFixed(2),
      ),
      ruleOfLife: {
        id: ruleOfLifeId,
      },
      ...(standardOfBehaviorId && {
        standardOfBehavior: { id: standardOfBehaviorId },
      }),
      ...(areaOfBehaviorId && {
        areaOfBehavior: { id: areaOfBehaviorId },
      }),
      createdBy: {
        id: createdBy,
      },
      manufacturingPlant: {
        id: manufacturingPlantId,
      },
      imgEvidence,
      employees: employeesIds.map((id) => ({ id })),
    });
  }

  catalogs() {
    return this.rulesOfLifeRepository.find({
      relations: ['standards', 'standards.areas'],
      order: { order: 'ASC' },
    });
  }

  async findAll(filtersIcsDto: FiltersIcsDto) {
    const { manufacturingPlantId, areaOfBehaviorId, page, limit } =
      filtersIcsDto;
    const search = (filtersIcsDto.name ?? '').trim();

    const base: FindOptionsWhere<Ics> = {
      isActive: true,
      ...(manufacturingPlantId && {
        manufacturingPlant: { id: Number(manufacturingPlantId) },
      }),
      ...(areaOfBehaviorId && {
        areaOfBehavior: { id: Number(areaOfBehaviorId) },
      }),
    };

    // `name` busca por regla de vida o estándar de comportamiento (coincidencia parcial).
    const where: FindOptionsWhere<Ics>[] = search
      ? [
          { ...base, ruleOfLife: { name: ILike(`%${search}%`) } },
          { ...base, standardOfBehavior: { name: ILike(`%${search}%`) } },
        ]
      : [base];

    if (page === undefined || limit === undefined) {
      return this.icsRepository.find({
        where,
        relations: this.relations,
        order: { createdAt: 'DESC', id: 'DESC' },
      });
    }

    const limitNumber = Number(limit);
    const isUnlimited = limitNumber === -1;

    const [data, count] = await this.icsRepository.findAndCount({
      where,
      relations: this.relations,
      order: { createdAt: 'DESC', id: 'DESC' },
      ...(!isUnlimited && {
        take: limitNumber,
        skip: (Number(page) - 1) * limitNumber,
      }),
    });

    return { data, count };
  }

  async findOne(id: number) {
    const ics = await this.icsRepository.findOne({
      where: { id, isActive: true },
      relations: this.relations,
    });

    if (!ics) {
      throw new NotFoundException(`Ics with id ${id} not found`);
    }

    return ics;
  }

  update(id: number, updateIcDto: UpdateIcsDto) {
    return { id, updateIcDto };
  }

  async remove(id: number) {
    const ics = await this.findOne(id);
    await this.icsRepository.update(id, {
      isActive: false,
      updatedAt: new Date(),
    });

    return ics;
  }
}
