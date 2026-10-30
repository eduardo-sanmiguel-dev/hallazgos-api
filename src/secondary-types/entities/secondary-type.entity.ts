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

import { MainType } from '../../main-types/entities/main-type.entity.js';
import { Evidence } from '../../evidences/entities/evidence.entity.js';

@Entity()
export class SecondaryType {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => MainType, (mainType) => mainType.secondaryTypes)
  @Index('IDX_secondary_type_mainTypeId')
  mainType: Relation<MainType>;

  @OneToMany(() => Evidence, (evidence) => evidence.secondaryType)
  evidences: Relation<Evidence[]>;
}
