// Server → Client
export type ServerMessage =
  | { type: "welcome"; id: number; color: string; isCreator: boolean; participants: Array<{ id: number; color: string }> }
  | { type: "participant_joined"; id: number; color: string; count: number }
  | { type: "participant_left"; id: number; count: number }
  | { type: "speaking_start"; id: number }
  | { type: "speaking_stop"; id: number }
  | { type: "room_closed" };

// Client → Server
export type ClientMessage =
  | { type: "speaking_start" }
  | { type: "speaking_stop" };
