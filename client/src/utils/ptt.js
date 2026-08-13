/**
 * 实时对讲(PTT)客户端
 * - H5:MediaRecorder 采集 webm/opus 帧 -> WebSocket 中继 -> MediaSource 实时播放(双向)
 * - 微信小程序:RecorderManager onFrameRecorded 采集 PCM 帧实时上行,
 *   接收端因小程序无 PCM 播放 API,仅显示"对讲中"指示;对讲结束后发送方会归档为语音消息
 */

import { getWsBase } from './ws-url'

const WS_BASE = getWsBase();

function base64ToUint8(base64) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export class PttClient {
  /**
   * @param {Object} opts
   * @param {string} opts.sessionId
   * @param {(state: 'remote_start'|'remote_end'|'error', senderId?: number) => void} opts.onEvent
   */
  constructor({ sessionId, onEvent }) {
    this.sessionId = sessionId;
    this.onEvent = onEvent || (() => {});
    this.socketTask = null;
    this.seq = 0;
    this.speaking = false;
    this.mediaRecorder = null;
    this.mediaStream = null;
    this.mpRecorder = null;
    this.h5Playback = typeof MediaSource !== 'undefined' && typeof MediaRecorder !== 'undefined';
    this.audioEl = null;
    this.mediaSource = null;
    this.sourceBuffer = null;
    this.remoteSpeaking = false;
    this.remoteBuffer = 0;
  }

  connect() {
    const token = uni.getStorageSync('token');
    if (!token || !this.sessionId) return;
    try {
      this.socketTask = uni.connectSocket({
        url: WS_BASE + '?token=' + encodeURIComponent(token),
        complete: () => {}
      });
    } catch (e) {
      console.warn('[PTT] connect failed:', e);
      return;
    }
    this.socketTask.onMessage((res) => this.handleMessage(res));
    this.socketTask.onClose(() => { this.socketTask = null; });
  }

  handleMessage(res) {
    if (!res || !res.data) return;
    let msg;
    try {
      msg = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    } catch (e) { return; }
    if (!msg || !msg.session_id || String(msg.session_id) !== String(this.sessionId)) return;

    if (msg.type === 'ptt_start') {
      this.remoteSpeaking = true;
      this.remoteBuffer = 0;
      this.onEvent('remote_start', msg.sender_id);
    } else if (msg.type === 'ptt_audio') {
      this.remoteBuffer++;
      if (this.h5Playback && msg.payload) {
        this.appendChunk(msg.payload);
      }
    } else if (msg.type === 'ptt_end') {
      this.remoteSpeaking = false;
      this.onEvent('remote_end', msg.sender_id);
    }
  }

  /** 开始说话(按下) */
  async start() {
    if (!this.sessionId) return;
    this.seq = 0;
    this.send({ type: 'ptt_start' });
    // #ifdef H5
    if (this.h5Playback) {
      try {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
        this.mediaRecorder = new MediaRecorder(this.mediaStream, mime ? { mimeType: mime } : undefined);
        this.mediaRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            const reader = new FileReader();
            reader.onload = () => {
              const base64 = String(reader.result || '').split(',')[1] || '';
              this.send({ type: 'ptt_audio', seq: this.seq++, payload: base64 });
            };
            reader.readAsDataURL(e.data);
          }
        };
        this.mediaRecorder.start(300);
      } catch (err) {
        console.warn('[PTT] H5 capture failed:', err);
        this.onEvent('error');
      }
      return;
    }
    // #endif
    // #ifndef H5
    // 小程序:录音 + 帧级实时上行
    if (!this.mpRecorder) {
      this.mpRecorder = uni.getRecorderManager();
      this.mpRecorder.onFrameRecorded(({ frameBuffer }) => {
        try {
          // #ifdef MP-WEIXIN
          const base64 = uni.arrayBufferToBase64(frameBuffer);
          this.send({ type: 'ptt_audio', seq: this.seq++, payload: base64 });
          // #endif
        } catch (e) { /* ignore */ }
      });
    }
    this.mpRecorder.start({
      duration: 60000,
      sampleRate: 16000,
      numberOfChannels: 1,
      encodeBitRate: 48000,
      format: 'PCM',
      frameSize: 1
    });
    // #endif
  }

  /** 结束说话(松开) */
  stop() {
    // #ifdef H5
    if (this.mediaRecorder) {
      try { this.mediaRecorder.stop(); } catch (e) { /* ignore */ }
      this.mediaRecorder = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
    // #endif
    // #ifndef H5
    if (this.mpRecorder) {
      try { this.mpRecorder.stop(); } catch (e) { /* ignore */ }
    }
    // #endif
    this.send({ type: 'ptt_end' });
  }

  send(data) {
    if (!this.socketTask) return;
    try {
      this.socketTask.send({ data: JSON.stringify({ ...data, session_id: this.sessionId }) });
    } catch (e) { /* ignore */ }
  }

  /** H5:MediaSource 实时播放 */
  appendChunk(base64) {
    try {
      if (!this.audioEl) {
        this.audioEl = document.createElement('audio');
        this.audioEl.autoplay = true;
        this.mediaSource = new MediaSource();
        this.audioEl.src = URL.createObjectURL(this.mediaSource);
        document.body.appendChild(this.audioEl);
        this.mediaSource.addEventListener('sourceopen', () => {
          try {
            this.sourceBuffer = this.mediaSource.addSourceBuffer('audio/webm;codecs=opus');
          } catch (e) {
            this.sourceBuffer = null;
          }
        });
      }
      if (this.sourceBuffer && this.mediaSource && this.mediaSource.readyState === 'open') {
        this.sourceBuffer.appendBuffer(base64ToUint8(base64));
      }
    } catch (e) {
      console.warn('[PTT] playback append failed:', e);
    }
  }

  close() {
    this.send({ type: 'ptt_end' });
    if (this.socketTask) {
      try { this.socketTask.close({}); } catch (e) { /* ignore */ }
      this.socketTask = null;
    }
    // #ifdef H5
    if (this.audioEl && this.audioEl.parentNode) {
      this.audioEl.parentNode.removeChild(this.audioEl);
    }
    if (this.mediaSource && this.mediaSource.readyState === 'open') {
      try { this.mediaSource.endOfStream(); } catch (e) { /* ignore */ }
    }
    // #endif
  }
}
