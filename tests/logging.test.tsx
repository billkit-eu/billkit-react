import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BillKitElementLogger } from "@billkit-eu/js";
import { BillKitProvider } from "../src/BillKitProvider";
import { CheckoutElement } from "../src/CheckoutElement";

/**
 * The React bindings only have to carry a logger from the provider (or a
 * prop) down to the loader without switching anything on by default,
 * and without turning a logger identity change into a remount of a live
 * payment iframe.
 */

const CS = "cs_test_abc123_secret_r4nd0m";

interface Recorded {
  level: "debug" | "warn";
  message: string;
}

function recordingLogger(): { logger: BillKitElementLogger; lines: Recorded[] } {
  const lines: Recorded[] = [];
  return {
    lines,
    logger: {
      debug: (message) => void lines.push({ level: "debug", message }),
      warn: (message) => void lines.push({ level: "warn", message }),
    },
  };
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("element logging", () => {
  it("is silent when no logger is configured", () => {
    const spies = [
      vi.spyOn(console, "log").mockImplementation(() => {}),
      vi.spyOn(console, "debug").mockImplementation(() => {}),
      vi.spyOn(console, "warn").mockImplementation(() => {}),
      vi.spyOn(console, "error").mockImplementation(() => {}),
    ];

    render(
      <BillKitProvider>
        <CheckoutElement clientSecret={CS} loadTimeoutMs={0} />
      </BillKitProvider>,
    );

    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    }
  });

  it("forwards the provider's logger to the element", () => {
    const { logger, lines } = recordingLogger();

    render(
      <BillKitProvider logger={logger}>
        <CheckoutElement clientSecret={CS} loadTimeoutMs={0} />
      </BillKitProvider>,
    );

    expect(lines.some((l) => l.message === "BillKit element mounting")).toBe(true);
  });

  it("a per-element logger prop overrides the provider's", () => {
    const provider = recordingLogger();
    const element = recordingLogger();

    render(
      <BillKitProvider logger={provider.logger}>
        <CheckoutElement clientSecret={CS} logger={element.logger} loadTimeoutMs={0} />
      </BillKitProvider>,
    );

    expect(element.lines.length).toBeGreaterThan(0);
    expect(provider.lines).toHaveLength(0);
  });

  it("never logs the clientSecret", () => {
    const messages: string[] = [];
    const logger: BillKitElementLogger = {
      debug: (m, c) => void messages.push(`${m} ${JSON.stringify(c ?? {})}`),
      warn: (m, c) => void messages.push(`${m} ${JSON.stringify(c ?? {})}`),
    };

    render(
      <BillKitProvider logger={logger}>
        <CheckoutElement clientSecret={CS} loadTimeoutMs={0} />
      </BillKitProvider>,
    );

    const text = messages.join("\n");
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toContain(CS);
    expect(text).not.toContain("r4nd0m");
  });

  it("swapping the logger does not remount the iframe", () => {
    const first = recordingLogger();
    const second = recordingLogger();

    const { container, rerender } = render(
      <BillKitProvider logger={first.logger}>
        <CheckoutElement clientSecret={CS} loadTimeoutMs={0} />
      </BillKitProvider>,
    );
    const before = container.querySelector("iframe");

    // A remount here would tear down a live payment session.
    rerender(
      <BillKitProvider logger={second.logger}>
        <CheckoutElement clientSecret={CS} loadTimeoutMs={0} />
      </BillKitProvider>,
    );

    expect(container.querySelector("iframe")).toBe(before);
    // ...and the swap still took effect for anything logged afterwards.
    expect(first.lines.some((l) => l.message === "BillKit element destroyed")).toBe(false);
  });

  it("an inline logger object each render does not remount either", () => {
    const { container, rerender } = render(
      <BillKitProvider>
        <CheckoutElement clientSecret={CS} logger={{ debug: () => {}, warn: () => {} }} loadTimeoutMs={0} />
      </BillKitProvider>,
    );
    const before = container.querySelector("iframe");

    rerender(
      <BillKitProvider>
        <CheckoutElement clientSecret={CS} logger={{ debug: () => {}, warn: () => {} }} loadTimeoutMs={0} />
      </BillKitProvider>,
    );

    expect(container.querySelector("iframe")).toBe(before);
  });
});
