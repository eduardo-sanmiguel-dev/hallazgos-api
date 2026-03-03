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
    return createEquipmentDto;
  }

  async seed() {
    await this.equipmentRepository.update(
      {
        isActive: true,
      },
      {
        manufacturingPlant: {
          id: 2,
        },
      },
    );

    const manufacturingPlantId = 3;

    const equipments = [
      { name: 'ADAPTADOR FILTRO 750036', price: '0' },
      { name: 'ARAÑA PARA CASCO (SIN IVA)', price: '0' },
      { name: 'BARBUQUEJO DE 3 PUNTOS PARA CASCO 3M', price: '0' },
      { name: 'BOTAS WESLANTD 9309 ', price: '0' },
      { name: 'BOTA BLANCA PU-BIODENSIDAD - SI', price: '0' },
      { name: 'BOTA NEGRA PU-BIODENSIDAD - SI', price: '0' },
      { name: 'BOTA SEG/ING STEEL SERIE REVOLUTION   SI', price: '0' },
      { name: 'BOTAS PARA SOLDADOR', price: '0' },
      { name: 'CARETA PARA SOLDAR', price: '0' },
      { name: 'CARETA PROTECTOR FACIAL VISOR AMARILLA', price: '0' },
      { name: 'CASCO SEGURIDAD  3M SI', price: '0' },
      { name: 'CHALECO REFLECTIVO ( SIN IVA )', price: '0' },
      { name: 'CONJUNTO IMPERMEABLE EN PVC ( SIN IVA )', price: '0' },
      { name: 'DELANTAL  DE CARNAZA (CON IVA)', price: '0' },
      { name: 'DELANTAL BLANCO EN PVC (CON IVA)', price: '0' },
      { name: 'FILTRO 3M PARTICULAS N95   SI', price: '0' },
      { name: 'FILTRO PARA HUMOS METALICOS HONEYWELL', price: '0' },
      { name: 'FILTROS PARA SOLDADURA 3M No 2097', price: '0' },
      { name: 'GAFAS DE SEGURIDAD OSCURAS CAJA X 12', price: '0' },
      { name: 'GAFAS DE SEGURIDAD TRANSPARENTE   SI', price: '0' },
      { name: 'GORRA TIPO MONJA  (SST)', price: '0' },
      { name: 'GUANTE ANSELL HYFLEX 11-561', price: '0' },
      { name: 'GUANTE ANTI CORTE NIVEL 5 (SIN IVA)', price: '0' },
      { name: 'GUANTE DE NITRILO LARGO(CI)', price: '0' },
      { name: 'GUANTE HYFLEX 11-840 ANSELL(CI)', price: '0' },
      { name: 'GUANTE HYFLEX 11-939 ANSELL', price: '0' },
      { name: 'GUANTE LARGO PVC ALPHATEC 23-201', price: '0' },
      { name: 'GUANTE TIPO VAQUETA CORTO (SIN IVA)', price: '0' },
      { name: 'GUANTE VAQUETA SENCILLO TIPO LARGO', price: '0' },
      { name: 'GUANTES DE NITRILO VERDE LARGOS', price: '0' },
      { name: 'GUANTES PROTECCIÓN ARCO ELECTRICO 80-813', price: '0' },
      { name: 'GUANTES TIPO INGENIERO LARGOS 12"', price: '0' },
      { name: 'MONOGAFAS', price: '0' },
      { name: 'PREFILTRO 3M REF.: 5N11', price: '0' },
      { name: 'PREFILTRO PARTICULAS 7506N95', price: '0' },
      { name: 'PROTECTOR AUDITIVO DE COPA PARA CASCO SI', price: '0' },
      { name: 'PROTECTOR AUDITIVO TIPO COPA  SI', price: '0' },
      { name: 'PROTECTOR FACIAL PARA CASCO SEGURIDAD 3M', price: '0' },
      { name: 'RESPIRADOR 3M 9010', price: '0' },
      { name: 'RESPIRADOR MEDIA CARA DE SILICONA 3M', price: '0' },
      { name: 'RESPIRADOR SILICONA 7700/30M', price: '0' },
      { name: 'RODILLERA PAR REF 2016904 MAVERICK', price: '0' },
      { name: 'TRAJE TYCHEM 2000', price: '0' },
      { name: 'TRAJE TYCHEM 400', price: '0' },
      { name: 'TRAJE TYVECK PROTECCIÓN A QUIMICO L', price: '0' },
      { name: 'TRAJE TYVECK TALLA L  PARA INACTIVAR', price: '0' },
      { name: 'TRAJE TYVECK TALLA L (SIN IVA)', price: '0' },
      { name: 'GUANTE RESISTENTE AL CALOR 43-113 KEVLAR', price: '0' },
      { name: 'PROTECTOR SOLAR FACIAL (SIN IVA)', price: '0' },
      { name: 'SOBRELENTES DE SEGURIDAD', price: '0' },
      { name: 'PROTECTOR AUDITIVO DE INSERCCION(SI)', price: '0' },
      { name: 'CARTUCHO VAPORES ORGANICOS 7500/1', price: '0' },
      { name: 'CARTUCHO FILTROS PARA QUIMICOS 6001  SI', price: '0' },
      { name: 'MONJA DE ALGODON PARA SOLDAR (SIN IVA)', price: '0' },
      { name: 'CAPUCHA  DE SOL  CI', price: '0' },
      { name: 'CARTUCHO  FILTRO PARA QUIMICO  3M 7093', price: '0' },
      { name: 'RETENEDOR PARA FILTRO 3M  REF- 501 SI', price: '0' },
      { name: 'GUANTES ALPHATEC-16-650', price: '0' },
      { name: 'GUANTE ANSELL MICROFLEX  93-260', price: '0' },
    ];

    for (const equipment of equipments) {
      const equipmentNew = await this.equipmentRepository.save({
        name: equipment.name,
        manufacturingPlant: {
          id: manufacturingPlantId,
        },
      });

      await this.equipmentCostHistoryRepository.save({
        price: Number(equipment.price),
        equipment: equipmentNew,
        captureDate: new Date(),
      });
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
