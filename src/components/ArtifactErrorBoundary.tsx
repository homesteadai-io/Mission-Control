import { Component, type ReactNode } from "react";

interface ArtifactErrorBoundaryProps {
  children: ReactNode;
  resetKey: string;
}

interface ArtifactErrorBoundaryState {
  error: Error | null;
}

export class ArtifactErrorBoundary extends Component<ArtifactErrorBoundaryProps, ArtifactErrorBoundaryState> {
  state: ArtifactErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ArtifactErrorBoundaryState {
    return { error };
  }

  componentDidUpdate(previousProps: ArtifactErrorBoundaryProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <article className="artifact-panel">
          <div className="artifact-body">
            <div className="artifact-parse-failure">
              <strong>Artifact render failed.</strong>
              <p>{this.state.error.message}</p>
            </div>
          </div>
        </article>
      );
    }

    return this.props.children;
  }
}
