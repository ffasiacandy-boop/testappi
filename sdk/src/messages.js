export const MSG = {
  unavailable: 'Virtual Try-On is currently unavailable.',
  expired: 'Virtual Try-On access has expired.\nPlease contact the store.',
  domain: 'Virtual Try-On is not configured for this website.',
  permission: 'Camera access is required for Virtual Try-On.\nPlease allow camera permission and try again.',
  intro: 'Allow camera access to try this product.',
  stand: 'Stand in front of the camera.',
  ready: "Perfect! You're ready.",
  move: 'Please move into the frame.',
  loading: 'Preparing Virtual Try-On...',
  privacy: 'Your camera video is processed locally on your device and is not uploaded.',
  noCamera: 'No camera was found on this device.',
  cameraBusy: 'Your camera is in use by another app. Close it and try again.',
  unsupportedBrowser: 'This browser does not support Virtual Try-On. Please use a recent Chrome, Edge, Safari or Firefox over HTTPS.',
  modelFail: 'Could not load the try-on engine. Check your connection and try again.',
  imageFail: 'Could not load the product image.',
  unsupportedCategory: 'Virtual Try-On is not available for this product yet.',
  noProduct: 'Virtual Try-On could not find this product\'s image on the page.',
  captureFail: 'Screenshot is not available for this product image.',
};
export function messageForCode(code) {
  if (code === 'LICENSE_EXPIRED') return MSG.expired;
  if (code === 'DOMAIN_NOT_ALLOWED') return MSG.domain;
  return MSG.unavailable;
}
