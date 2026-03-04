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
import { User } from 'users/entities/user.entity';

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

  @ManyToOne(() => User, (user) => user.equipmentCreated)
  createdBy: User;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at', precision: 3 })
  updatedAt: Date;

  @ManyToOne(() => User, (user) => user.equipmentUpdated)
  updatedBy: User;

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
