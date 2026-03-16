# Squelch (Temp Radio) — Potential Assessment

_Evaluated: 2026-03-16_

## Summary

Squelch is a web-based walkie-talkie with push-to-talk, real-time P2P voice via WebRTC, live waveform visualization, and a retro radio UI. Rooms are ephemeral, no sign-up required, up to 16 participants.

## Strengths

- **Zero friction** — no accounts, no downloads, share a link and talk. Strong viral loop potential.
- **Clear concept** — the walkie-talkie metaphor is instantly understandable. PTT simplifies rather than limits.
- **Polished execution** — retro radio aesthetic, squelch sound effects, per-speaker colored waveforms, connection diagnostics.
- **Technically solid** — 77 tests, WebRTC with STUN/TURN fallback, ICE restart, rate limiting, wake lock. Beyond typical MVP quality.
- **Mobile-first** — the primary use case (quick group coordination) maps perfectly to phones.

## Challenges

- **Crowded space** — Discord, Telegram voice chats, Zello, FaceTime are entrenched.
- **No persistence or identity** — ephemeral rooms limit retention. No history, contacts, or communities.
- **Scaling ceiling** — in-memory single-server state won't survive real traction without rearchitecture.
- **Discovery problem** — no organic discovery path; growth depends on word-of-mouth or external promotion.

## Most Promising Angles

1. **Event coordination** — concerts, group hikes, conventions. "Everyone open this link" is compelling for ephemeral group voice.
2. **Novelty/virality** — the radio aesthetic is shareable on social media.
3. **Developer reference** — impressive WebRTC implementation that could attract technical audience.

## What Would Move the Needle

- A **retention mechanism** (saved channels, recurring rooms, lightweight identity)
- A **clear wedge use case** where Squelch is 10x better than alternatives, not just different
- **Lean into zero-friction ephemeral** as the core differentiator

## Verdict

**Niche potential today, broader potential with strategic focus.** Great craftsmanship, fun concept, real utility in specific scenarios. Popularity depends less on the tech (which is solid) and more on finding and owning the one use case where nothing else works as well.
