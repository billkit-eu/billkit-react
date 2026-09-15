import { render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BillKitProvider } from "../src/BillKitProvider";
import { CheckoutElement } from "../src/CheckoutElement";
import { PaymentMethodElement } from "../src/PaymentMethodElement";
import type { BillKitElementRef } from "../src/useElement";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

function iframe(container: HTMLElement): HTMLIFrameElement | null {
  return container.querySelector("iframe");
}

describe("CheckoutElement", () => {
  it("throws a helpful error when used outside a provider", () => {
    // Silence the expected React error boundary console noise.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<CheckoutElement clientSecret="bkcs_test_x" />)).toThrow(
      /BillKitProvider/,
    );
    spy.mockRestore();
  });

  it("mounts the js.billkit.eu iframe after hydration", () => {
    const { container } = render(
      <BillKitProvider>
        <CheckoutElement clientSecret="bkcs_test_x" />
      </BillKitProvider>,
    );
    const el = iframe(container);
    expect(el).not.toBeNull();
    expect(el?.src).toBe("https://js.billkit.eu/embed");
  });

  it("forwards the provider's iframeOrigin (custom-domain seam)", () => {
    const { container } = render(
      <BillKitProvider iframeOrigin="https://pay.acme.com">
        <CheckoutElement clientSecret="bkcs_test_x" />
      </BillKitProvider>,
    );
    expect(iframe(container)?.src).toBe("https://pay.acme.com/embed");
  });

  it("removes the iframe on unmount", () => {
    const { container, unmount } = render(
      <BillKitProvider>
        <CheckoutElement clientSecret="bkcs_test_x" />
      </BillKitProvider>,
    );
    expect(iframe(container)).not.toBeNull();
    unmount();
    expect(iframe(container)).toBeNull();
  });

  it("exposes submit() through a ref so an external pay button can work", () => {
    const ref = createRef<BillKitElementRef>();
    const { container } = render(
      <BillKitProvider>
        <CheckoutElement ref={ref} clientSecret="bkcs_test_x" />
      </BillKitProvider>,
    );
    const el = iframe(container);
    const post = vi.spyOn(el?.contentWindow as Window, "postMessage");

    expect(ref.current).not.toBeNull();
    ref.current?.submit();

    expect(post).toHaveBeenCalledWith({ type: "billkit:submit" }, "https://js.billkit.eu");
  });

  it("exposes updateTheme() through the same ref", () => {
    const ref = createRef<BillKitElementRef>();
    const { container } = render(
      <BillKitProvider>
        <CheckoutElement ref={ref} clientSecret="bkcs_test_x" />
      </BillKitProvider>,
    );
    const el = iframe(container);
    // The loader only posts a theme once the element is ready; before
    // that it stores it and replays it in `init`. Announce ready first.
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "billkit:ready" },
        origin: "https://js.billkit.eu",
        source: el?.contentWindow,
      }),
    );
    const post = vi.spyOn(el?.contentWindow as Window, "postMessage");

    ref.current?.updateTheme({ colorPrimary: "#0f766e" });

    expect(post).toHaveBeenCalledWith(
      { type: "billkit:theme", theme: { colorPrimary: "#0f766e" } },
      "https://js.billkit.eu",
    );
  });
});

describe("PaymentMethodElement", () => {
  it("mounts the /methods iframe", () => {
    const { container } = render(
      <BillKitProvider>
        <PaymentMethodElement clientSecret="bkcs_test_x" customerId="cus_1" />
      </BillKitProvider>,
    );
    expect(iframe(container)?.src).toBe("https://js.billkit.eu/methods");
  });

  it("remounts when customerId changes, so it never shows the previous wallet", () => {
    // The whole surface is per-customer — "set default" and "remove" act
    // on whichever customer the iframe was initialised with. Leaving
    // `customerId` out of the mount effect's deps left the *previous*
    // customer's cards on screen with live mandate actions attached.
    const { container, rerender } = render(
      <BillKitProvider>
        <PaymentMethodElement clientSecret="bkcs_test_x" customerId="cus_1" />
      </BillKitProvider>,
    );
    const first = iframe(container);
    expect(first).not.toBeNull();

    rerender(
      <BillKitProvider>
        <PaymentMethodElement clientSecret="bkcs_test_x" customerId="cus_2" />
      </BillKitProvider>,
    );
    const second = iframe(container);

    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
    // The old frame is gone, not merely hidden behind the new one.
    expect(container.querySelectorAll("iframe")).toHaveLength(1);
  });

  it("does not remount when only a callback identity changes", () => {
    const { container, rerender } = render(
      <BillKitProvider>
        <PaymentMethodElement
          clientSecret="bkcs_test_x"
          customerId="cus_1"
          onReady={() => {}}
        />
      </BillKitProvider>,
    );
    const first = iframe(container);

    rerender(
      <BillKitProvider>
        <PaymentMethodElement
          clientSecret="bkcs_test_x"
          customerId="cus_1"
          onReady={() => {}}
        />
      </BillKitProvider>,
    );

    expect(iframe(container)).toBe(first);
  });
});
