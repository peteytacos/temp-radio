import { customAlphabet } from "nanoid";

const generate = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 6);

export function generateRoomId(): string {
  return generate();
}
