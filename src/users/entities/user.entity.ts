import * as argon2 from 'argon2';
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  BeforeInsert,
  ManyToMany,
  JoinTable,
  OneToMany,
  type Relation,
} from 'typeorm';

import { ManufacturingPlant } from '../../manufacturing-plants/entities/manufacturing-plant.entity.js';
import { Processes } from '../../processes/entities/processes.entity.js';
import { Evidence } from '../../evidences/entities/evidence.entity.js';
import { Comment } from '../../evidences/entities/comments.entity.js';
import { Ciael } from '../../ciaels/entities/ciael.entity.js';
import { Zone } from '../../zones/entities/zone.entity.js';
import { Equipment } from '../../equipments/entities/index.js';
import { Epp } from '../../epps/entities/epp.entity.js';
import { Ics } from '../../ics/entities/ics.entity.js';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ unique: true })
  email: string;

  @Column({ select: false })
  password: string;

  @Column()
  role: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToMany(() => ManufacturingPlant)
  @JoinTable({
    name: 'user_manufacturing_plants',
  })
  manufacturingPlants: Relation<ManufacturingPlant[]>;

  @ManyToMany(() => Zone)
  @JoinTable({
    name: 'user_zones',
  })
  zones: Relation<Zone[]>;

  @ManyToMany(() => Processes)
  @JoinTable({
    name: 'user_processes',
  })
  processes: Relation<Processes[]>;

  @OneToMany(() => Evidence, (evidence) => evidence.user)
  evidences: Relation<Evidence[]>;

  @OneToMany(() => Comment, (evidence) => evidence.user)
  comments: Relation<Comment[]>;

  @OneToMany(() => Ics, (ics) => ics.createdBy)
  ics: Relation<Ics[]>;

  @OneToMany(() => Epp, (epp) => epp.createBy)
  epps: Relation<Epp[]>;

  @OneToMany(() => Equipment, (equipment) => equipment.createdBy)
  equipmentCreated: Relation<Equipment[]>;

  @OneToMany(() => Equipment, (equipment) => equipment.updatedBy)
  equipmentUpdated: Relation<Equipment[]>;

  @OneToMany(() => Ciael, (ciael) => ciael.createdBy)
  ciaels: Relation<Ciael[]>;

  @OneToMany(() => Ciael, (ciael) => ciael.areaLeader)
  ciaelsAreaLeader: Relation<Ciael[]>;

  @OneToMany(() => Ciael, (ciael) => ciael.areaLeader)
  ciaelsAreaManager: Relation<Ciael[]>;

  @BeforeInsert()
  async hashPassword() {
    this.password = await argon2.hash(this.password);
  }
}
