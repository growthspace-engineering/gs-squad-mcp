import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  JoinColumn
} from 'typeorm';
import { SquadEntity } from './squad.entity';

export type AgentStatus = 'starting' | 'running' | 'done' | 'error';

@Entity('agents')
export class AgentEntity {
  @PrimaryColumn()
  agentId!: string;

  @ManyToOne(() => SquadEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'squadId' })
  squad!: SquadEntity;

  @Column()
  squadId!: string;

  @Column()
  roleName!: string;

  @Column('text', { nullable: true })
  task?: string;

  @Column('text', { nullable: true })
  prompt?: string;

  @Column()
  status!: AgentStatus;

  @Column('text', { nullable: true })
  result?: string;

  @Column('text', { nullable: true })
  error?: string;

  @Column()
  startedAt!: string;

  @Column({ nullable: true })
  finishedAt?: string;
}





