import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export class LogStream {
  constructor(private readonly root = ".agent-router/logs") {}

  write(taskId: string, content: string): string {
    const dir = resolve(process.cwd(), this.root);
    mkdirSync(dir, { recursive: true });
    const path = join(dir, `${taskId}.log`);
    writeFileSync(path, content, "utf-8");
    return path;
  }
}
