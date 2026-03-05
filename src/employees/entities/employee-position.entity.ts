import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';

import { ConfigsTg } from 'configs-tg/entities/configs-tg.entity';
import { Employee } from './employee.entity';
import { TrainingGuide } from 'training-guides/entities/training-guide.entity';

@Entity()
export class EmployeePosition {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Employee, (employee) => employee.position)
  employees: Employee[];

  @OneToMany(() => ConfigsTg, (configsTg) => configsTg.position)
  configsTg: ConfigsTg[];

  @OneToMany(() => TrainingGuide, (trainingGuide) => trainingGuide.employee)
  trainingGuides: TrainingGuide[];
}
