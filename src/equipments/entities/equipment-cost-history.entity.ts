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

import { Equipment } from './equipment.entity.js';

@Entity()
export class EquipmentCostHistory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: number;

  @Column({
    type: 'date',
    transformer: {
      from: (value: string) => (value ? new Date(value) : null),
      to: (value: Date) => (value ? value.toISOString().slice(0, 10) : null),
    },
  })
  captureDate: Date;

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

  @ManyToOne(() => Equipment, (equipment) => equipment.costHistory)
  @Index('IDX_equipment_cost_history_equipmentId')
  equipment: Relation<Equipment>;
}
