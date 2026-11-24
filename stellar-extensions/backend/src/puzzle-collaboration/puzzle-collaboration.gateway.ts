import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { CreateSectionCommentDto } from './dto/create-section-comment.dto';
import { UpdateSectionDto } from './dto/update-section.dto';
import { PuzzleCollaborationService } from './puzzle-collaboration.service';

@WebSocketGateway({ namespace: '/puzzle-collaboration', cors: { origin: '*' } })
export class PuzzleCollaborationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(PuzzleCollaborationGateway.name);

  constructor(private readonly collaboration: PuzzleCollaborationService) {}

  handleConnection(client: Socket): void {
    if (!this.actorId(client)) client.disconnect(true);
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`Collaboration client disconnected: ${client.id}`);
  }

  @SubscribeMessage('joinPuzzle')
  async joinPuzzle(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { puzzleId: string },
  ) {
    const actorId = this.actorId(client);
    if (!actorId || typeof data?.puzzleId !== 'string') {
      return { event: 'collaborationError', data: { message: 'Invalid session or puzzle' } };
    }
    await this.collaboration.assertCanCollaborate(data.puzzleId, actorId);
    await client.join(this.room(data.puzzleId));
    return { event: 'puzzleJoined', data: { puzzleId: data.puzzleId } };
  }

  @SubscribeMessage('updateSection')
  async updateSection(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { puzzleId: string } & UpdateSectionDto,
  ) {
    const actorId = this.actorId(client);
    if (!actorId) return this.error('Not authenticated');
    const change = await this.collaboration.updateSection(data.puzzleId, actorId, data);
    this.server.to(this.room(data.puzzleId)).emit('sectionChanged', change);
    return { event: 'sectionChanged', data: change };
  }

  @SubscribeMessage('addComment')
  async addComment(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { puzzleId: string } & CreateSectionCommentDto,
  ) {
    const actorId = this.actorId(client);
    if (!actorId) return this.error('Not authenticated');
    const comment = await this.collaboration.addComment(data.puzzleId, actorId, data);
    this.server.to(this.room(data.puzzleId)).emit('sectionCommentAdded', comment);
    return { event: 'sectionCommentAdded', data: comment };
  }

  private actorId(client: Socket): string | undefined {
    const identity = client.data?.user;
    const id = typeof identity?.id === 'string' ? identity.id : client.data?.userId;
    return typeof id === 'string' ? id : undefined;
  }

  private room(puzzleId: string): string {
    return `puzzle:${puzzleId}`;
  }

  private error(message: string) {
    return { event: 'collaborationError', data: { message } };
  }
}
