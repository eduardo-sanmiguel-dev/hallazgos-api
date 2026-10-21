import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  type Relation,
} from 'typeorm';

import { Ciael } from '../../ciaels/entities/ciael.entity.js';

@Entity({ name: 'cie-diagnoses' })
export class CieDiagnosis {
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

  @OneToMany(() => Ciael, (ciael) => ciael.cieDiagnosis)
  ciaels: Relation<Ciael[]>;
}
