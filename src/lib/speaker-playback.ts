import { AUDIO_MIME_TYPE } from "./audio-config";

export class SpeakerPlayback {
  audio: HTMLAudioElement;
  analyser: AnalyserNode;
  private mediaSource: MediaSource;
  private sourceBuffer: SourceBuffer | null = null;
  private queue: ArrayBuffer[] = [];
  private destroyed = false;

  constructor(audioCtx: AudioContext) {
    // Resume AudioContext in case the browser auto-suspended it during inactivity
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }

    this.audio = new Audio();
    this.mediaSource = new MediaSource();
    this.audio.src = URL.createObjectURL(this.mediaSource);

    this.analyser = audioCtx.createAnalyser();
    this.analyser.fftSize = 256;

    const source = audioCtx.createMediaElementSource(this.audio);
    source.connect(this.analyser);
    this.analyser.connect(audioCtx.destination);

    this.mediaSource.addEventListener("sourceopen", () => {
      if (this.destroyed) return;
      try {
        this.sourceBuffer = this.mediaSource.addSourceBuffer(AUDIO_MIME_TYPE);
        this.sourceBuffer.addEventListener("updateend", () => this.flush());
        this.flush();
      } catch (e) {
        console.error("Failed to create SourceBuffer:", e);
      }
    });

    this.audio.play().catch(() => {});
  }

  appendChunk(data: ArrayBuffer) {
    if (this.destroyed) return;
    this.queue.push(data);
    this.flush();
  }

  private flush() {
    if (!this.sourceBuffer || this.sourceBuffer.updating || this.queue.length === 0) {
      return;
    }
    const chunk = this.queue.shift()!;
    try {
      this.sourceBuffer.appendBuffer(chunk);
    } catch {
      this.queue.unshift(chunk);
    }

    // Trim old buffered data to prevent memory buildup
    try {
      if (this.sourceBuffer.buffered.length > 0) {
        const end = this.sourceBuffer.buffered.end(
          this.sourceBuffer.buffered.length - 1
        );
        if (end > 10) this.sourceBuffer.remove(0, end - 5);
      }
    } catch {
      // Ignore trim errors
    }
  }

  destroy() {
    this.destroyed = true;
    this.audio.pause();
    this.audio.src = "";
    if (this.mediaSource.readyState === "open") {
      try {
        this.mediaSource.endOfStream();
      } catch {
        // Ignore
      }
    }
    this.queue = [];
  }
}
