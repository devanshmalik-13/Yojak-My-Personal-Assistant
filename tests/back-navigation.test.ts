import { describe, expect, it, vi } from 'vitest'
import { handleBackNavigation, registerBackHandler } from '../src/services/backNavigation'

describe('Android back navigation', () => {
  it('uses the most recently opened screen first', () => {
    const root = vi.fn(() => true)
    const latest = vi.fn(() => true)
    const removeRoot = registerBackHandler(root)
    const removeLatest = registerBackHandler(latest)

    expect(handleBackNavigation()).toBe(true)
    expect(latest).toHaveBeenCalledOnce()
    expect(root).not.toHaveBeenCalled()

    removeLatest()
    removeRoot()
  })

  it('falls through handlers when none consumes the event', () => {
    const root = vi.fn(() => false)
    const overlay = vi.fn(() => false)
    const removeRoot = registerBackHandler(root)
    const removeOverlay = registerBackHandler(overlay)

    expect(handleBackNavigation()).toBe(false)
    expect(overlay).toHaveBeenCalledOnce()
    expect(root).toHaveBeenCalledOnce()

    removeOverlay()
    removeRoot()
  })
})
