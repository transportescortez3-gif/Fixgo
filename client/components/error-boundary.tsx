import { Component, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

function isChunkError(error: Error): boolean {
  return (
    error.message.includes("Failed to fetch dynamically imported module") ||
    error.message.includes("ChunkLoadError") ||
    error.name === "ChunkLoadError"
  );
}

const MAX_CHUNK_RELOAD_ATTEMPTS = 2;

function getChunkReloadCount(): number {
  try {
    return parseInt(sessionStorage.getItem("chunk_reload_count") ?? "0", 10);
  } catch { return 0; }
}

function incrementChunkReloadCount(): void {
  try {
    sessionStorage.setItem("chunk_reload_count", String(getChunkReloadCount() + 1));
  } catch {}
}

function reportError(error: Error) {
  try {
    fetch("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        url: window.location.href,
        userAgent: navigator.userAgent,
      }),
    });
  } catch {}
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  componentDidMount() {
    try { sessionStorage.removeItem("chunk_reload_count"); } catch {}
  }

  static getDerivedStateFromError(error: Error): State {
    if (isChunkError(error)) {
      if (getChunkReloadCount() < MAX_CHUNK_RELOAD_ATTEMPTS) {
        incrementChunkReloadCount();
        window.location.reload();
        return { hasError: false, error: null };
      }
    }
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: any) {
    if (isChunkError(error) && getChunkReloadCount() < MAX_CHUNK_RELOAD_ATTEMPTS) {
      return;
    }
    reportError(error);
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="min-h-screen flex items-center justify-center px-4 bg-background">
          <div className="text-center space-y-4 max-w-md">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-destructive" />
              </div>
            </div>
            <div className="text-4xl font-black tracking-tighter text-primary">FIXGO</div>
            <h2 className="text-xl font-bold text-foreground">Algo salió mal</h2>
            <p className="text-sm text-muted-foreground">
              Ocurrió un error inesperado. Por favor recarga la página.
            </p>
            {this.state.error && (
              <p className="text-xs text-muted-foreground font-mono bg-muted px-3 py-2 rounded-lg">
                {this.state.error.message}
              </p>
            )}
            <Button
              onClick={() => window.location.reload()}
              className="gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Recargar página
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
