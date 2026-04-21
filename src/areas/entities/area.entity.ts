import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  Index,
} from 'typeorm';

import { ManufacturingPlant } from 'manufacturing-plants/entities/manufacturing-plant.entity';
import { Zone } from 'zones/entities/zone.entity';
import { User } from 'users/entities/user.entity';

@Index(['name', 'manufacturingPlant'], { unique: true })
@Entity({ name: 'areas' })
export class Area {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'integer', nullable: true })
  coordinateX?: number | null;

  @Column({ type: 'integer', nullable: true })
  coordinateY?: number | null;

  @Column({ type: 'double precision', nullable: true })
  zoomLevel?: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => User)
  createdBy: User;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User, { nullable: true })
  updatedBy?: User;

  @ManyToOne(
    () => ManufacturingPlant,
    (manufacturingPlant) => manufacturingPlant.areas,
  )
  manufacturingPlant: ManufacturingPlant;

  @OneToMany(() => Zone, (zone) => zone.area)
  zones: Zone[];
}
