/**
 * `@billkit-eu/react` integration suite, run against a **live** BillKit API.
 *
 * Skipped unless `BILLKIT_INTEGRATION_BASE_URL` is set; boot a stack with
 * `make sdk-integration`.
 *
 * Covers the same `browser`-family scenarios as the `@billkit-eu/js` suite
 * (same manifest, same shared harness), but drives them through the React
 * components, which is the surface most tenants actually integrate. The
 * React layer adds two things worth proving against a live secret:
 *
 *  - the provider's `iframeOrigin` / `apiBase` reach the underlying loader,
 *  - `useElement`'s remount rules hold: swapping the `clientSecret`
 *    remounts, but a new callback identity on every render does not (a
 *    remount mid-payment would destroy the customer's in-progress form).
 *
 * `@billkit-eu/react` resolves `@billkit-eu/js` through its built `dist/`, so this
 * suite exercises the published artifact rather than the sibling source,
 * which is exactly what a tenant installs.
 */

import { render } from "@testing-library/react";
import { useState } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { BillKitProvider } from "../../src/BillKitProvider";
import { CheckoutElement } from "../../src/CheckoutElement";
import { PaymentMethodElement } from "../../src/PaymentMethodElement";
import {
  assertManifestCoverage,
  COVERED,
} from "../../integration/browser/coverage.js";
import {
  confirmElement,
  createEmbeddedSession,
  deliverMollieWebhook,
  type EmbeddedSession,
  fetchElementView,
  INTEGRATION_ENABLED,
  listSubscriptions,
  mollie,
  provisionTenant,
  type TestTenant,
} from "../../integration/browser/harness.js";

const IFRAME_ORIGIN = "https://js.billkit.eu";

const d = INTEGRATION_ENABLED ? describe : describe.skip;

function scenario(id: string, name: string, fn: () => void | Promise<void>) {
  COVERED.add(id);
  return it(`[${id}] ${name}`, fn, 30_000);
}

let tenant: TestTenant;
let session: EmbeddedSession;

function iframeIn(container: HTMLElement): HTMLIFrameElement {
  const el = container.querySelector("iframe");
  if (!el) throw new Error("no iframe mounted");
  return el;
}

/** Dispatch a message as if it came from the element iframe. */
function fromIframe(
  iframe: HTMLIFrameElement,
  data: unknown,
  origin = IFRAME_ORIGIN,
  source: unknown = iframe.contentWindow,
): void {
  window.dispatchEvent(
    new MessageEvent("message", { data, origin, source: source as Window }),
  );
}

