import { Component, type ReactNode } from 'react'
import { Button, Card } from './ui'

/**
 * Catches a page that failed to render or to load (a lazy chunk that isn't cached yet, offline) and offers a way
 * out instead of a blank screen. Give it a `key` that changes with the route so navigating away clears it.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error(error)
  }

  render() {
    if (!this.state.failed) return this.props.children
    const offline = typeof navigator !== 'undefined' && !navigator.onLine
    return (
      <Card className="mx-auto max-w-md space-y-3 text-center">
        <h1 className="font-serif text-2xl">This page didn't load</h1>
        <p className="text-ink-soft">
          {offline
            ? "You're offline, and this part of the app hasn't been saved to your device yet. Your progress is safe."
            : 'Something went wrong on this page. Your progress is safe.'}
        </p>
        <div className="flex justify-center gap-2">
          <Button onClick={() => location.reload()}>Reload</Button>
          <a href="#/">
            <Button variant="secondary">Home</Button>
          </a>
        </div>
      </Card>
    )
  }
}
