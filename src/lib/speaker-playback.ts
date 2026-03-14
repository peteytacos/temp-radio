import { AUDIO_MIME_TYPE } from "./audio-config";

export class SpeakerPlayback {
  audio: HTMLAudioElement;
  analyser: AnalyserNode;
  private mediaSource: MediaSource;
  private sourceBuffer: SourceBuffer | null = null;
  private queue: ArrayBuffer[] = [];
  private destroyed = false;
  private finishing = false;
  private onDrained: (() => void) | null = null;

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

  /** Signal that no more chunks will arrive. Returns a promise that resolves
   *  once all buffered audio has finished playing. */
  finish(): Promise<void> {
    if (this.destroyed) return Promise.resolve();
    this.finishing = true;

    return new Promise<void>((resolve) => {
      const safetyTimeout = setTimeout(() => resolve(), 5000);

      const done = () => {
        clearTimeout(safetyTimeout);
        resolve();
      };

      // If queue is already empty and buffer isn't updating, seal now
      if (this.queue.length === 0 && this.sourceBuffer && !this.sourceBuffer.updating) {
        this.seal(done);
      } else {
        // Wait for flush to drain the queue, then seal
        this.onDrained = () => this.seal(done);
      }
    });
  }

  /** Call endOfStream and wait for the audio element to finish playing */
  private seal(done: () => void) {
    if (this.mediaSource.readyState === "open") {
      try {
        this.mediaSource.endOfStream();
      } catch {
        // Ignore
      }
    }

    // If audio has remaining buffered content, wait for it to finish
    const remaining = this.bufferedRemaining();
    if (remaining > 0.05) {
      this.audio.addEventListener("ended", done, { once: true });
      // Fallback in case 'ended' never fires
      setTimeout(done, remaining * 1000 + 500);
    } else {
      done();
    }
  }

  private bufferedRemaining(): number {
    try {
      if (this.audio.buffered.length > 0) {
        const end = this.audio.buffered.end(this.audio.buffered.length - 1);
        return Math.max(0, end - this.audio.currentTime);
      }
    } catch {
      // Ignore
    }
    return 0;
  }

  private flush() {
    if (!this.sourceBuffer || this.sourceBuffer.updating || this.queue.length === 0) {
      // If finishing and queue is drained and not updating, notify
      if (this.finishing && this.queue.length === 0 && this.onDrained &&
          this.sourceBuffer && !this.sourceBuffer.updating) {
        const cb = this.onDrained;
        this.onDrained = null;
        cb();
      }
      return;
    }
    const chunk = this.queue.shift()!;
    try {
      this.sourceBuffer.appendBuffer(chunk);
    } catch {
      this.queue.unshift(chunk);
    }

    // Trim old buffered data (skip during finishing to avoid removing unplayed audio)
    if (!this.finishing) {
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
