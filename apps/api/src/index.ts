import * as path from "path";
import { fileURLToPath } from "url";
import * as _dotenv from "dotenv";

// Load env first, before any other imports
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.resolve(__dirname, "../../..");
_dotenv.config({ path: path.join(monorepoRoot, ".env.local") });

const start = async () => {
  try {
    const { start: startServer } = await import("./server.js");
    await startServer();
    console.log("✅ ORGOS API ready on http://localhost:4000");
  } catch (error) {
    console.error("Failed to start API:", error);
    process.exit(1);
  }
};

start();

