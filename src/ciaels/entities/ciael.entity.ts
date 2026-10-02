import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  Relation,
} from 'typeorm';

import { ManufacturingPlant } from 'manufacturing-plants/entities/manufacturing-plant.entity';
import { AccidentPosition } from 'accident-positions/entities/accident-position.entity';
import { AssociatedTask } from 'associated-tasks/entities/associated-task.entity';
import { NatureOfEvent } from 'nature-of-events/entities/nature-of-event.entity';
import { TypeOfInjury } from 'type-of-injuries/entities/type-of-injury.entity';
import { TypesOfEvent } from 'types-of-events/entities/types-of-event.entity';
import { CieDiagnosis } from 'cie-diagnoses/entities/cie-diagnosis.entity';
import { AtMechanism } from 'at-mechanisms/entities/at-mechanism.entity';
import { TypeOfLink } from 'type-of-links/entities/type-of-link.entity';
import { WorkingDay } from 'working-days/entities/working-day.entity';
import { RiskFactor } from 'risk-factors/entities/risk-factor.entity';
import { BodyPart } from 'body-parts/entities/body-part.entity';
import { AtAgent } from 'at-agents/entities/at-agent.entity';
import { Machine } from 'machines/entities/machine.entity';
import { User } from 'users/entities/user.entity';
import { Zone } from 'zones/entities/zone.entity';
import { Employee } from 'employees/entities';

@Entity({ name: 'ciael' })
export class Ciael {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('text')
  description: string;

  @Column({
    type: 'date',
    transformer: {
      from: (value: string) => value ?? null,
      to: (value: Date) => (value ? value.toISOString().slice(0, 10) : null),
    },
  })
  eventDate: Date;

  @Column('int', {
    nullable: true,
  })
  daysOfDisability: number;

  @Column('int', {
    nullable: true,
  })
  timeWorked: number;

  @Column()
  usualWork: boolean;

  @Column()
  isDeath: boolean;

  @Column()
  isInside: boolean;

  @Column('int', {
    nullable: true,
  })
  monthsOfSeniority: number;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(
    () => ManufacturingPlant,
    (manufacturingPlant) => manufacturingPlant.zones,
  )
  manufacturingPlant: Relation<ManufacturingPlant>;

  @ManyToOne(() => TypesOfEvent, (typesOfEvent) => typesOfEvent.ciaels)
  typeOfEvent: Relation<TypesOfEvent>;

  @ManyToOne(() => User, (user) => user.ciaels)
  createdBy: Relation<User>;

  @ManyToOne(() => Employee, (employee) => employee.ciaels)
  employee: Relation<Employee>;

  @ManyToOne(() => CieDiagnosis, (cieDiagnosis) => cieDiagnosis.ciaels)
  cieDiagnosis: Relation<CieDiagnosis>;

  @ManyToOne(
    () => AccidentPosition,
    (accidentPosition) => accidentPosition.ciaels,
  )
  accidentPosition: Relation<AccidentPosition>;

  @ManyToOne(() => Zone, (zone) => zone.ciaels)
  zone: Relation<Zone>;

  @ManyToOne(() => BodyPart, (bodyPart) => bodyPart.ciaels)
  bodyPart: Relation<BodyPart>;

  @ManyToOne(() => AtAgent, (atAgent) => atAgent.ciaels)
  atAgent: Relation<AtAgent>;

  @ManyToOne(() => TypeOfInjury, (typeOfInjury) => typeOfInjury.ciaels)
  typeOfInjury: Relation<TypeOfInjury>;

  @ManyToOne(() => AtMechanism, (atMechanism) => atMechanism.ciaels)
  atMechanism: Relation<AtMechanism>;

  @ManyToOne(() => WorkingDay, (workingDay) => workingDay.ciaels)
  workingDay: Relation<WorkingDay>;

  @ManyToOne(() => TypeOfLink, (typeOfLink) => typeOfLink.ciaels)
  typeOfLink: Relation<TypeOfLink>;

  @ManyToOne(() => Machine, (machine) => machine.ciaels)
  machine: Relation<Machine>;

  @ManyToOne(() => AssociatedTask, (associatedTask) => associatedTask.ciaels)
  associatedTask: Relation<AssociatedTask>;

  @ManyToOne(() => User, (user) => user.ciaelsAreaLeader)
  areaLeader: Relation<User>;

  @ManyToOne(() => RiskFactor, (riskFactor) => riskFactor.ciaels)
  riskFactor: Relation<RiskFactor>;

  @ManyToOne(() => NatureOfEvent, (riskFactor) => riskFactor.ciaels)
  natureOfEvent: Relation<NatureOfEvent>;

  @ManyToOne(() => User, (user) => user.ciaelsAreaManager)
  manager?: Relation<User>;
}
