import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

// The usual minimum for text that is easy to read (WCAG AA)
const MIN_TEXT_CONTRAST = 4.5;

const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8");

function colorToken(name: string): string {
  const match = css.match(new RegExp(`^\\s*--${name}: (#[0-9a-f]{6});`, "m"));
  if (!match) {
    throw new Error(`No color token --${name} in globals.css`);
  }
  return match[1];
}

function luminance(color: string): number {
  const [red, green, blue] = [1, 3, 5].map((start) => {
    const channel = parseInt(color.slice(start, start + 2), 16) / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(first: string, second: string): number {
  const [lighter, darker] = [luminance(first), luminance(second)].sort(
    (a, b) => b - a,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

describe("gray text", () => {
  it.each([
    ["subtle", "muted"],
    ["subtle", "background"],
    ["muted-foreground", "muted"],
    ["muted-foreground", "background"],
    ["muted-foreground", "hero-to"],
  ])("--%s is easy to read on --%s", (text, background) => {
    expect(
      contrast(colorToken(text), colorToken(background)),
    ).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
  });

  it("--subtle stays lighter than --muted-foreground", () => {
    expect(luminance(colorToken("subtle"))).toBeGreaterThan(
      luminance(colorToken("muted-foreground")),
    );
  });
});
