import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  Relation,
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

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => User, (user) => user.equipmentCreated)
  createdBy: Relation<User>;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User, (user) => user.equipmentUpdated)
  updatedBy: Relation<User>;

  @OneToMany(() => EquipmentCostHistory, (costHistory) => costHistory.equipment)
  costHistory: Relation<EquipmentCostHistory[]>;

  @OneToMany(() => EppEquipment, (eppEquipment) => eppEquipment.equipment)
  eppEquipments: Relation<EppEquipment[]>;

  @ManyToOne(
    () => ManufacturingPlant,
    (manufacturingPlant) => manufacturingPlant.equipments,
  )
  manufacturingPlant: Relation<ManufacturingPlant>;
}
