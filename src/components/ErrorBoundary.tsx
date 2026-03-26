import { Component, type ReactNode } from "react";
import { Box, Text, Button, Stack } from "@mantine/core";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary] Caught error:", error, info);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <Box
          style={{
            minHeight: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--bg-card)",
            borderRadius: 16,
            border: "1px solid var(--border-light)",
            padding: 32,
          }}
        >
          <Stack align="center" gap={16}>
            <Text style={{ fontSize: 16, fontWeight: 700, color: "var(--accent-error)" }}>
              Something went wrong
            </Text>
            <Text style={{ fontSize: 13, color: "var(--text-secondary)", textAlign: "center", maxWidth: 400 }}>
              {this.state.error?.message ?? "An unexpected error occurred."}
            </Text>
            <Button
              size="sm"
              variant="outline"
              color="gray"
              onClick={this.handleReset}
            >
              Try again
            </Button>
          </Stack>
        </Box>
      );
    }

    return this.props.children;
  }
}
