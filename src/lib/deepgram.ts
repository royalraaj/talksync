// Deepgram real-time streaming client
// Connects via WebSocket for sub-300ms latency transcription with speaker diarization

export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
  speaker: number;
  punctuated_word: string;
}

export interface TranscriptAlternative {
  transcript: string;
  confidence: number;
  words: TranscriptWord[];
}

export interface TranscriptResult {
  is_final: boolean;
  speech_final: boolean;
  channel: {
    alternatives: TranscriptAlternative[];
  };
}

export interface DeepgramMessage {
  type: string;
  channel_index?: number[];
  duration?: number;
  start?: number;
  is_final?: boolean;
  speech_final?: boolean;
  channel?: {
    alternatives: TranscriptAlternative[];
  };
}

type TranscriptCallback = (result: TranscriptResult, isFinal: boolean) => void;
type ErrorCallback = (error: string) => void;
type StatusCallback = (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void;

export class DeepgramClient {
  private ws: WebSocket | null = null;
  private apiKey: string;
  private onTranscript: TranscriptCallback;
  private onError: ErrorCallback;
  private onStatus: StatusCallback;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private retryCount = 0;
  private maxRetries = 5;

  constructor(
    apiKey: string,
    onTranscript: TranscriptCallback,
    onError: ErrorCallback,
    onStatus: StatusCallback
  ) {
    this.apiKey = apiKey;
    this.onTranscript = onTranscript;
    this.onError = onError;
    this.onStatus = onStatus;
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    this.onStatus('connecting');

    // Deepgram streaming endpoint with optimized params for low latency
    const params = new URLSearchParams({
      model: 'nova-2',           // Fastest, most accurate model
      language: 'en',
      punctuate: 'true',
      diarize: 'true',           // Speaker diarization (P0 requirement)
      interim_results: 'true',   // Get partial results for faster display
      utterance_end_ms: '1800',  // Detect end of utterance after 1.8s silence (interviewers pause more)
      endpointing: '400',        // Prevents premature finalization of mid-phrase pauses
      vad_events: 'true',        // Voice activity detection
      smart_format: 'true',      // Better formatting
      filler_words: 'true',      // Capture "um", "so" — signals interviewer is still talking
      encoding: 'linear16',
      sample_rate: '16000',
      channels: '1',
    });

    const url = `wss://api.deepgram.com/v1/listen?${params.toString()}`;

    this.ws = new WebSocket(url, ['token', this.apiKey]);

    this.ws.onopen = () => {
      // console.log('[Deepgram] Connected');
      this.onStatus('connected');
      this.retryCount = 0; // Reset retries on successful connection
    };

    this.ws.onmessage = (event) => {
      try {
        const data: DeepgramMessage = JSON.parse(event.data);

        if (data.type === 'Results' && data.channel) {
          const result: TranscriptResult = {
            is_final: data.is_final ?? false,
            speech_final: data.speech_final ?? false,
            channel: data.channel,
          };
          this.onTranscript(result, result.is_final);
        }
      } catch (err) {
        console.error('[Deepgram] Parse error:', err);
      }
    };

    this.ws.onerror = (event) => {
      console.error('[Deepgram] WebSocket error:', event);
      // Don't trigger error cb yet, try to reconnect first
    };

    this.ws.onclose = (event) => {
      // console.log('[Deepgram] Disconnected:', event.code, event.reason);
      this.onStatus('disconnected');

      // Auto-reconnect if not closed normally (1000) and retries left
      if (event.code !== 1000 && this.retryCount < this.maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, this.retryCount), 10000); // Exponential backoff max 10s
        console.log(`[Deepgram] Reconnecting in ${delay}ms... (Attempt ${this.retryCount + 1}/${this.maxRetries})`);

        this.reconnectTimer = setTimeout(() => {
          this.retryCount++;
          this.connect();
        }, delay);
      } else if (this.retryCount >= this.maxRetries) {
        this.onError('Connection lost. Please restart listening.');
        this.onStatus('error');
      }
    };
  }

  // Send raw PCM audio data (already base64 decoded to ArrayBuffer)
  sendAudio(audioData: ArrayBuffer) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(audioData);
    }
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.retryCount = 0;
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    this.onStatus('disconnected');
  }
}
