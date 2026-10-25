// Haptic ticks where supported (Android Chrome). Silently does nothing elsewhere.
let enabled = true

export function setHapticsEnabled(on: boolean) {
  enabled = on
}

function vibrate(pattern: number | number[]) {
  if (enabled && typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern)
}

export const haptic = {
  tick: () => vibrate(8),
  combo: () => vibrate([10, 40, 18]),
  wrong: () => vibrate(25),
  big: () => vibrate([20, 60, 20, 60, 40]),
}
