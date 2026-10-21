import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  type Relation,
  Index,
} from 'typeorm';

import { Equipment } from '../../equipments/entities/index.js';
import { Epp } from './epp.entity.js';

@Entity()
export class EppEquipment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: 'date',
    transformer: {
      from: (value: string) => (value ? new Date(value) : null),
      to: (value: Date) => (value ? value.toISOString().slice(0, 10) : null),
    },
  })
  deliveryDate: Date;

  @Column({
    type: 'date',
    transformer: {
      from: (value: string) => (value ? new Date(value) : null),
      to: (value: Date) => (value ? value.toISOString().slice(0, 10) : null),
    },
    nullable: true,
  })
  returnDate: Date;

  @Column()
  quantity: number;

  @Column()
  observations: string;

  @Column({ default: false })
  outOfRangeDelivery: boolean;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn({
    type: 'timestamptz',
    precision: 3,
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
    precision: 3,
  })
  updatedAt: Date;

  @ManyToOne(() => Epp, (epp) => epp.equipments)
  @Index('IDX_epp_equipment_eppId')
  epp: Relation<Epp>;

  @ManyToOne(() => Equipment, (equipment) => equipment.eppEquipments)
  @Index('IDX_epp_equipment_equipmentId')
  equipment: Relation<Equipment>;
}
