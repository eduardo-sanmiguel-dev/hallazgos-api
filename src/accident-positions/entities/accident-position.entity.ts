import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToMany,
  type Relation,
} from 'typeorm';

import { ManufacturingPlant } from '../../manufacturing-plants/entities/manufacturing-plant.entity.js';
import { Ciael } from '../../ciaels/entities/ciael.entity.js';
@Entity({ name: 'accident_positions' })
export class AccidentPosition {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    unique: true,
  })
  name: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToMany(
    () => ManufacturingPlant,
    (manufacturingPlant) => manufacturingPlant.accidentPositions,
  )
  manufacturingPlants: Relation<ManufacturingPlant[]>;

  @OneToMany(() => Ciael, (ciael) => ciael.accidentPosition)
  ciaels: Relation<Ciael[]>;
}
