import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';

import { Repository } from 'typeorm';

import { CreateEquipmentDto, UpdateEquipmentDto } from './dto';
import { Equipment, EquipmentCostHistory } from './entities';

@Injectable()
export class EquipmentsService {
  constructor(
    @InjectRepository(Equipment)
    private readonly equipmentRepository: Repository<Equipment>,
    @InjectRepository(EquipmentCostHistory)
    private readonly equipmentCostHistoryRepository: Repository<EquipmentCostHistory>,
  ) {}

  create(createEquipmentDto: CreateEquipmentDto) {
    this.equipmentCostHistoryRepository;
    return createEquipmentDto;
  }

  async seed() {
    const data = [
      { name: 'ADAPTADOR FILTRO 750036', deliveryFrequency: 90 },
      { name: 'ARAÑA PARA CASCO (SIN IVA)', deliveryFrequency: 90 },
      { name: 'BARBUQUEJO DE 3 PUNTOS PARA CASCO 3M', deliveryFrequency: 365 },
      { name: 'BOTAS WESLANTD 9309 ', deliveryFrequency: 365 },
      { name: 'BOTA BLANCA PU-BIODENSIDAD - SI', deliveryFrequency: 365 },
      { name: 'BOTA NEGRA PU-BIODENSIDAD - SI', deliveryFrequency: 365 },
      {
        name: 'BOTA SEG/ING STEEL SERIE REVOLUTION   SI',
        deliveryFrequency: 365,
      },
      { name: 'BOTAS PARA SOLDADOR', deliveryFrequency: 365 },
      { name: 'CARETA PARA SOLDAR', deliveryFrequency: 365 },
      {
        name: 'CARETA PROTECTOR FACIAL VISOR AMARILLA',
        deliveryFrequency: 365,
      },
      { name: 'CASCO SEGURIDAD  3M SI', deliveryFrequency: 365 },
      { name: 'CHALECO REFLECTIVO ( SIN IVA )', deliveryFrequency: 90 },
      {
        name: 'CONJUNTO IMPERMEABLE EN PVC ( SIN IVA )',
        deliveryFrequency: 90,
      },
      { name: 'DELANTAL  DE CARNAZA (CON IVA)', deliveryFrequency: 90 },
      { name: 'DELANTAL BLANCO EN PVC (CON IVA)', deliveryFrequency: 45 },
      { name: 'FILTRO 3M PARTICULAS N95   SI', deliveryFrequency: 60 },
      { name: 'FILTRO PARA HUMOS METALICOS HONEYWELL', deliveryFrequency: 30 },
      { name: 'FILTROS PARA SOLDADURA 3M No 2097', deliveryFrequency: 30 },
      { name: 'GAFAS DE SEGURIDAD OSCURAS CAJA X 12', deliveryFrequency: 60 },
      { name: 'GAFAS DE SEGURIDAD TRANSPARENTE   SI', deliveryFrequency: 45 },
      { name: 'GORRA TIPO MONJA  (SST)', deliveryFrequency: 90 },
      { name: 'GUANTE ANSELL HYFLEX 11-561', deliveryFrequency: 15 },
      { name: 'GUANTE ANTI CORTE NIVEL 5 (SIN IVA)', deliveryFrequency: 30 },
      { name: 'GUANTE DE NITRILO LARGO(CI)', deliveryFrequency: 30 },
      { name: 'GUANTE HYFLEX 11-840 ANSELL(CI)', deliveryFrequency: 15 },
      { name: 'GUANTE HYFLEX 11-939 ANSELL', deliveryFrequency: 15 },
      { name: 'GUANTE LARGO PVC ALPHATEC 23-201', deliveryFrequency: 60 },
      { name: 'GUANTE TIPO VAQUETA CORTO (SIN IVA)', deliveryFrequency: 30 },
      { name: 'GUANTE VAQUETA SENCILLO TIPO LARGO', deliveryFrequency: 30 },
      { name: 'GUANTES DE NITRILO VERDE LARGOS', deliveryFrequency: 30 },
      {
        name: 'GUANTES PROTECCIÓN ARCO ELECTRICO 80-813',
        deliveryFrequency: 180,
      },
      { name: `GUANTES TIPO INGENIERO LARGOS 12"`, deliveryFrequency: 30 },
      { name: 'MONOGAFAS', deliveryFrequency: 90 },
      { name: 'PREFILTRO 3M REF.: 5N11', deliveryFrequency: 30 },
      { name: 'PREFILTRO PARTICULAS 7506N95', deliveryFrequency: 30 },
      {
        name: 'PROTECTOR AUDITIVO DE COPA PARA CASCO SI',
        deliveryFrequency: 365,
      },
      { name: 'PROTECTOR AUDITIVO TIPO COPA  SI', deliveryFrequency: 365 },
      {
        name: 'PROTECTOR FACIAL PARA CASCO SEGURIDAD 3M',
        deliveryFrequency: 365,
      },
      { name: 'RESPIRADOR 3M 9010', deliveryFrequency: 8 },
      { name: 'RESPIRADOR MEDIA CARA DE SILICONA 3M', deliveryFrequency: 180 },
      { name: 'RESPIRADOR SILICONA 7700/30M', deliveryFrequency: 365 },
      { name: 'RODILLERA PAR REF 2016904 MAVERICK', deliveryFrequency: 90 },
      { name: 'TRAJE TYCHEM 2000', deliveryFrequency: 8 },
      { name: 'TRAJE TYCHEM 400', deliveryFrequency: 30 },
      { name: 'TRAJE TYVECK PROTECCIÓN A QUIMICO L', deliveryFrequency: 30 },
      { name: 'TRAJE TYVECK TALLA L  PARA INACTIVAR', deliveryFrequency: 30 },
      { name: 'TRAJE TYVECK TALLA L (SIN IVA)', deliveryFrequency: 30 },
      {
        name: 'GUANTE RESISTENTE AL CALOR 43-113 KEVLAR',
        deliveryFrequency: 45,
      },
      { name: 'PROTECTOR SOLAR FACIAL (SIN IVA)', deliveryFrequency: 90 },
      { name: 'SOBRELENTES DE SEGURIDAD', deliveryFrequency: 90 },
      { name: 'PROTECTOR AUDITIVO DE INSERCCION(SI)', deliveryFrequency: 120 },
      { name: 'CARTUCHO VAPORES ORGANICOS 7500/1', deliveryFrequency: 60 },
      {
        name: 'CARTUCHO FILTROS PARA QUIMICOS 6001  SI',
        deliveryFrequency: 60,
      },
      { name: 'MONJA DE ALGODON PARA SOLDAR (SIN IVA)', deliveryFrequency: 90 },
      { name: 'CAPUCHA  DE SOL  CI', deliveryFrequency: 90 },
      { name: 'CARTUCHO  FILTRO PARA QUIMICO  3M 7093', deliveryFrequency: 60 },
      { name: 'RETENEDOR PARA FILTRO 3M  REF- 501 SI', deliveryFrequency: 90 },
      { name: 'GUANTES ALPHATEC-16-650', deliveryFrequency: 60 },
      { name: 'GUANTE ANSELL MICROFLEX  93-260', deliveryFrequency: 8 },
    ];

    for (const { name, deliveryFrequency } of data) {
      const equipment = await this.equipmentRepository.findOne({
        where: { name },
      });

      if (equipment) {
        await this.equipmentRepository.update(equipment.id, {
          deliveryFrequency,
        });
      }
    }

    return {
      message: 'Equipments seeded successfully',
    };
  }

  findAll(manufacturingPlantId: number) {
    return this.equipmentRepository.find({
      where: {
        isActive: true,
        manufacturingPlant: {
          id: manufacturingPlantId,
        },
      },
      order: {
        name: 'ASC',
      },
    });
  }

  findOne(id: number) {
    return `This action returns a #${id} equipment`;
  }

  update(id: number, updateEquipmentDto: UpdateEquipmentDto) {
    return { id, updateEquipmentDto };
  }

  remove(id: number) {
    return `This action removes a #${id} equipment`;
  }
}
