import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { Area } from 'areas/entities/area.entity';
import { ManufacturingPlantsService } from 'manufacturing-plants/manufacturing-plants.service';
import { User } from 'users/entities/user.entity';
import { Zone } from './entities/zone.entity';
import { ZONES_SEED_DATA } from './zones-seed.data';

@Injectable()
export class ZonesSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ZonesSeedService.name);
  private readonly manufacturingPlantId = 3;
  private readonly createdById = 1;

  constructor(
    @InjectRepository(Zone)
    private readonly zoneRepository: Repository<Zone>,
    @InjectRepository(Area)
    private readonly areaRepository: Repository<Area>,
    private readonly manufacturingPlantsService: ManufacturingPlantsService,
  ) {}

  async onApplicationBootstrap() {
    await this.seed();
  }

  private normalize(value: string) {
    return value.trim();
  }

  private async findAreaByName(name: string, onlyActive = true) {
    const normalizedName = this.normalize(name);

    const query = this.areaRepository
      .createQueryBuilder('area')
      .where('area.manufacturingPlantId = :manufacturingPlantId', {
        manufacturingPlantId: this.manufacturingPlantId,
      })
      .andWhere('LOWER(TRIM(area.name)) = LOWER(:name)', {
        name: normalizedName,
      });

    if (onlyActive) {
      query.andWhere('area.isActive = true');
    }

    return query.getOne();
  }

  private async ensureArea(name: string) {
    const normalizedName = this.normalize(name);
    const existing = await this.findAreaByName(normalizedName, false);

    if (!existing) {
      const area = this.areaRepository.create({
        name: normalizedName,
        manufacturingPlant: { id: this.manufacturingPlantId },
        isActive: true,
        createdBy: { id: this.createdById } as User,
        createdAt: new Date(),
      });

      return this.areaRepository.save(area);
    }

    if (!existing.isActive) {
      existing.isActive = true;
      existing.updatedBy = { id: this.createdById } as User;
      existing.updatedAt = new Date();
      return this.areaRepository.save(existing);
    }

    return existing;
  }

  private async findZoneByNameAndArea(name: string, areaId: number) {
    const normalizedName = this.normalize(name);

    return this.zoneRepository
      .createQueryBuilder('zone')
      .leftJoin('zone.area', 'area')
      .where('zone.manufacturingPlantId = :manufacturingPlantId', {
        manufacturingPlantId: this.manufacturingPlantId,
      })
      .andWhere('LOWER(TRIM(zone.name)) = LOWER(:name)', {
        name: normalizedName,
      })
      .andWhere('area.id = :areaId', {
        areaId,
      })
      .getOne();
  }

  private async findZoneByName(name: string) {
    const normalizedName = this.normalize(name);

    return this.zoneRepository
      .createQueryBuilder('zone')
      .where('zone.manufacturingPlantId = :manufacturingPlantId', {
        manufacturingPlantId: this.manufacturingPlantId,
      })
      .andWhere('LOWER(TRIM(zone.name)) = LOWER(:name)', {
        name: normalizedName,
      })
      .getOne();
  }

  private async seed() {
    await this.manufacturingPlantsService.findOne(this.manufacturingPlantId);

    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let skippedDuplicateCount = 0;
    let skippedExistingActiveCount = 0;
    const seenKeys = new Set<string>();

    this.logger.log(`ZONES_SEED_DATA total: ${ZONES_SEED_DATA.length}`);

    for (const item of ZONES_SEED_DATA) {
      const areaName = this.normalize(item.area);
      const zoneName = this.normalize(item.zone);
      const seedKey = `${areaName.toLowerCase()}|${zoneName.toLowerCase()}`;

      if (seenKeys.has(seedKey)) {
        skippedCount += 1;
        skippedDuplicateCount += 1;
        this.logger.debug(
          `Omitido (duplicado seed): area="${areaName}", zona="${zoneName}"`,
        );
        continue;
      }

      seenKeys.add(seedKey);

      const area = await this.ensureArea(areaName);

      const existingZone = await this.findZoneByNameAndArea(zoneName, area.id);

      if (existingZone) {
        if (!existingZone.isActive) {
          existingZone.isActive = true;
          existingZone.updatedBy = { id: this.createdById } as User;
          existingZone.updatedAt = new Date();
          await this.zoneRepository.save(existingZone);
          updatedCount += 1;
        } else {
          skippedCount += 1;
          skippedExistingActiveCount += 1;
          this.logger.debug(
            `Omitido (existente activo): area="${areaName}", zona="${zoneName}"`,
          );
        }
        continue;
      }

      const existingByName = await this.findZoneByName(zoneName);

      if (existingByName) {
        existingByName.area = area;
        existingByName.isActive = true;
        existingByName.updatedBy = { id: this.createdById } as User;
        existingByName.updatedAt = new Date();
        await this.zoneRepository.save(existingByName);
        updatedCount += 1;
        continue;
      }

      const zone = this.zoneRepository.create({
        name: zoneName,
        manufacturingPlant: { id: this.manufacturingPlantId },
        area,
        isActive: true,
        createdBy: { id: this.createdById } as User,
        createdAt: new Date(),
      });

      await this.zoneRepository.save(zone);
      createdCount += 1;
    }

    this.logger.log(
      `Zones seed ejecutado. Creados: ${createdCount}, actualizados: ${updatedCount}, omitidos: ${skippedCount}`,
    );
    this.logger.log(
      `Omitidos por duplicado en seed: ${skippedDuplicateCount}, omitidos por existencia activa: ${skippedExistingActiveCount}`,
    );
  }
}
