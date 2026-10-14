import { act, render } from "@testing-library/react";
import { createRef, startTransition, Suspense } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BillKitProvider } from "../src/BillKitProvider";
import { CheckoutElement } from "../src/CheckoutElement";
import { OneShotPaymentElement } from "../src/OneShotPaymentElement";
import { PaymentMethodElement } from "../src/PaymentMethodElement";
import type { BillKitElementRef, ThemeableElementRef } from "../src/useElement";

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

  it.each(["", "   "])(
    "renders nothing for the clientSecret %j, then mounts when a real one arrives",
    (blank) => {
      // The page that renders the element while its secret is still being
      // fetched: mounting would throw out of an effect and take it down.
      const { container, rerender } = render(
        <BillKitProvider>
          <CheckoutElement clientSecret={blank} />
        </BillKitProvider>,
      );
      expect(container.innerHTML).toBe("");
      rerender(
        <BillKitProvider>
          <CheckoutElement clientSecret="bkcs_test_x" />
        </BillKitProvider>,
      );
      expect(iframe(container)?.src).toBe("https://js.billkit.eu/embed");
    },
  );

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
    // Since @billkit-eu/js 0.3.0 a submit before the ready handshake is
    // queued, not posted into a frame with no listener yet, and flushed
    // with `init` once the element announces ready.
    ref.current?.submit();
    expect(post).not.toHaveBeenCalledWith({ type: "billkit:submit" }, expect.anything());

    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "billkit:ready" },
        origin: "https://js.billkit.eu",
        source: el?.contentWindow,
      }),
    );

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
    // The whole surface is per-customer: "set default" and "remove" act
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

describe("OneShotPaymentElement", () => {
  it("mounts the one-shot kind on the element page with its own title", () => {
    const { container } = render(
      <BillKitProvider>
        <OneShotPaymentElement clientSecret="osp_test_x_secret_y" />
      </BillKitProvider>,
    );
    const el = iframe(container);
    expect(el?.src).toBe("https://js.billkit.eu/embed");
    expect(el?.getAttribute("data-billkit-element")).toBe("one-shot");
    expect(el?.title).toBe("BillKit secure payment");
  });

  it("hands onSuccess the one-shot id, read through the latest callback", () => {
    const first = vi.fn();
    const latest = vi.fn();
    const { container, rerender } = render(
      <BillKitProvider>
        <OneShotPaymentElement clientSecret="osp_test_x_secret_y" onSuccess={first} />
      </BillKitProvider>,
    );
    rerender(
      <BillKitProvider>
        <OneShotPaymentElement clientSecret="osp_test_x_secret_y" onSuccess={latest} />
      </BillKitProvider>,
    );
    const el = iframe(container);
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "billkit:success", sessionId: "osp_test_x", paymentStatus: "paid" },
        origin: "https://js.billkit.eu",
        source: el?.contentWindow ?? null,
      }),
    );
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledWith({ oneShotPaymentId: "osp_test_x", paymentStatus: "paid" });
  });

  it("exposes submit() through a ref", () => {
    const ref = createRef<BillKitElementRef>();
    render(
      <BillKitProvider>
        <OneShotPaymentElement ref={ref} clientSecret="osp_test_x_secret_y" />
      </BillKitProvider>,
    );
    expect(typeof ref.current?.submit).toBe("function");
  });
});

/** Announce ready from the element's iframe, as js.billkit.eu does. */
function announceReady(el: HTMLIFrameElement | null): void {
  window.dispatchEvent(
    new MessageEvent("message", {
      data: { type: "billkit:ready", protocol: 1 },
      origin: "https://js.billkit.eu",
      source: el?.contentWindow,
    }),
  );
}

