import type { Room } from "../protocol/types";

export class RoomManager {
  private readonly rooms = new Map<string, Room>();

  constructor(initialRooms: Room[] = []) {
    for (const room of initialRooms) this.rooms.set(room.id, room);
  }

  create(objective?: string): Room {
    const room: Room = {
      id: `room_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      objective,
      createdAt: new Date().toISOString(),
      taskIds: [],
    };
    this.rooms.set(room.id, room);
    return room;
  }

  addTask(roomId: string, taskId: string): void {
    const room = this.rooms.get(roomId);
    if (room) room.taskIds.push(taskId);
  }

  get(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  list(): Room[] {
    return [...this.rooms.values()];
  }
}
