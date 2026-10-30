import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  Index,
  type Relation,
} from 'typeorm';

import { ManufacturingPlant } from '../../manufacturing-plants/entities/manufacturing-plant.entity.js';
import { Evidence } from '../../evidences/entities/evidence.entity.js';
import { Ciael } from '../../ciaels/entities/ciael.entity.js';
import { User } from '../../users/entities/user.entity.js';
import { Area } from '../../areas/entities/area.entity.js';

@Entity({ name: 'zones' })
@Index(['name', 'manufacturingPlant'], { unique: true })
export class Zone {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Evidence, (evidence) => evidence.zone)
  evidences: Relation<Evidence[]>;

  @ManyToOne(() => User)
  createdBy: Relation<User>;

  @ManyToOne(() => User, { nullable: true })
  updatedBy?: Relation<User>;

  @ManyToOne(() => User, (user) => user.zones)
  user: Relation<User>;

  @ManyToOne(
    () => ManufacturingPlant,
    (manufacturingPlant) => manufacturingPlant.zones,
  )
  @Index('IDX_zones_manufacturingPlantId')
  manufacturingPlant: Relation<ManufacturingPlant>;

  @ManyToOne(() => Area, (area) => area.zones)
  @Index('IDX_zones_areaId')
  area: Relation<Area>;

  @OneToMany(() => Ciael, (ciael) => ciael.zone)
  ciaels: Relation<Ciael[]>;
}
