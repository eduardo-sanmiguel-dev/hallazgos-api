import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  ManyToMany,
  JoinTable,
  JoinColumn,
  Index,
  type Relation,
} from 'typeorm';

import { ManufacturingPlant } from '../../manufacturing-plants/entities/manufacturing-plant.entity.js';
import { MainType } from '../../main-types/entities/main-type.entity.js';
import { SecondaryType } from '../../secondary-types/entities/secondary-type.entity.js';
import { Zone } from '../../zones/entities/zone.entity.js';
import { User } from '../../users/entities/user.entity.js';
import { Comment } from './comments.entity.js';
import { Processes } from '../../processes/entities/processes.entity.js';

@Entity()
export class Evidence {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  imgEvidence: string;

  @Column({ default: '' })
  imgSolution: string;

  @Column({ type: 'int', nullable: true, default: null })
  priorityDays?: number;

  @Column({ default: '' })
  imgProcess: string;

  @Column({ default: null })
  @Index()
  startProcessDate: Date;

  @Column({ default: null })
  @Index()
  solutionDate: Date;

  @Column({ default: '' })
  description: string;

  @Column({ default: '' })
  descriptionSolution: string;

  @Column()
  @Index()
  status: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(
    () => ManufacturingPlant,
    (manufacturingPlant) => manufacturingPlant.evidences,
  )
  @Index()
  manufacturingPlant: Relation<ManufacturingPlant>;

  @ManyToOne(() => MainType, (mainType) => mainType.evidences)
  @Index()
  mainType: Relation<MainType>;

  @ManyToOne(() => SecondaryType, (secondaryType) => secondaryType.evidences)
  @Index()
  secondaryType: Relation<SecondaryType>;

  @ManyToOne(() => Zone, (zone) => zone.evidences)
  @Index()
  zone: Relation<Zone>;

  @ManyToOne(() => Processes, (process) => process.evidences)
  @Index()
  process?: Relation<Processes>;

  @ManyToOne(() => User, (user) => user.evidences)
  @Index()
  user: Relation<User>;

  // Quién pasó el hallazgo a "En progreso" y quién lo cerró. Nulos en los
  // anteriores a esta columna (no se registraba). Ver la migración
  // AddStartedAndClosedByToEvidence1793000000000.
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'startedById',
    foreignKeyConstraintName: 'FK_evidence_startedById',
  })
  @Index('IDX_evidence_startedById')
  startedBy?: Relation<User> | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'closedById',
    foreignKeyConstraintName: 'FK_evidence_closedById',
  })
  @Index('IDX_evidence_closedById')
  closedBy?: Relation<User> | null;

  // Quién hizo la última reasignación de responsables y cuándo (hora local
  // de la planta, como startProcessDate). Nulos en los hallazgos que nunca
  // se reasignaron o se reasignaron antes de esta columna. Ver la migración
  // AddReassignedByToEvidence1793100000000.
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'reassignedById',
    foreignKeyConstraintName: 'FK_evidence_reassignedById',
  })
  @Index('IDX_evidence_reassignedById')
  reassignedBy?: Relation<User> | null;

  @Column({ type: 'timestamp', nullable: true, default: null })
  reassignedAt?: Date | null;

  @ManyToMany(() => User)
  @JoinTable()
  supervisors: Relation<User[]>;

  @ManyToMany(() => User)
  @JoinTable()
  responsibles: Relation<User[]>;

  @OneToMany(() => Comment, (comment) => comment.evidence)
  comments: Relation<Comment[]>;
}
