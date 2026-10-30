import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  ManyToMany,
  JoinTable,
  type Relation,
} from 'typeorm';

import { ExtinguisherInspection } from '../../extinguisher-inspections/entities/extinguisher-inspection.entity.js';
import { AccidentPosition } from '../../accident-positions/entities/accident-position.entity.js';
import { AssociatedTask } from '../../associated-tasks/entities/associated-task.entity.js';
import { EmergencyTeam } from '../../emergency-teams/entities/emergency-team.entity.js';
import { Processes } from '../../processes/entities/processes.entity.js';
import { Evidence } from '../../evidences/entities/evidence.entity.js';
import { Country } from '../../countries/entities/country.entity.js';
import { Machine } from '../../machines/entities/machine.entity.js';
import { Ciael } from '../../ciaels/entities/ciael.entity.js';
import { Zone } from '../../zones/entities/zone.entity.js';
import { Area } from '../../areas/entities/area.entity.js';
import { Equipment } from '../../equipments/entities/index.js';
import { Employee } from '../../employees/entities/index.js';
import { Ics } from '../../ics/entities/ics.entity.js';
@Entity()
export class ManufacturingPlant {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name: string;

  @Column({ unique: true })
  link: string;

  @Column('decimal', { unique: true })
  lat: number;

  @Column('decimal', { unique: true })
  lng: number;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Evidence, (evidence) => evidence.manufacturingPlant)
  evidences: Relation<Evidence[]>;

  @OneToMany(() => Zone, (zone) => zone.manufacturingPlant)
  zones: Relation<Zone[]>;

  @OneToMany(() => Area, (area) => area.manufacturingPlant)
  areas: Relation<Area[]>;

  @OneToMany(() => Processes, (processes) => processes.manufacturingPlant)
  processes: Relation<Processes[]>;

  @ManyToOne(() => Country, (country) => country.manufacturingPlants)
  country: Relation<Country>;

  @ManyToMany(() => Employee, (employee) => employee.manufacturingPlants)
  @JoinTable({
    name: 'employees_manufacturing_plants',
  })
  employees: Relation<Employee[]>;

  @ManyToMany(
    () => AccidentPosition,
    (accidentPosition) => accidentPosition.manufacturingPlants,
  )
  @JoinTable({
    name: 'accident_positions_manufacturing_plants',
  })
  accidentPositions: Relation<AccidentPosition[]>;

  @ManyToMany(() => Machine, (machine) => machine.manufacturingPlants)
  @JoinTable({
    name: 'machines_manufacturing_plants',
  })
  machines: Relation<Machine[]>;

  @OneToMany(() => Ciael, (ciael) => ciael.manufacturingPlant)
  ciaels: Relation<Ciael[]>;

  @OneToMany(() => Ics, (ics) => ics.manufacturingPlant)
  ics: Relation<Ics[]>;

  @ManyToMany(
    () => AssociatedTask,
    (associatedTask) => associatedTask.manufacturingPlants,
  )
  @JoinTable({
    name: 'associated_tasks_manufacturing_plants',
  })
  associatedTasks: Relation<AssociatedTask[]>;

  @OneToMany(() => Equipment, (equipment) => equipment.manufacturingPlant)
  equipments: Relation<Equipment[]>;

  @ManyToOne(() => EmergencyTeam)
  emergencyTeams: Relation<EmergencyTeam>;

  @ManyToOne(() => ExtinguisherInspection)
  extinguisherInspections: Relation<ExtinguisherInspection>;
}
