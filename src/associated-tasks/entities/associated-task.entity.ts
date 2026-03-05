import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToMany,
  OneToMany,
} from 'typeorm';

import { ManufacturingPlant } from 'manufacturing-plants/entities/manufacturing-plant.entity';
import { Ciael } from 'ciaels/entities/ciael.entity';

@Entity({ name: 'associated_tasks' })
export class AssociatedTask {
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
    (manufacturingPlant) => manufacturingPlant.associatedTasks,
  )
  manufacturingPlants: ManufacturingPlant[];

  @OneToMany(() => Ciael, (ciael) => ciael.associatedTask)
  ciaels: Ciael[];
}
