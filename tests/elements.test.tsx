import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BillKitProvider } from "../src/BillKitProvider";
import { CheckoutElement } from "../src/CheckoutElement";
import { PaymentMethodElement } from "../src/PaymentMethodElement";

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
      <BillKitProvider publishableKey="pk_test_1">
        <CheckoutElement clientSecret="bkcs_test_x" />
      </BillKitProvider>,
    );
    const el = iframe(container);
    expect(el).not.toBeNull();
    expect(el?.src).toBe("https://js.billkit.eu/embed");
  });

  it("forwards the provider's iframeOrigin (custom-domain seam)", () => {
    const { container } = render(
      <BillKitProvider publishableKey="pk_test_1" iframeOrigin="https://pay.acme.com">
        <CheckoutElement clientSecret="bkcs_test_x" />
      </BillKitProvider>,
    );
    expect(iframe(container)?.src).toBe("https://pay.acme.com/embed");
  });

  it("removes the iframe on unmount", () => {
    const { container, unmount } = render(
      <BillKitProvider publishableKey="pk_test_1">
        <CheckoutElement clientSecret="bkcs_test_x" />
      </BillKitProvider>,
    );
    expect(iframe(container)).not.toBeNull();
    unmount();
    expect(iframe(container)).toBeNull();
  });
});

describe("PaymentMethodElement", () => {
  it("mounts the /methods iframe", () => {
    const { container } = render(
      <BillKitProvider publishableKey="pk_test_1">
        <PaymentMethodElement clientSecret="bkcs_test_x" customerId="cus_1" />
      </BillKitProvider>,
    );
    expect(iframe(container)?.src).toBe("https://js.billkit.eu/methods");
  });
});
