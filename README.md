# BillKit React SDK

React bindings for [BillKit](https://billkit.eu)'s embedded checkout, shaped like `@stripe/react-stripe-js` and safe to render on the server.

A thin wrapper over [`@billkit-eu/js`](https://www.npmjs.com/package/@billkit-eu/js). The card fields render inside a cross-origin iframe served from `js.billkit.eu`, so card data never touches your origin and you stay on PCI SAQ A. All of the security model and `postMessage` handling lives in the loader; this package is the React surface over it.

No secret key ever reaches the browser. For server-side calls, use [`@billkit-eu/sdk`](https://www.npmjs.com/package/@billkit-eu/sdk).

## Install

```bash
npm install @billkit-eu/react @billkit-eu/js
# or pnpm add @billkit-eu/react @billkit-eu/js
```

`@billkit-eu/js`, `react` (18+) and `react-dom` (18+) are peer dependencies, so install `@billkit-eu/js` alongside this package.

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
  <PaymentMethodElement clientSecret={clientSecret} customerId="cus_123" />
</BillKitProvider>;
```

## Server rendering

Both components are SSR-safe. They render `null` on the server and on the first client render, then mount the iframe after hydration, so there is no hydration mismatch and no `window` access during render. Next.js App Router, Remix and Astro islands all work without a `dynamic(..., { ssr: false })` wrapper.

## Props

`<CheckoutElement/>` and `<PaymentMethodElement/>` share these:

| Prop | Type | Notes |
|---|---|---|
| `clientSecret` | `string` | Required. From `POST /v1/checkout/sessions` with `ui_mode: "embedded"`. |
| `theme` | `BillKitThemeTokens` | Colour, radius, font and spacing tokens. |
| `locale` | `string` | BCP-47, for example `"nl"`. Defaults to the customer's browser. |
| `loadTimeoutMs` | `number` | Before `onError({ code: "load_timeout" })`. Default `20000`; `0` disables it. |
| `logger` | `BillKitElementLogger` | Overrides the provider's logger for this element only. |
| `className` / `style` | | Applied to the container `<div>` the iframe mounts into. |
| `onReady` | `() => void` | The iframe booted and loaded the session. |
| `onChange` | `(e: ChangeEvent) => void` | `e.complete` drives an external pay button. |
| `onSuccess` | `(e: SuccessEvent) => void` | Terminal success with no redirect. |
| `onError` | `(e: BillKitElementError) => void` | Any element or payment error. Codes: `payment_declined`, `element_crashed`, `load_timeout`, `unsafe_redirect`. All four end the attempt. |
| `onRedirect` | `(url: string) => boolean \| void` | Before the top window navigates for 3DS or iDEAL. Return `false` to navigate yourself. |

`<PaymentMethodElement/>` also requires `customerId`.

`<BillKitProvider>` accepts `iframeOrigin`, `apiBase` and `logger`, applied to every element beneath it.

### Callbacks and re-renders

Pass inline arrow functions freely. Callbacks are read through a ref at event time, so a fresh closure on every render does not tear down a live payment iframe. The same holds for `logger`: an inline `logger={{...}}`, or switching one on mid-session, never triggers a remount.

Only `clientSecret`, `customerId`, `locale` and the origin overrides remount the element. That is deliberate, because a remount destroys an in-progress payment — but `customerId` has to be in that list: the wallet's "set default" and "remove" actions act on whichever customer the iframe was initialised with, so a stale frame would point them at the wrong person.

## Your own pay button

Take a `ref` and call `submit()`. Gate the button on `onChange`'s `complete`, and re-enable it from `onError` — a declined card fires `onError({ code: "payment_declined" })` while the element shows its own retry panel, so it is the only signal that the attempt is over.

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

The ref also exposes `updateTheme(tokens)` for imperative restyling; the declarative `theme` prop is hot-applied without a remount and is usually what you want.

`<PaymentMethodElement/>`'s ref exposes `updateTheme()` only — that element has no form to submit; its actions are per-row buttons inside the iframe.

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

There is **no `publishableKey`**. BillKit has no publishable-key concept; the API only mints secret keys (`bk_live_...` / `bk_test_...`), which must never reach a browser. Elements authenticate with the ephemeral `client_secret` your server gets from `POST /v1/checkout/sessions` with `ui_mode: "embedded"` — `<BillKitProvider>` takes no credential at all.

See the [migration guide](https://docs.billkit.eu/migration/elements/) for the full comparison.

## TypeScript

Types ship with the package. The loader's shared types are re-exported so you can import from one place:

```ts
import type {
  BillKitThemeTokens,
  ChangeEvent,
  SuccessEvent,
  BillKitElementError,
  BillKitElementRef, // the imperative handle: { submit, updateTheme }
  ThemeableElementRef, // <PaymentMethodElement/>'s: { updateTheme }
} from "@billkit-eu/react";
```

## Links

- Documentation: [docs.billkit.eu](https://docs.billkit.eu)
- Source: [github.com/billkit-eu/billkit-react](https://github.com/billkit-eu/billkit-react)
- Issues: [github.com/billkit-eu/billkit-react/issues](https://github.com/billkit-eu/billkit-react/issues)

## License

Apache-2.0
