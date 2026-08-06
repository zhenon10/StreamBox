import { Component, type ErrorInfo, type ReactNode } from 'react';
import { services, TOKENS } from '@/application/di/container';

interface ErrorBoundaryProps {
  readonly children: ReactNode;
  readonly fallback: (error: Error, recover: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  readonly error: Error | null;
}

/** React error boundary integrated with CrashManager. */
export class AppErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const crashManager = services.resolve(TOKENS.crashManager);
    crashManager.reportReactError(error);
    const logger = services.resolve(TOKENS.logger);
    logger.error('React render error', error, 'ErrorBoundary', {
      componentStack: info.componentStack,
    });
  }

  handleRecover = (): void => {
    void services.resolve(TOKENS.crashManager).recover();
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (this.state.error) {
      return this.props.fallback(this.state.error, this.handleRecover);
    }
    return this.props.children;
  }
}
