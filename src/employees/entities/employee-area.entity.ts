import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';

import { Employee } from './employee.entity';
import { TrainingGuide } from 'training-guides/entities';

@Entity()
export class EmployeeArea {
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

  @OneToMany(() => Employee, (employee) => employee.area)
  employees: Employee[];

  @OneToMany(() => TrainingGuide, (trainingGuide) => trainingGuide.area)
  trainingGuides: TrainingGuide[];
}
