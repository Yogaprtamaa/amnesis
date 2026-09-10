#!/usr/bin/env node
import "dotenv/config"; // load .env (project root) ke process.env — sebelum command jalan
import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { wrapupCommand } from "./commands/wrapup.js";
import { recallCommand, statusCommand } from "./commands/status.js";
import { adrCommand } from "./commands/adr.js";

const program = new Command();
program
  .name("aimemory")
  .description("Universal Context Memory CLI for Agentic AI Coding Tools (amnesis)")
  .version("0.1.0");

program
  .command("init")
  .description("Setup .aimemory in this project")
  .option("--targets <list>", "comma-separated: claude,agents,cursor,windsurf,continue")
  .option("--no-hook", "skip git hook installation")
  .option("--force", "overwrite existing config (with confirmation)")
  .action(async (opts) => {
    try {
      await initCommand(process.cwd(), {
        targets: opts.targets,
        noHook: opts.hook === false ? true : opts.noHook,
        force: opts.force,
      });
    } catch (err) {
      if (process.exitCode === 0) process.exitCode = 1;
      if (err instanceof Error && err.message.includes("git repository")) {
        // message already printed
      } else {
        console.error(err);
      }
    }
  });

program
  .command("wrapup")
  .description("Summarize git diff via LLM and update state.md")
  .option("--trigger <mode>", "commit|manual", "manual")
  .option("--dry-run", "don't write files, print to stdout", false)
  .option("--provider <name>", "override config provider (anthropic|openai|ollama|openrouter|opencode)")
  .action(async (opts) => {
    try {
      await wrapupCommand(process.cwd(), {
        trigger: opts.trigger,
        dryRun: opts.dryRun,
        provider: opts.provider,
      });
    } catch (err) {
      if (process.exitCode === 0) process.exitCode = 1;
      if (!(err instanceof Error && err.message.includes("git repository"))) {
        console.error(err instanceof Error ? err.message : err);
      }
    }
  });

program
  .command("status")
  .description("Print state.md with highlighting")
  .action(async () => {
    await statusCommand(process.cwd());
  });

program
  .command("recall")
  .description("Print plain state.md for piping into AI chats")
  .action(async () => {
    await recallCommand(process.cwd());
  });

program
  .command("adr <title>")
  .description("Create a new ADR manually")
  .action(async (title: string) => {
    await adrCommand(process.cwd(), title);
  });

program.parse(process.argv);
