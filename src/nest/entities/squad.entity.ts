import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  JoinColumn
} from 'typeorm';
import { SessionEntity } from './session.entity';

@Entity('squads')
export class SquadEntity {
  @PrimaryColumn()
  squadId!: string;

  @ManyToOne(() => SessionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'originatorId' })
  session!: SessionEntity;

  @Column()
  originatorId!: string;

  @Column()
  label!: string;

  @Column()
  createdAt!: string;
}





