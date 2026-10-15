# BillKit React SDK

React bindings for [BillKit](https://billkit.eu)'s embedded checkout, shaped like `@stripe/react-stripe-js` and safe to render on the server.

A thin wrapper over [`@billkit-eu/js`](https://www.npmjs.com/package/@billkit-eu/js). The card fields render inside a cross-origin iframe served from `js.billkit.eu`, so card data never touches your origin and you stay on PCI SAQ A. All of the security model and `postMessage` handling lives in the loader; this package is the React surface over it.

No secret key ever reaches the browser. For server-side calls, use [`@billkit-eu/sdk`](https://www.npmjs.com/package/@billkit-eu/sdk).

## Install

```bash
npm install @billkit-eu/react @billkit-eu/js
# or pnpm add @billkit-eu/react @billkit-eu/js
```

`@billkit-eu/js` (1.x), `react` and `react-dom` (18 or 19) are peer dependencies, so install `@billkit-eu/js` alongside this package. Both React majors are tested on every change.

Follows semantic versioning from 1.0.0. Coming from 0.x, see [Upgrading from 0.x](#upgrading-from-0x).

## Quick start

Mint an ephemeral `client_secret` on your server, then hand it to the element:

```tsx
import { BillKitProvider, CheckoutElement } from "@billkit-eu/react";

export function Checkout({ clientSecret }: { clientSecret: string }) {
  return (
    <BillKitProvider>
      <CheckoutElement
        clientSecret={clientSecret}
        theme={{ colorPrimary: "#6d28d9", borderRadius: "10px" }}
        onSuccess={({ sessionId }) => router.push(`/thanks?cs=${sessionId}`)}
        onError={({ message }) => toast.error(message)}
      />
    </BillKitProvider>
  );
}
```

No credential goes on the provider. The element authenticates with the `client_secret`, which already names the tenant, the mode and the session.

## Saved payment methods

```tsx
import { BillKitProvider, PaymentMethodElement } from "@billkit-eu/react";

<BillKitProvider>
  <PaymentMethodElement clientSecret={clientSecret} />
</BillKitProvider>;
```

## One-off payments

For a single charge with no subscription and no saved mandate, create the
one-shot on your server with `ui_mode: "embedded"` (and no `payment_method`; the buyer
picks it), then render its `client_secret`:

```tsx
import { BillKitProvider, OneShotPaymentElement } from "@billkit-eu/react";

<BillKitProvider>
  <OneShotPaymentElement
    clientSecret={clientSecret}
    onSuccess={({ oneShotPaymentId }) => router.push(`/thanks?p=${oneShotPaymentId}`)}
    onError={({ code, message }) => toast(message)}
  />
</BillKitProvider>;
```

Same props, ref and remount rules as `<CheckoutElement/>`. `onSuccess` receives
`{ oneShotPaymentId, paymentStatus }`. A decline is final for one one-shot
(`onError({ code: "payment_declined" })` and no retry panel): create a new
one-shot and pass its secret, which remounts the element, to let the buyer try
again. Redirect methods return the buyer to your `success_url`, and the
`one_shot_payment.succeeded` webhook is the record of the money.

Two one-shot `onError` codes describe a payment that may have been charged, so
never create a new one-shot on them alone: `client_secret_expired` (the secret
lapsed 30 minutes after the create, and the element can no longer show the
payment, which may be paid or a bank transfer still in flight; retrieve it
server-side or wait for its webhook) and `payment_refunded`. `payment_not_open`
is the one that means nothing was charged. The full list is in
the `@billkit-eu/js` README's error-code table.

## Server rendering

All three components are SSR-safe. They render `null` on the server and on the first client render, then mount the iframe after hydration, so there is no hydration mismatch and no `window` access during render. Next.js App Router, Remix and Astro islands all work without a `dynamic(..., { ssr: false })` wrapper. The bundles carry a `"use client"` directive, so the App Router treats them as client components and you can import them straight into a server component.

## Props

`<CheckoutElement/>`, `<OneShotPaymentElement/>` and `<PaymentMethodElement/>` share these:

| Prop | Type | Notes |
|---|---|---|
| `clientSecret` | `string` | Required. From `POST /v1/checkout/sessions` (or `POST /v1/checkout/one_shot` for `<OneShotPaymentElement/>`) with `ui_mode: "embedded"`. An empty string renders nothing, so you can render the element while the secret is still loading; it mounts when the secret arrives. |
| `theme` | `BillKitThemeTokens` | Colour, radius, font and spacing tokens. |
| `locale` | `string` | BCP-47, for example `"nl"`. Defaults to the customer's browser. |
| `title` | `string` | The iframe's accessible name. Defaults per element, in English; this string lives on your page, so `locale` cannot reach it. |
| `loadTimeoutMs` | `number` | Before `onError({ code: "load_timeout" })`. Default `20000`; `0` disables it. |
| `logger` | `BillKitElementLogger` | Overrides the provider's logger for this element only. |
| `className` / `style` | | Applied to the container `<div>` the iframe mounts into. |
| `onReady` | `() => void` | The iframe booted and loaded the session. |
| `onChange` | `(e: ChangeEvent) => void` | `e.complete` drives an external pay button. |
| `onProcessing` | `(e: ProcessingEvent) => void` | `e.processing` is true while a payment is in flight. Hold a modal's close meanwhile. Since 1.1. |
| `onEscape` | `() => void` | Escape was pressed inside the element. Since 1.1. |
| `onSuccess` | `(e: SuccessEvent) => void` | Terminal success with no redirect. `OneShotSuccessEvent` (`{ oneShotPaymentId, paymentStatus }`) on `<OneShotPaymentElement/>`. |
| `onError` | `(e: BillKitElementError) => void` | Any element or payment error. Every code ends the attempt; see the `@billkit-eu/js` README's error-code table for the list. |
| `onRedirect` | `(url: string) => boolean \| void` | Before the top window navigates for 3DS or iDEAL. Return `false` to navigate yourself. |

`<PaymentMethodElement/>` also accepts `customerId`, which is optional: the `client_secret` already names the customer.

`<BillKitProvider>` accepts `iframeOrigin`, `apiBase` and `logger`, applied to every element beneath it.

### Callbacks and re-renders

Pass inline arrow functions freely. Callbacks are read through a ref at event time, so a fresh closure on every render does not tear down a live payment iframe. The same holds for `logger`: an inline `logger={{...}}`, or switching one on mid-session, never triggers a remount.

Only `clientSecret`, `customerId` (when passed), `locale`, `title` and the origin overrides remount the element. That is deliberate, because a remount destroys an in-progress payment.

## Your own pay button

Take a `ref` and call `submit()`. Gate the button on `onChange`'s `complete`, and re-enable it from `onError`, because a declined card fires `onError({ code: "payment_declined" })` while the element shows its own retry panel, so it is the only signal that the attempt is over.

```tsx
import { useRef, useState } from "react";
import { BillKitProvider, CheckoutElement, type BillKitElementRef } from "@billkit-eu/react";

function Checkout({ clientSecret }: { clientSecret: string }) {
  const element = useRef<BillKitElementRef>(null);
  const [complete, setComplete] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  return (
    <BillKitProvider>
      <CheckoutElement
        ref={element}
        clientSecret={clientSecret}
        onChange={({ complete }) => setComplete(complete)}
        onError={() => setSubmitting(false)}
        onSuccess={({ sessionId }) => router.push(`/thanks?cs=${sessionId}`)}
      />
      <button
        disabled={!complete || submitting}
        onClick={() => {
          setSubmitting(true);
          element.current?.submit();
        }}
      >
        Pay
      </button>
    </BillKitProvider>
  );
}
```

The ref also exposes `focus()`, which moves keyboard focus into the element for a page that reveals it in a later step (a call before the element has booted is dropped), and `updateTheme(tokens)` for imperative restyling; the declarative `theme` prop is hot-applied without a remount and is usually what you want. Setting it back to `undefined` returns the element to its default look.

`<PaymentMethodElement/>`'s ref exposes `focus()` and `updateTheme()` and no `submit()`: that element has no form to submit; its actions are per-row buttons inside the iframe.

## Content Security Policy

```
frame-src https://js.billkit.eu;
```

If the iframe never boots, `onError` fires with `load_timeout`. A missing `frame-src` and an ad blocker look identical from the page, so check both.

## Logging

Elements are silent by default. Installing the package does not start writing to anyone's console. Opt in on the provider, or per element:

```tsx
<BillKitProvider logger={console}>
  <CheckoutElement clientSecret={clientSecret} />
</BillKitProvider>
```

Never logged: the `clientSecret`, message payloads, or full redirect URLs. Only a redirect's origin is recorded, because the rest of the URL carries provider payment identifiers.

## Migrating from `@stripe/react-stripe-js`

The shapes line up, with one difference worth calling out.

There is **no `publishableKey`**. BillKit has no publishable-key concept; the API only mints secret keys (`bk_live_...` / `bk_test_...`), which must never reach a browser. Elements authenticate with the ephemeral `client_secret` your server gets from `POST /v1/checkout/sessions` with `ui_mode: "embedded"`; `<BillKitProvider>` takes no credential at all.

See the [migration guide](https://docs.billkit.eu/migration/elements/) for the full comparison.

## TypeScript

Types ship with the package. The loader's shared types are re-exported so you can import from one place:

```ts
import type {
  BillKitThemeTokens,
  ChangeEvent,
  SuccessEvent,
  OneShotSuccessEvent, // <OneShotPaymentElement/>'s onSuccess payload
  BillKitElementError,
  BillKitElementRef, // the imperative handle: { submit, focus, updateTheme }
  ThemeableElementRef, // <PaymentMethodElement/>'s: { focus, updateTheme }
} from "@billkit-eu/react";
```

## Upgrading from 0.x

1.0 is a deliberate break; [`CHANGELOG.md`](./CHANGELOG.md) has every change. In short:

- Peer ranges are `@billkit-eu/js` `^1.0.0` and `react` / `react-dom` `^18 || ^19`.
- `customerId` on `<PaymentMethodElement/>` is optional.
- New: the `title` prop and `focus()` on every ref.
- The outside-a-provider error names all three elements.
- The `@billkit-eu/js` 1.0 changes apply too, since its types are re-exported here.

## Links

- Documentation: [docs.billkit.eu](https://docs.billkit.eu)
- Source: [github.com/billkit-eu/billkit-react](https://github.com/billkit-eu/billkit-react)
- Issues: [github.com/billkit-eu/billkit-react/issues](https://github.com/billkit-eu/billkit-react/issues)

## License

Apache-2.0
