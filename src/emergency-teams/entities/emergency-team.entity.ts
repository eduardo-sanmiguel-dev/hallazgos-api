import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Check,
  ManyToOne,
  Index,
} from 'typeorm';

import { ManufacturingPlant } from 'manufacturing-plants/entities/manufacturing-plant.entity';
import { User } from 'users/entities/user.entity';

export enum ExtinguisherType {
  PQS = 'PQS',
  CO2 = 'CO2',
  AFFF = 'AFFF',
}

@Entity({ name: 'emergency_teams' })
@Index(
  [
    'location',
    'extinguisherNumber',
    'typeOfExtinguisher',
    'capacity',
    'manufacturingPlant',
  ],
  { unique: true },
)
@Check(`char_length("location") >= 3`)
export class EmergencyTeam {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    length: 150,
  })
  location: string;

  @Column({ type: 'integer' })
  extinguisherNumber: number;

  @Column({
    type: 'enum',
    enum: ExtinguisherType,
  })
  typeOfExtinguisher: ExtinguisherType;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
  })
  capacity: number;

  @Column({ default: true })
  isActive: boolean;

  @ManyToOne(() => User)
  createdBy: User;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => User)
  updatedBy?: User;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(
    () => ManufacturingPlant,
    (manufacturingPlant) => manufacturingPlant.emergencyTeams,
  )
  manufacturingPlant: ManufacturingPlant;
}
