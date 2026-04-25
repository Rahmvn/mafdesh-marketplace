import React from 'react';
import { RefreshCw } from 'lucide-react';

function getCurrentBuildId() {
  if (typeof document === 'undefined') {
    return 'server'
  }

  const moduleScript = document.querySelector('script[type="module"][src*="/assets/index-"]')
  return moduleScript?.getAttribute('src') || 'unknown-build'
}

function isDynamicImportFailure(error) {
  const message = String(error?.message || error || '').toLowerCase()

  return (
    message.includes('failed to fetch dynamically imported module') ||
    message.includes('error loading dynamically imported module') ||
    message.includes('importing a module script failed') ||
    message.includes('chunkloaderror') ||
    message.includes('loading chunk')
  )
}

function getReloadKey() {
  return `mafdesh:chunk-reload:${getCurrentBuildId()}`
}

export default class RouteChunkBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      hasError: false,
      isChunkError: false,
    }
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      isChunkError: isDynamicImportFailure(error),
    }
  }

  componentDidCatch(error) {
    if (typeof window === 'undefined' || !isDynamicImportFailure(error)) {
      return
    }

    const reloadKey = getReloadKey()
    const hasReloadedForThisBuild = window.sessionStorage.getItem(reloadKey) === 'true'

    if (!hasReloadedForThisBuild) {
      window.sessionStorage.setItem(reloadKey, 'true')
      window.location.reload()
    }
  }

  handleRefresh = () => {
    if (typeof window === 'undefined') {
      return
    }

    window.sessionStorage.removeItem(getReloadKey())
    window.location.reload()
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    if (this.state.isChunkError) {
      return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(251,146,60,0.16),_transparent_30%),linear-gradient(180deg,_#f8fbff_0%,_#ffffff_100%)] px-4 py-10 text-slate-900">
          <div className="mx-auto flex min-h-[70vh] max-w-md items-center justify-center">
            <div className="w-full rounded-[28px] border border-slate-200 bg-white/95 p-7 text-center shadow-sm backdrop-blur-sm">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-100 text-orange-600">
                <RefreshCw className="h-6 w-6 animate-spin" />
              </div>
              <h1 className="mt-5 text-xl font-bold text-blue-950">Refreshing your checkout</h1>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                The app was updated while this page was open. Refresh to load the latest payment flow.
              </p>
              <button
                type="button"
                onClick={this.handleRefresh}
                className="mt-5 inline-flex items-center gap-2 rounded-full bg-orange-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-700"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh Page
              </button>
            </div>
          </div>
        </div>
      )
    }

    return null
  }
}
