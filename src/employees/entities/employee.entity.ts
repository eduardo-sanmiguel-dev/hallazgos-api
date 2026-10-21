import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  ManyToMany,
  type Relation,
  Index,
} from 'typeorm';

import { ManufacturingPlant } from '../../manufacturing-plants/entities/manufacturing-plant.entity.js';
import { EmployeePosition } from './employee-position.entity.js';
import { EmployeeArea } from './employee-area.entity.js';
import { Ciael } from '../../ciaels/entities/ciael.entity.js';
import { Genre } from '../../genres/entities/genre.entity.js';
import { Epp } from '../../epps/entities/epp.entity.js';
import { Ics } from '../../ics/entities/ics.entity.js';

@Entity()
export class Employee {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    unique: true,
    type: 'bigint',
  })
  code: number;

  @Column()
  name: string;

  @Column({
    nullable: true,
    type: 'date',
    transformer: {
      from: (value: string) => value ?? null,
      to: (value: Date) =>
        value ? new Date(value).toISOString().slice(0, 10) : null,
    },
  })
  birthdate: Date;

  @Column({
    nullable: true,
    type: 'date',
    transformer: {
      from: (value: string) => value ?? null,
      to: (value: Date) =>
        value ? new Date(value).toISOString().slice(0, 10) : null,
    },
  })
  dateOfAdmission: Date;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => EmployeeArea, (area) => area.employees)
  @Index('IDX_employee_areaId')
  area: Relation<EmployeeArea>;

  @ManyToOne(() => EmployeePosition, (position) => position.employees)
  @Index('IDX_employee_positionId')
  position: Relation<EmployeePosition>;

  @OneToMany(() => Epp, (epp) => epp.employee)
  epps: Relation<Epp[]>;

  @ManyToMany(
    () => ManufacturingPlant,
    (manufacturingPlant) => manufacturingPlant.employees,
  )
  manufacturingPlants: Relation<ManufacturingPlant[]>;

  @OneToMany(() => Ciael, (ciael) => ciael.employee)
  ciaels: Relation<Ciael[]>;

  @ManyToOne(() => Genre, (genre) => genre.employees)
  gender: Relation<Genre>;

  @ManyToMany(() => Ics, (ics) => ics.employees)
  ics: Relation<Ics[]>;
}
