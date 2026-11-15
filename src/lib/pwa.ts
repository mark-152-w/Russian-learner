// Service-worker events, held until the UI asks: an update found before React mounts must not be lost.
type Listener = () => void
let applyUpdate: (() => void) | null = null
let offlineReady = false
const listeners = new Set<Listener>()
const emit = () => listeners.forEach((l) => l())

export function setUpdateReady(apply: () => void) {
  applyUpdate = apply
  emit()
}
export function setOfflineReady() {
  offlineReady = true
  emit()
}
/** The pending update (call it to reload into the new version), if any. */
export const pendingUpdate = () => applyUpdate
/** True once, the first time it's asked after the app became ready offline (so the notice shows once). */
let offlineAnnounced = false
export function takeOfflineReady(): boolean {
  if (!offlineReady || offlineAnnounced) return false
  offlineAnnounced = true
  return true
}
export function subscribe(l: Listener): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

/**
 * Ask the browser not to evict our storage (all progress lives in IndexedDB; Safari clears sites unused for a
 * week). Asked once a visit, after a finished session: by then there is something worth keeping.
 */
let persistAsked = false
export function requestPersistence(): void {
  if (persistAsked || typeof navigator === 'undefined' || !navigator.storage?.persist) return
  persistAsked = true
  void navigator.storage.persist().catch(() => {})
}
