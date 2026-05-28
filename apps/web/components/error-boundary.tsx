// apps/web/components/error-boundary.tsx
// React error boundary — catches thrown errors anywhere in the tree and shows a fallback UI.
'use client';

import React from 'react';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message ?? 'An unexpected error occurred' };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log to console in dev; replace with a real error reporting service (Sentry, etc.) in prod
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10 border border-red-500/20">
            <span className="text-2xl">⚠</span>
          </div>
          <h2 className="text-lg font-semibold text-zinc-100 mb-2">Something went wrong</h2>
          <p className="text-sm text-zinc-400 max-w-sm mb-6">{this.state.message}</p>
          <button
            onClick={() => {
              this.setState({ hasError: false, message: '' });
              window.location.reload();
            }}
            className="rounded-xl bg-violet-600 hover:bg-violet-500 px-5 py-2 text-sm font-medium text-white transition-colors"
          >
            Reload page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
