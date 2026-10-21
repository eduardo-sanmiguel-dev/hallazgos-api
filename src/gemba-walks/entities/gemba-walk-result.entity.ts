import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  type Relation,
  Index,
} from 'typeorm';

import { GembaWalkEvaluation } from '../../gemba-walk-evaluations/entities/gemba-walk-evaluation.entity.js';
import { GembaWalk } from './gemba-walk.entity.js';

// Resultado de un concepto en un recorrido: C (cumple) / NC (no cumple).
@Entity({ name: 'gemba_walk_results' })
export class GembaWalkResult {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => GembaWalk, (gembaWalk) => gembaWalk.results, {
    onDelete: 'CASCADE',
  })
  @Index('IDX_gemba_walk_results_gembaWalkId')
  gembaWalk: Relation<GembaWalk>;

  @ManyToOne(() => GembaWalkEvaluation)
  gembaWalkEvaluation: Relation<GembaWalkEvaluation>;

  // Copia del concepto al momento del recorrido (el catálogo puede cambiar).
  @Column()
  area: string;

  @Column({ length: 30 })
  category: string;

  @Column({ type: 'text' })
  description: string;

  @Column()
  isCompliant: boolean;

  @Column({ type: 'text', nullable: true })
  comments?: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
