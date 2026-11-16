import { Component, type ReactNode } from "react";
import { storage_prefix } from "../logic/state";

function savedKeys() {
  try {
    return Object.keys(localStorage).filter((k) => k.startsWith(storage_prefix));
  } catch {
    return [];
  }
}

function downloadBackup() {
  const data = Object.fromEntries(savedKeys().map((k) => [k, localStorage.getItem(k)]));
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "balancer-backup.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function CrashScreen({ error }: { error: unknown }) {
  return (
    <div className="grid min-h-screen place-items-center bg-ink-950 p-6">
      <div className="panel w-full max-w-lg p-6" style={{ "--accent": "#ff5168" } as React.CSSProperties}>
        <h1 className="title-skew text-[28px]">Something broke</h1>
        <p className="mt-3 text-[15px] text-muted">The app hit an error it could not recover from. Your players are still saved in this browser. Download a backup before resetting anything.</p>
        <pre className="mt-3 max-h-32 overflow-auto bg-ink-900 p-3 text-[12px] text-danger">{String((error as Error)?.message ?? error)}</pre>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn btn-primary" onClick={() => location.reload()}>
            Reload
          </button>
          <button className="btn" onClick={downloadBackup}>
            Download backup
          </button>
          <button
            className="btn btn-ghost hover:!text-danger"
            onClick={() => {
              if (window.confirm("Delete all saved players and settings in this browser?")) {
                for (const k of savedKeys()) localStorage.removeItem(k);
                location.reload();
              }
            }}
          >
            Reset saved data
          </button>
        </div>
      </div>
    </div>
  );
}

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  render() {
    return this.state.error ? <CrashScreen error={this.state.error} /> : this.props.children;
  }
}
