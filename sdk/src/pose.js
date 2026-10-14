// Pose detection runs fully in the browser with MediaPipe Tasks Vision (WASM + WebGL/GPU, CPU fallback).
// Only the library and model files are downloaded; no camera data is ever sent anywhere.
// Self-hosting: copy these files to your own server and pass `assets` to VirtualTryOn.init().
const VERSION = '0.10.14';
export const DEFAULT_ASSETS = {
  bundle: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/vision_bundle.mjs`,
  wasm: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm`,
  model: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
};

export class PoseTracker {
  constructor(assets) { this.assets = { ...DEFAULT_ASSETS, ...(assets || {}) }; this.landmarker = null; this.delegate = null; this.lastTs = 0; }

  async load() {
    if (this.landmarker) return;
    const vision = await import(this.assets.bundle);
    const files = await vision.FilesetResolver.forVisionTasks(this.assets.wasm);
    const create = (delegate) => vision.PoseLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: this.assets.model, delegate },
      runningMode: 'VIDEO', numPoses: 1,
      minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
    });
    try { this.landmarker = await create('GPU'); this.delegate = 'GPU'; }
    catch { this.landmarker = await create('CPU'); this.delegate = 'CPU'; }
  }

  /** @returns normalized landmarks array (33) or null */
  detect(video) {
    let ts = performance.now();
    if (ts <= this.lastTs) ts = this.lastTs + 1;
    this.lastTs = ts;
    const res = this.landmarker.detectForVideo(video, ts);
    return res && res.landmarks && res.landmarks[0] ? res.landmarks[0] : null;
  }

  close() { try { this.landmarker && this.landmarker.close(); } catch { /* ignore */ } this.landmarker = null; }
}
