import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
} from 'typeorm';

import { ManufacturingPlant } from 'manufacturing-plants/entities/manufacturing-plant.entity';
import { EquipmentCostHistory } from './equipment-cost-history.entity';
import { EppEquipment } from 'epps/entities';

@Entity()
export class Equipment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ name: 'delivery_frequency', type: 'int', nullable: true })
  deliveryFrequency: number;

  @Column({ default: true, name: 'is_active' })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at', precision: 3 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at', precision: 3 })
  updatedAt: Date;

  @OneToMany(() => EquipmentCostHistory, (costHistory) => costHistory.equipment)
  costHistory: EquipmentCostHistory[];

  @OneToMany(() => EppEquipment, (eppEquipment) => eppEquipment.equipment)
  eppEquipments: EppEquipment[];

  @ManyToOne(
    () => ManufacturingPlant,
    (manufacturingPlant) => manufacturingPlant.equipments,
  )
  manufacturingPlant: ManufacturingPlant;
}
