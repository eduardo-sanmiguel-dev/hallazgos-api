import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  type Relation,
} from 'typeorm';

import { ManufacturingPlant } from '../../manufacturing-plants/entities/manufacturing-plant.entity.js';

@Entity({ name: 'countries' })
export class Country {
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

  @OneToMany(
    () => ManufacturingPlant,
    (manufacturingPlant) => manufacturingPlant.country,
  )
  manufacturingPlants: Relation<ManufacturingPlant[]>;
}
