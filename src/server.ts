import https from "https";
import path from "path";
import express from "express";
import { HOST, PORT } from "./shared/constants";
import { createApp } from "./sidecar/app";

async function main(): Promise<void> {
  const app = createApp();
  app.get("/", (_req, res) => {
    res.redirect("/taskpane.html");
  });

  const webpack = require("webpack") as typeof import("webpack");
  const webpackDevMiddleware = require("webpack-dev-middleware") as (
    compiler: import("webpack").Compiler,
    opts: { publicPath: string; headers: Record<string, string> }
  ) => express.RequestHandler;
  const webpackConfig = require("../webpack.config.js") as (
    env: object,
    argv: { mode: string }
  ) => import("webpack").Configuration;
  const compiler = webpack(webpackConfig({}, { mode: "development" }));
  const middleware = webpackDevMiddleware(compiler, {
    publicPath: "/",
    headers: { "Cache-Control": "no-store" },
  });
  app.use((req, res, next) => {
    if (req.path.startsWith("/api/")) {
      next();
      return;
    }
    middleware(req, res, next);
  });

  const { getHttpsServerOptions } = require("office-addin-dev-certs") as {
    getHttpsServerOptions: () => Promise<{ ca: Buffer; key: Buffer; cert: Buffer }>;
  };
  const httpsOptions = await getHttpsServerOptions();
  const server = https.createServer(httpsOptions, app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(PORT, HOST, () => {
      console.log(`listening https://${HOST}:${PORT} static ${path.resolve("src/taskpane")}`);
      resolve();
    });
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
