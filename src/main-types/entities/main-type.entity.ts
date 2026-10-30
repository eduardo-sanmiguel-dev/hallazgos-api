import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  type Relation,
} from 'typeorm';

import { SecondaryType } from '../../secondary-types/entities/secondary-type.entity.js';
import { Evidence } from '../../evidences/entities/evidence.entity.js';

@Entity()
export class MainType {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name: string;

  @Column({ default: true })
  isActive: boolean;

  // Foto de evidencia obligatoria al crear y al cerrar hallazgos de esta
  // clasificación (false: "Comportamiento inseguro", se reporta con texto).
  @Column({ name: 'requires_evidence', default: true })
  requiresEvidence: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => SecondaryType, (secondaryType) => secondaryType.mainType)
  secondaryTypes: Relation<SecondaryType[]>;

  @OneToMany(() => Evidence, (evidence) => evidence.mainType)
  evidences: Relation<Evidence[]>;
}
