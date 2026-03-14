export type WSMessage =
  | { type: "status"; broadcasting: boolean }
  | { type: "listeners"; count: number }
  | { type: "room_closed" };
