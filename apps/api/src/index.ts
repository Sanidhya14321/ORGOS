import { buildServer } from "./server.js";

const start = async () => {
  try {
    const fastify = await buildServer();
    await fastify.listen({ port: 4000, host: "0.0.0.0" });
    console.log("✅ ORGOS API ready on http://localhost:4000");
  } catch (error) {
    console.error("Failed to start API:", error);
    process.exit(1);
  }
};

start();

