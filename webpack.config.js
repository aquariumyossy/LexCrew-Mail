const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");

module.exports = () => ({
  mode: "development",
  devtool: "source-map",
  entry: {
    taskpane: "./src/taskpane/index.ts",
    commands: "./src/commands/commands.ts",
  },
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "[name].js",
    clean: true,
  },
  resolve: { extensions: [".ts", ".js"] },
  module: {
    rules: [{ test: /\.ts$/, exclude: /node_modules/, use: "ts-loader" }],
  },
  plugins: [
    new HtmlWebpackPlugin({
      filename: "taskpane.html",
      template: "./src/taskpane/taskpane.html",
      chunks: ["taskpane"],
    }),
    new HtmlWebpackPlugin({
      filename: "commands.html",
      template: "./src/commands/commands.html",
      chunks: ["commands"],
    }),
    new CopyWebpackPlugin({
      patterns: [
        { from: "assets", to: "assets", noErrorOnMissing: true },
        {
          from: "node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs",
          to: "assets/pdf.worker.js",
        },
        {
          context: "node_modules/pdfjs-dist",
          from: "{cmaps,standard_fonts,wasm,iccs}/**/*",
          to: "assets/pdf/[path][name][ext]",
        },
      ],
    }),
  ],
});
