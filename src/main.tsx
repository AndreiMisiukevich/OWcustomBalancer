import "@fontsource/saira-condensed/700.css";
import "@fontsource/saira-condensed/800.css";
import "@fontsource/barlow/400.css";
import "@fontsource/barlow/500.css";
import "@fontsource/barlow/600.css";
import "./styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { storage_errors } from "./logic/importExport";
import { App } from "./ui/App";
import { initController } from "./ui/controller";
import { CrashScreen, ErrorBoundary } from "./ui/ErrorBoundary";
import { toast } from "./ui/store";

const root = createRoot(document.getElementById("root")!);

try {
  initController();
  root.render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
  if (storage_errors.length) {
    toast(`Some saved data could not be read and was reset: ${storage_errors.join(", ")}`, "warn", 8000);
  }
} catch (error) {
  root.render(<CrashScreen error={error} />);
}
