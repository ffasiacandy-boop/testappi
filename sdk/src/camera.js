export class Camera {
  constructor(video) { this.video = video; this.stream = null; this.facing = 'user'; this.mirrored = true; }

  static supported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && window.isSecureContext;
  }

  async start(facing = this.facing) {
    this.stop();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: facing }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, max: 30 } },
    });
    this.stream = stream;
    this.facing = facing;
    const v = this.video;
    v.srcObject = stream; v.muted = true; v.playsInline = true;
    v.setAttribute('playsinline', '');
    await v.play();
    const settings = stream.getVideoTracks()[0].getSettings ? stream.getVideoTracks()[0].getSettings() : {};
    this.mirrored = settings.facingMode ? settings.facingMode === 'user' : facing === 'user';
  }

  stop() {
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
  }

  async hasMultiple() {
    try {
      const d = await navigator.mediaDevices.enumerateDevices();
      return d.filter((x) => x.kind === 'videoinput').length > 1;
    } catch { return false; }
  }
}