describe("1.0 additions", () => {
  it("names every element in the outside-a-provider error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const element of [
      <CheckoutElement clientSecret="bkcs_test_x" />,
      <OneShotPaymentElement clientSecret="osp_test_x_secret_y" />,
      <PaymentMethodElement clientSecret="bkcs_test_x" />,
    ]) {
      expect(() => render(element)).toThrow(
        /<CheckoutElement\/>, <OneShotPaymentElement\/> and <PaymentMethodElement\/> must be rendered inside a <BillKitProvider>/,
      );
    }
    spy.mockRestore();
  });

  it.each([
    ["CheckoutElement", (title?: string) => <CheckoutElement clientSecret="bkcs_test_x" title={title} />],
    ["OneShotPaymentElement", (title?: string) => <OneShotPaymentElement clientSecret="osp_test_x_secret_y" title={title} />],
    ["PaymentMethodElement", (title?: string) => <PaymentMethodElement clientSecret="bkcs_test_x" title={title} />],
  ])("%s forwards title to the iframe's accessible name", (_name, make) => {
    const { container } = render(<BillKitProvider>{make("Sicher bezahlen")}</BillKitProvider>);
    expect(iframe(container)?.title).toBe("Sicher bezahlen");
  });

  it("keeps the per-element default title when none is given", () => {
    const { container } = render(
      <BillKitProvider>
        <CheckoutElement clientSecret="bkcs_test_x" />
      </BillKitProvider>,
    );
    expect(iframe(container)?.title).toBe("BillKit secure checkout");
  });

  it("exposes focus() on the checkout ref, posted once the element is ready", () => {
    const ref = createRef<BillKitElementRef>();
    const { container } = render(
      <BillKitProvider>
        <CheckoutElement ref={ref} clientSecret="bkcs_test_x" />
      </BillKitProvider>,
    );
    const el = iframe(container);
    const post = vi.spyOn(el?.contentWindow as Window, "postMessage");
    announceReady(el);
    ref.current?.focus();
    expect(post).toHaveBeenCalledWith({ type: "billkit:focus" }, "https://js.billkit.eu");
  });

  it("exposes focus() on the payment-method ref too, which has no submit()", () => {
    const ref = createRef<ThemeableElementRef>();
    const { container } = render(
      <BillKitProvider>
        <PaymentMethodElement ref={ref} clientSecret="bkcs_test_x" />
      </BillKitProvider>,
    );
    const el = iframe(container);
    const post = vi.spyOn(el?.contentWindow as Window, "postMessage");
    announceReady(el);
    ref.current?.focus();
    expect(post).toHaveBeenCalledWith({ type: "billkit:focus" }, "https://js.billkit.eu");
    expect("submit" in (ref.current as object)).toBe(false);
  });

  it("mounts the payment-method element without a customerId", () => {
    const { container } = render(
      <BillKitProvider>
        <PaymentMethodElement clientSecret="bkcs_test_x" />
      </BillKitProvider>,
    );
    const el = iframe(container);
    expect(el?.src).toBe("https://js.billkit.eu/methods");
    const post = vi.spyOn(el?.contentWindow as Window, "postMessage");
    announceReady(el);
    const init = post.mock.calls[0]![0] as Record<string, unknown>;
    expect(init).toMatchObject({ type: "billkit:init", element: "payment-method", protocol: 1 });
    expect("customerId" in init).toBe(false);
  });
});

describe("theme and callbacks across renders", () => {
  it("clears a removed theme instead of leaving the old tokens painted", () => {
    const { container, rerender } = render(
      <BillKitProvider>
        <CheckoutElement clientSecret="bkcs_test_x" theme={{ colorPrimary: "#0f766e" }} />
      </BillKitProvider>,
    );
    const el = iframe(container);
    announceReady(el);
    const post = vi.spyOn(el?.contentWindow as Window, "postMessage");

    rerender(
      <BillKitProvider>
        <CheckoutElement clientSecret="bkcs_test_x" />
      </BillKitProvider>,
    );

    expect(iframe(container)).toBe(el);
    expect(post).toHaveBeenCalledWith({ type: "billkit:theme", theme: {} }, "https://js.billkit.eu");
  });

  it("sends no reset when there was never a theme to clear", () => {
    const { container, rerender } = render(
      <BillKitProvider>
        <CheckoutElement clientSecret="bkcs_test_x" />
      </BillKitProvider>,
    );
    const el = iframe(container);
    announceReady(el);
    const post = vi.spyOn(el?.contentWindow as Window, "postMessage");

    rerender(
      <BillKitProvider>
        <CheckoutElement clientSecret="bkcs_test_x" onReady={() => {}} />
      </BillKitProvider>,
    );

    expect(post).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "billkit:theme" }),
      expect.anything(),
    );
  });

  it("keeps the committed callback when React throws a render away", async () => {
    // A transition whose sibling suspends is rendered and then discarded:
    // the page keeps showing the committed tree. Callbacks written to the
    // ref during that render used to reach the live element anyway.
    const never = new Promise<never>(() => {});
    function Suspends(): never {
      throw never;
    }
    const committed = vi.fn();
    const discarded = vi.fn();
    const tree = (onChange: () => void, suspend: boolean) => (
      <BillKitProvider>
        <Suspense fallback={<p>loading</p>}>
          <CheckoutElement clientSecret="bkcs_test_x" onChange={onChange} />
          {suspend ? <Suspends /> : null}
        </Suspense>
      </BillKitProvider>
    );
    const { container, rerender } = render(tree(committed, false));
    const el = iframe(container);

    await act(async () => {
      startTransition(() => rerender(tree(discarded, true)));
    });

    // Still the committed tree: same iframe, no fallback.
    expect(iframe(container)).toBe(el);
    expect(container.textContent).not.toContain("loading");
    announceReady(el);
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "billkit:change", complete: true, payment_method: "creditcard" },
        origin: "https://js.billkit.eu",
        source: el?.contentWindow,
      }),
    );
    expect(discarded).not.toHaveBeenCalled();
    expect(committed).toHaveBeenCalledTimes(1);
  });
});
