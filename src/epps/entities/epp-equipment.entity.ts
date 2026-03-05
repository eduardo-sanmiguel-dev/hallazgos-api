import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
} from 'typeorm';

import { Equipment } from 'equipments/entities';
import { Epp } from './epp.entity';

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
  epp: Epp;

  @ManyToOne(() => Equipment, (equipment) => equipment.eppEquipments)
  equipment: Equipment;
}