d("@billkit-eu/react against a live API", () => {
  beforeAll(async () => {
    tenant = await provisionTenant("react");
    session = await createEmbeddedSession(tenant);
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  scenario("element.mount", "mounts the iframe without ever putting the secret in the URL", () => {
    const { container } = render(
      <BillKitProvider publishableKey="pk_test_1">
        <CheckoutElement clientSecret={session.clientSecret} />
      </BillKitProvider>,
    );
    const iframe = iframeIn(container);
    expect(iframe.src).toBe(`${IFRAME_ORIGIN}/embed`);
    expect(iframe.src).not.toContain(session.clientSecret);
    expect(iframe.src).not.toContain("_secret_");

    const wallet = render(
      <BillKitProvider publishableKey="pk_test_1">
        <PaymentMethodElement clientSecret={session.clientSecret} customerId="cus_x" />
      </BillKitProvider>,
    );
    expect(iframeIn(wallet.container).src).toBe(`${IFRAME_ORIGIN}/methods`);
  });

  scenario(
    "element.handshake",
    "posts init only after ready, targeted, with the real secret + parsed session id",
    () => {
      const { container } = render(
        <BillKitProvider publishableKey="pk_test_1">
          <CheckoutElement clientSecret={session.clientSecret} theme={{ colorPrimary: "#111" }} />
        </BillKitProvider>,
      );
      const iframe = iframeIn(container);
      const post = vi.spyOn(iframe.contentWindow as Window, "postMessage");

      expect(post).not.toHaveBeenCalled();
      fromIframe(iframe, { type: "billkit:ready" });

      expect(post).toHaveBeenCalledTimes(1);
      const [message, targetOrigin] = post.mock.calls[0]!;
      expect(targetOrigin).toBe(IFRAME_ORIGIN);
      expect(message).toMatchObject({
        type: "billkit:init",
        element: "checkout",
        clientSecret: session.clientSecret,
        sessionId: session.sessionId,
        theme: { colorPrimary: "#111" },
      });
    },
  );

  scenario("element.origin_isolation", "ignores foreign origins and foreign sources", () => {
    const onError = vi.fn();
    const onSuccess = vi.fn();
    const { container } = render(
      <BillKitProvider publishableKey="pk_test_1">
        <CheckoutElement
          clientSecret={session.clientSecret}
          onError={onError}
          onSuccess={onSuccess}
        />
      </BillKitProvider>,
    );
    const iframe = iframeIn(container);

    fromIframe(iframe, { type: "billkit:error", message: "spoofed" }, "https://evil.example");
    fromIframe(
      iframe,
      { type: "billkit:success", sessionId: "cs_x", paymentStatus: "paid" },
      IFRAME_ORIGIN,
      window,
    );

    expect(onError).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  scenario(
    "element.live_secret_authenticates",
    "the provider's apiBase reaches the loader and the secret authenticates",
    async () => {
      // The provider's origin overrides must actually reach the loader.
      // This is the seam a self-hosted or vanity-domain tenant depends on.
      const { container } = render(
        <BillKitProvider
          publishableKey="pk_test_1"
          iframeOrigin="https://pay.acme.com"
          apiBase="https://api.acme.com"
        >
          <CheckoutElement clientSecret={session.clientSecret} />
        </BillKitProvider>,
      );
      const iframe = iframeIn(container);
      expect(iframe.src).toBe("https://pay.acme.com/embed");

      const post = vi.spyOn(iframe.contentWindow as Window, "postMessage");
      fromIframe(iframe, { type: "billkit:ready" }, "https://pay.acme.com");
      const [message, targetOrigin] = post.mock.calls[0]!;
      expect(targetOrigin).toBe("https://pay.acme.com");
      expect(message).toMatchObject({
        apiBase: "https://api.acme.com",
        sessionId: session.sessionId,
      });

      // And the same secret genuinely authenticates against the real API.
      const res = await fetchElementView(session.sessionId, session.clientSecret);
      expect(res.status).toBe(200);
      expect(((await res.json()) as { session_id: string }).session_id).toBe(session.sessionId);
    },
  );

  scenario("element.api_key_rejected", "a secret API key is refused on the embedded surface", async () => {
    expect((await fetchElementView(session.sessionId, tenant.apiKey, "Bearer")).status).toBe(401);
    expect((await fetchElementView(session.sessionId, tenant.apiKey, "Checkout")).status).toBe(401);
  });

  scenario(
    "element.live_confirm_activates",
    "confirm -> settle -> webhook drives the subscription active",
    async () => {
      const own = await createEmbeddedSession(tenant);
      render(
        <BillKitProvider publishableKey="pk_test_1">
          <CheckoutElement clientSecret={own.clientSecret} />
        </BillKitProvider>,
      );

      const res = await confirmElement(own.sessionId, own.clientSecret);
      expect(res.status).toBe(200);
      const { redirect_url: redirectUrl } = (await res.json()) as { redirect_url: string | null };
      expect(redirectUrl).toBeTruthy();

      const providerPaymentId = redirectUrl!.split("/").pop()!;
      expect(providerPaymentId).toMatch(/^tr_/);
      await mollie.settle(providerPaymentId, "paid");
      await deliverMollieWebhook(tenant.mollieRouteId, providerPaymentId);

      const sub = (await listSubscriptions(tenant)).find((s) => s["price_id"] === own.priceId);
      expect(sub, "a subscription should exist for the confirmed element").toBeTruthy();
      expect(sub!["status"]).toBe("active");
    },
  );

  scenario("element.teardown", "unmount removes the iframe and stops routing", () => {
    const onSuccess = vi.fn();
    const { container, unmount } = render(
      <BillKitProvider publishableKey="pk_test_1">
        <CheckoutElement clientSecret={session.clientSecret} onSuccess={onSuccess} />
      </BillKitProvider>,
    );
    const iframe = iframeIn(container);

    unmount();
    expect(container.querySelector("iframe")).toBeNull();

    fromIframe(iframe, { type: "billkit:success", sessionId: "cs_1", paymentStatus: "paid" });
    expect(onSuccess).not.toHaveBeenCalled();
  });

  // ── React-specific remount contract ─────────────────────────────────
  //
  // Not a manifest scenario (js has no component lifecycle), but the bug it
  // guards is React-only and expensive: a remount mid-payment destroys the
  // iframe and with it whatever the customer has typed.

  it("does not remount the iframe when only callback identity changes", () => {
    function Harness() {
      const [n, setN] = useState(0);
      return (
        <BillKitProvider publishableKey="pk_test_1">
          <button type="button" onClick={() => setN(n + 1)}>
            bump {n}
          </button>
          {/* A fresh closure every render, the common React idiom. */}
          <CheckoutElement
            clientSecret={session.clientSecret}
            onSuccess={() => void n}
          />
        </BillKitProvider>
      );
    }
    const { container, getByRole } = render(<Harness />);
    const first = iframeIn(container);

    getByRole("button").click();

    // Same node identity => the element was never torn down.
    expect(iframeIn(container)).toBe(first);
  });

  it("remounts when the clientSecret changes", async () => {
    const other = await createEmbeddedSession(tenant);
    const { container, rerender } = render(
      <BillKitProvider publishableKey="pk_test_1">
        <CheckoutElement clientSecret={session.clientSecret} />
      </BillKitProvider>,
    );
    const first = iframeIn(container);

    rerender(
      <BillKitProvider publishableKey="pk_test_1">
        <CheckoutElement clientSecret={other.clientSecret} />
      </BillKitProvider>,
    );

    // A different session must get a different iframe. Reusing the old one
    // would leave the previous session's secret live in the element.
    expect(iframeIn(container)).not.toBe(first);
  });

  afterAll(() => {
    assertManifestCoverage("react");
  });
});
