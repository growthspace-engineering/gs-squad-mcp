import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('sessions')
export class SessionEntity {
  @PrimaryColumn()
  originatorId!: string;

  @Column({ nullable: true })
  orchestratorChatId?: string;

  @Column({ nullable: true })
  workspaceId?: string;

  @Column()
  createdAt!: string;

  @Column()
  lastActivityAt!: string;
}




