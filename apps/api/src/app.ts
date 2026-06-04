import type { HealthResponse } from "@alex-0d18-test-18/shared";
import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import helmet from "helmet";
import path from "node:path";
import type { Pool } from "pg";
import { createDownloadsRouter } from "./downloads/routes.js";
import { HttpError } from "./errors/http-error.js";
import { createImagesRouter } from "./images/routes.js";
import type { ObjectStorageClient } from "./storage/client.js";

export interface AppDependencies {
  database?: Pool;
  staticAssetsPath?: string;
  storage?: ObjectStorageClient;
}

function imageSourceDirectives(storage: ObjectStorageClient | undefined): string[] {
  const directives = ["'self'", "data:"];

  if (storage === undefined) {
    return directives;
  }

  try {
    directives.push(new URL(storage.config.publicBaseUrl).origin);
  } catch {
    directives.push(storage.config.publicBaseUrl);
  }

  return directives;
}

function toErrorLogDetails(error: unknown) {
  if (error instanceof Error) {
    const metadata = (error as Error & { $metadata?: { httpStatusCode?: unknown } }).$metadata;
    const code = (error as Error & { code?: unknown }).code;

    return {
      name: error.name,
      code,
      message: error.message,
      httpStatus: metadata?.httpStatusCode,
      stack: error.stack?.split("\n").slice(0, 5).join("\n"),
    };
  }

  return {
    message: String(error),
  };
}

export function createApp(dependencies: AppDependencies = {}) {
  const app = express();

  if (dependencies.database !== undefined) {
    app.locals.database = dependencies.database;
  }

  if (dependencies.storage !== undefined) {
    app.locals.storage = dependencies.storage;
  }

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          "img-src": imageSourceDirectives(dependencies.storage),
        },
      },
    }),
  );
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_request, response) => {
    const body: HealthResponse = {
      ok: true,
      service: "api",
    };

    response.json(body);
  });

  if (dependencies.database !== undefined && dependencies.storage !== undefined) {
    app.use(
      "/api/downloads",
      createDownloadsRouter({
        database: dependencies.database,
        storage: dependencies.storage,
      }),
    );
    app.use(
      "/api/images",
      createImagesRouter({
        database: dependencies.database,
        storage: dependencies.storage,
      }),
    );
  }

  app.use("/api", (_request, response) => {
    response.status(404).json({
      error: {
        code: "not_found",
        message: "API route not found",
      },
    });
  });

  const staticAssetsPath = dependencies.staticAssetsPath;

  if (staticAssetsPath !== undefined) {
    app.use(express.static(staticAssetsPath, { index: false }));
    app.get("*", (_request, response, next) => {
      response.sendFile(path.join(staticAssetsPath, "index.html"), (error) => {
        if (error !== undefined) {
          next(error);
        }
      });
    });
  }

  app.use((_request, response) => {
    response.status(404).json({
      error: {
        code: "not_found",
        message: "Route not found",
      },
    });
  });

  const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
    if (error instanceof HttpError) {
      response.status(error.statusCode).json({
        error: {
          code: error.code,
          message: error.message,
        },
      });
      return;
    }

    const message = error instanceof Error ? error.message : "Unexpected server error";

    console.error("[api error]", toErrorLogDetails(error));

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
