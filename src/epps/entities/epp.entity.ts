import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  type Relation,
  Index,
} from 'typeorm';

import { EppEquipment } from './epp-equipment.entity.js';
import { User } from '../../users/entities/user.entity.js';
import { Employee } from '../../employees/entities/index.js';

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

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Employee, (employee) => employee.epps)
  @Index('IDX_epp_employeeId')
  employee: Relation<Employee>;

  @ManyToOne(() => User, (user) => user.epps)
  createBy: Relation<User>;

  @OneToMany(() => EppEquipment, (eppEquipment) => eppEquipment.epp)
  equipments: Relation<EppEquipment[]>;
}
