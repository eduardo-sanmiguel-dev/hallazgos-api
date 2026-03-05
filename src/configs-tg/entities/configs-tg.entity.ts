import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Index,
} from 'typeorm';

import { ConfigsTopicTg } from './configs-topic-tg.entity';
import { EmployeePosition } from 'employees/entities';
import { User } from 'users/entities/user.entity';
import { ManufacturingPlant } from 'manufacturing-plants/entities/manufacturing-plant.entity';

@Index(['position', 'manufacturingPlant'], { unique: true })
@Entity()
export class ConfigsTg {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ default: true })
  isActive: boolean;

  @ManyToOne(() => User, (user) => user.configTgCreated)
  createdBy: User;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => User, (user) => user.configTgUpdated)
  updatedBy: User;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(
    () => EmployeePosition,
    (employeePosition) => employeePosition.configsTg,
  )
  @JoinColumn({ name: 'employee_position_id' })
  position: EmployeePosition;

  @ManyToOne(
    () => ManufacturingPlant,
    (manufacturingPlant) => manufacturingPlant.configsTg,
  )
  @JoinColumn({ name: 'manufacturing_plant_id' })
  manufacturingPlant: ManufacturingPlant;

  @ManyToOne(() => User, (user) => user.areaTg)
  areaManager: User;

  @ManyToOne(() => User, (user) => user.humanResourceTg)
  humanResourceManager: User;

  @OneToMany(
    () => ConfigsTopicTg,
    (configsTopicTg) => configsTopicTg.configTg,
    { cascade: true },
  )
  topics: ConfigsTopicTg[];
}
