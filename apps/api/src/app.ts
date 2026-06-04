import type { HealthResponse } from "@alex-0d18-test-18/shared";
import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import helmet from "helmet";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_request, response) => {
    const body: HealthResponse = {
      ok: true,
      service: "api",
    };

    response.json(body);
  });

  app.use((_request, response) => {
    response.status(404).json({
      error: {
        code: "not_found",
        message: "Route not found",
      },
    });
  });

  const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
    const message = error instanceof Error ? error.message : "Unexpected server error";

    response.status(500).json({
      error: {
        code: "internal_server_error",
        message,
      },
    });
  };

  app.use(errorHandler);

  return app;
}
