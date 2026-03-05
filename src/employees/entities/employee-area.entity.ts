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

  @CreateDateColumn({ type: 'timestamptz', precision: 3 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', precision: 3 })
  updatedAt: Date;

  @OneToMany(() => Employee, (employee) => employee.area)
  employees: Employee[];

  @OneToMany(() => TrainingGuide, (trainingGuide) => trainingGuide.area)
  trainingGuides: TrainingGuide[];
}
