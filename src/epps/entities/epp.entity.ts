import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';

import { EppEquipment } from './epp-equipment.entity';
import { User } from 'users/entities/user.entity';
import { Employee } from 'employees/entities';

@Entity()
export class Epp {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  signature: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn({
    type: 'timestamptz',
    precision: 3,
  })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', precision: 3 })
  updatedAt: Date;

  @ManyToOne(() => Employee, (employee) => employee.epps)
  employee: Employee;

  @ManyToOne(() => User, (user) => user.epps)
  createBy: User;

  @OneToMany(() => EppEquipment, (eppEquipment) => eppEquipment.epp)
  equipments: EppEquipment[];
}
