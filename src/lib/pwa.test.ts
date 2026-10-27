import { describe, expect, it, vi } from 'vitest'
import { pendingUpdate, setOfflineReady, setUpdateReady, subscribe, takeOfflineReady } from './pwa'

describe('pwa events', () => {
  it('holds an update found before anyone listens, and announces offline-ready once', () => {
    const apply = vi.fn()
    setUpdateReady(apply)
    expect(pendingUpdate()).toBe(apply)
    const l = vi.fn()
    const off = subscribe(l)
    expect(takeOfflineReady()).toBe(false)
    setOfflineReady()
    expect(l).toHaveBeenCalledTimes(1)
    expect(takeOfflineReady()).toBe(true)
    expect(takeOfflineReady()).toBe(false) // a second ask (a re-render) mustn't show it again
    off()
    setOfflineReady()
    expect(l).toHaveBeenCalledTimes(1)
  })
})
