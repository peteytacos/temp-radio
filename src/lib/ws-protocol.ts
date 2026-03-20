// Server → Client
export type ServerMessage =
  | { type: "welcome"; id: number; color: string; isCreator: boolean; rejoinToken: string; hasPassword: boolean; participants: Array<{ id: number; color: string }> }
  | { type: "participant_joined"; id: number; color: string; count: number }
  | { type: "participant_left"; id: number; count: number }
  | { type: "speaking_start"; id: number }
  | { type: "speaking_stop"; id: number }
  | { type: "room_closed" }
  | { type: "room_full" }
  | { type: "password_required" }
  | { type: "password_rejected" }
  | { type: "password_set" }
  | { type: "password_removed" }
  | { type: "rtc_offer"; fromId: number; sdp: string }
  | { type: "rtc_answer"; fromId: number; sdp: string }
  | { type: "rtc_ice"; fromId: number; candidate: RTCIceCandidateInit };

// Client → Server
export type ClientMessage =
  | { type: "speaking_start" }
  | { type: "speaking_stop" }
  | { type: "set_password"; password: string }
  | { type: "remove_password" }
  | { type: "rtc_offer"; targetId: number; sdp: string }
  | { type: "rtc_answer"; targetId: number; sdp: string }
  | { type: "rtc_ice"; targetId: number; candidate: RTCIceCandidateInit };
