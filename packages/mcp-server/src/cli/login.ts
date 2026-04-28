#!/usr/bin/env node
import * as readline from "node:readline/promises";
import { stdin as defaultStdin, stdout as defaultStdout } from "node:process";
import { Writable } from "node:stream";
import { pathToFileURL } from "node:url";

import { BrightyApiError, BrightyClient, type FetchLike } from "../api/client.js";
import { maskApiKey, saveApiKey as defaultSaveApiKey } from "../auth.js";

export interface LoginDeps {
  prompt?: (question: string) => Promise<string>;
  fetch?: FetchLike;
  save?: (key: string) => Promise<void>;
  log?: (msg: string) => void;
  errorLog?: (msg: string) => void;
}

export type LoginErrorCode = "empty" | "invalid-key" | "network";

export interface LoginResult {
  ok: boolean;
  maskedKey?: string;
  errorCode?: LoginErrorCode;
}

async function defaultPrompt(question: string): Promise<string> {
  // Non-TTY (pipes, CI, tests) keep plain readline so input redirection works.
  if (!defaultStdin.isTTY) {
    const rl = readline.createInterface({
      input: defaultStdin,
      output: defaultStdout,
    });
    try {
      return await rl.question(question);
    } finally {
      rl.close();
    }
  }

  // TTY path: route readline output through a stream we can mute so the API
  // key is not echoed to the terminal (and therefore not preserved in scrollback,
  // recordings, or screen-shares).
  let muted = false;
  const muteStream = new Writable({
    write(chunk, encoding, callback) {
      if (!muted) defaultStdout.write(chunk, encoding);
      callback();
    },
  });
  const rl = readline.createInterface({
    input: defaultStdin,
    output: muteStream,
    terminal: true,
  });
  try {
    const answerPromise = rl.question(question);
    muted = true;
    const answer = await answerPromise;
    defaultStdout.write("\n");
    return answer;
  } finally {
    rl.close();
  }
}

export async function runLogin(deps: LoginDeps = {}): Promise<LoginResult> {
  const prompt = deps.prompt ?? defaultPrompt;
  const log = deps.log ?? ((msg) => console.log(msg));
  const errorLog = deps.errorLog ?? ((msg) => console.error(msg));
  const save = deps.save ?? defaultSaveApiKey;

  const raw = (await prompt("Brighty API key: ")).trim();
  if (!raw) {
    errorLog("[brighty-mcp-login] no API key provided.");
    return { ok: false, errorCode: "empty" };
  }

  const masked = maskApiKey(raw);
  const client = new BrightyClient({
    apiKey: raw,
    ...(deps.fetch ? { fetch: deps.fetch } : {}),
  });

  try {
    await client.get("/me");
  } catch (err) {
    if (err instanceof BrightyApiError && err.status === 401) {
      errorLog(
        `[brighty-mcp-login] Brighty API rejected the key (key ${masked}, HTTP 401). ` +
          "Verify it in the Brighty Business Portal and re-run the login command.",
      );
      return { ok: false, maskedKey: masked, errorCode: "invalid-key" };
    }
    const detail = err instanceof Error ? err.message : String(err);
    errorLog(`[brighty-mcp-login] failed to validate key (key ${masked}): ${detail}`);
    return { ok: false, maskedKey: masked, errorCode: "network" };
  }

  await save(raw);
  log(`[brighty-mcp-login] saved API key to OS keychain (key ${masked}).`);
  return { ok: true, maskedKey: masked };
}

const invokedAsMain =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedAsMain) {
  runLogin()
    .then((result) => {
      process.exit(result.ok ? 0 : 1);
    })
    .catch((err) => {
      console.error("[brighty-mcp-login] fatal:", err);
      process.exit(1);
    });
}
