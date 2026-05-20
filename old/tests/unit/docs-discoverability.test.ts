import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");

function read(relativePath: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

test("README exposes the primary CLI paths", () => {
  const readme = read("README.md");

  assert.match(readme, /oax run \.oma\/plans\/plan\.json/);
  assert.match(readme, /oax diagnose relay --stream-log <path>/);
  assert.match(readme, /oax diagnose relay --watch --timeout 75 --stream-log <path> --child-log <path>/);
  assert.match(readme, /oax diagnose stall \.oma\/plans\/plan\.json/);
});

test("core docs expose the same diagnose surface", () => {
  for (const file of ["docs/workflows.md", "docs/architecture.md", "docs/config.md"]) {
    const content = read(file);
    assert.match(content, /oax diagnose relay --stream-log <path>/, file);
    assert.match(content, /oax diagnose relay --watch --timeout 75 --stream-log <path> --child-log <path>/, file);
    assert.match(content, /oax diagnose stall \.oma\/plans\/plan\.json/, file);
  }
});
