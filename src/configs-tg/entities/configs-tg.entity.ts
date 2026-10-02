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
  Relation,
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
  createdBy: Relation<User>;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => User, (user) => user.configTgUpdated)
  updatedBy: Relation<User>;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(
    () => EmployeePosition,
    (employeePosition) => employeePosition.configsTg,
  )
  @JoinColumn({ name: 'employee_position_id' })
  position: Relation<EmployeePosition>;

  @ManyToOne(
    () => ManufacturingPlant,
    (manufacturingPlant) => manufacturingPlant.configsTg,
  )
  @JoinColumn({ name: 'manufacturing_plant_id' })
  manufacturingPlant: Relation<ManufacturingPlant>;

  @ManyToOne(() => User, (user) => user.areaTg)
  areaManager: Relation<User>;

  @ManyToOne(() => User, (user) => user.humanResourceTg)
  humanResourceManager: Relation<User>;

  @OneToMany(
    () => ConfigsTopicTg,
    (configsTopicTg) => configsTopicTg.configTg,
    { cascade: true },
  )
  topics: Relation<ConfigsTopicTg[]>;
}
