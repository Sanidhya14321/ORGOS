import * as path from "path";
import * as _dotenv from "dotenv";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
console.log("Current dir:", __dirname);
console.log("Looking for .env.local at:", path.resolve(__dirname, ".env.local"));

const result = _dotenv.config({ path: path.resolve(__dirname, ".env.local") });
console.log("Result:", result);
console.log("SUPABASE_URL=", process.env.SUPABASE_URL);
