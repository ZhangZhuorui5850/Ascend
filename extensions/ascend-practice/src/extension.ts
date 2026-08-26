import type { ExtensionContext } from "vscode";

/* eslint-disable @typescript-eslint/no-require-imports */

type ExtensionRuntime = {
  activate(context: ExtensionContext): Promise<void>;
  deactivate(): void;
};

const runtime = require("../extension.js") as ExtensionRuntime;

export const activate = runtime.activate;
export const deactivate = runtime.deactivate;
