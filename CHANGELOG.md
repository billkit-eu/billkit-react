# Changelog

All notable changes to the BillKit React SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This package is a thin binding layer over `@billkit-eu/js`, which it takes as a
peer dependency. Behaviour changes usually land there and are recorded in that
package's changelog.

## [1.0.0] - 2026-10-14

The first stable release, following `@billkit-eu/js` 1.0.0. From here on the
package follows semantic versioning.

### Added
- `title` on every element, the iframe's accessible name, matching the
  `@billkit-eu/js` option. Changing it remounts the element.
- `focus()` on every element's ref, `<PaymentMethodElement/>`'s included,
  matching the `@billkit-eu/js` handle.
- A React 18 CI leg beside React 19, in this repo and in the mirror.
- `SECURITY.md` ships in the package, beside the README and licence.

### Changed
- Peer ranges: `@billkit-eu/js` `^1.0.0` (was `>=0.4.0 <1`), and `react` /
  `react-dom` `^18 || ^19` (was `>=18`, which claimed every future major
  untested).
- `customerId` on `<PaymentMethodElement/>` is optional, as on
  `mountPaymentMethodElement`: the `client_secret` names the customer.
- `onChange` receives `{ complete, payment_method }`: the re-exported
  `ChangeEvent` follows `@billkit-eu/js` 1.0, which renamed `method`.
- The error for rendering outside a `<BillKitProvider>` names all three
  elements. It named only `<CheckoutElement/>`, which misled anyone who had
  rendered the other two.
- `engines.node` is `>=22`, for tooling only.
- `<BillKitProvider iframeOrigin>` is normalised and validated by
  `@billkit-eu/js` 1.0: reduced to its origin, and a value that is not an
  absolute https URL (plain `http` only on a loopback host) throws when an
  element mounts.
- An empty or blank `clientSecret` renders nothing and mounts nothing, so an
  element can be rendered while its secret is still being fetched; it mounts
  when a real one arrives. It threw out of the mount effect.

### Fixed
- The package typechecks against React 18's types as well as 19's. The
  container ref was declared in React 19's shape, which React 18's `<div ref>`
  refuses; the new CI leg found it.
- **Both bundles start with `"use client"`.** The provider calls
  `createContext` at module scope, so importing the package from a Next.js App
  Router server component failed, contrary to the README. The directive is
  emitted as a tsup banner and a test builds the package to check it is the
  first line of the ESM and CJS output, minified or not.
- **CommonJS consumers get CommonJS types.** `exports` now gives `require` the
  `dist/index.d.cts` types and `import` the `dist/index.d.ts` ones; before,
  a CJS project on `module: node16` got TS1479. No runtime change.
- **Removing `theme` resets the element.** Changing `theme` from a token set
  to `undefined` did nothing, so the old tokens stayed painted until a
  remount. It now sends an empty token set, which the element reads as its
  defaults.
- **Callbacks and the logger are captured on commit, not during render.**
  The hook wrote both refs while rendering, so a render React threw away (a
  transition a sibling suspended, a concurrent render it restarted) still
  routed the live element's events to the closures of a tree the page never
  showed. They are written in a layout effect now, which runs before any
  message from the iframe can arrive.
- `package.json` is in the `exports` map, so tooling that reads
  `@billkit-eu/react/package.json` resolves it.

### Upgrading from 0.x

**Install `@billkit-eu/js` 1.x** alongside this package; the 0.x loader no
longer satisfies the peer range. Its own breaking changes (the removed
protocol exports) apply here too, since its types are re-exported.

```bash
npm install @billkit-eu/react@^1 @billkit-eu/js@^1
```

**`customerId` is optional** on `<PaymentMethodElement/>`; drop it.

```tsx
// 0.x
<PaymentMethodElement clientSecret={clientSecret} customerId="cus_123" />
// 1.0
<PaymentMethodElement clientSecret={clientSecret} />
```

**React 20 is not admitted** by the peer range until it is tested. On 18 or
19 nothing changes.

## [0.3.0] - 2026-10-09

### Added
- `<OneShotPaymentElement/>`, the embedded form for a one-off payment created
  with `POST /v1/checkout/one_shot` and `ui_mode: "embedded"`. Same props, ref
  and SSR-safe mounting as `<CheckoutElement/>`; `onSuccess` receives
  `{ oneShotPaymentId, paymentStatus }`. `OneShotSuccessEvent` and
  `ElementPropsBase` are exported.

### Changed
- **The `@billkit-eu/js` peer range is now `>=0.4.0 <1`** (it was `>=0.3.0 <1`),
  because 0.4.0 is the first release with `mountOneShotPaymentElement`.
  Upgrade `@billkit-eu/js` together with this package: npm reports a peer
  conflict against 0.3.x, and nothing else about your integration changes.

## [0.2.3] - 2026-09-23

### Fixed
- **The package type-checks against React 19 again.**
  - `useRef<T>(null)` returns `RefObject<T | null>` in React 19 and
    `RefObject<T>` in React 18. The internal element hook declared the
    narrower spelling, so building this package's source against React 19
    failed with:

    ```
    error TS2322: Type 'RefObject<HTMLDivElement | null>' is not assignable
                  to type 'RefObject<HTMLDivElement>'.
    ```

  - The wider spelling is correct under **both**: React 18's `RefObject<T>`
    already declared `current` as `T | null`, so the two only ever differed in
    what they admitted.
  - Nothing in the published `.d.ts` changes (the hook is internal), but
    `files` ships `src/`, and the peer range has said `react: >=18` since
    0.1.0.

### Changed
- **The test matrix installs React 19**, not 18.
  - 0.2.2 fixed a React 19 type break while the dev dependency pinned
    `@types/react` to `^18`, so the gate could not have caught that break or
    this one: a type **removal** is invisible to the older types, and code
    written against them keeps compiling.
  - React 19 is the edge the peer range has to keep admitting, and code that
    passes under its types passes under 18's.

## [0.2.2] - 2026-09-22

### Fixed
- `<BillKitProvider>` is typed `ReactElement` rather than the global
  `JSX.Element`, which React 19's type packages no longer declare.
- The package doc comment had a half-finished sentence left mid-edit.

## [0.2.1]

### Changed
- Documentation only. API keys are now `bk_live_…` / `bk_test_…` and webhook
  signing secrets `bkwhsec_…`; every example here used the previous
  Stripe-shaped `sk_`/`whsec_` spelling. No code in this package changed: it
  never parsed the prefix, it forwards the key as a bearer token.

## [0.2.0]

## [0.1.0]

First public release.

### Added
- `<BillKitProvider>`: holds the shared element configuration (origin
  overrides, logger) for the tree below it, so individual elements take only
  the props that vary. Shaped after `@stripe/react-stripe-js` `<Elements>`,
  which is the API most teams are migrating from, but with **no
  `publishableKey`**: BillKit has no publishable-key concept, and elements
  authenticate with the session's ephemeral `client_secret` instead.
- `<CheckoutElement/>` and `<PaymentMethodElement/>`: React wrappers over the
  corresponding `@billkit-eu/js` mounts, with the iframe's lifecycle tied to
  the component's.
- `useBillKit()` for reading the provider's context, and the `ReactElementProps`
  type for components that wrap an element of their own.
- Server rendering support: elements render `null` on the server and mount the
  iframe after hydration, so importing this package does not break an SSR build
  or produce a hydration mismatch.
- Callback props are held in refs internally, so passing a new inline arrow
  function on every render does not tear down and remount the iframe. This is
  the failure mode that makes naive wrappers lose payment state mid-entry.
- The `@billkit-eu/js` types are re-exported (`BillKitElementHandle`,
  `BillKitThemeTokens`, `SuccessEvent`, `ChangeEvent`, `BillKitElementError`,
  `BillKitElementLogger`, `ElementLogContext`), so consumers import from one
  package.
- React `>=18` (the peer range; the suite runs against 18), ESM + CJS dual
  package via `tsup`.

[1.0.0]: https://github.com/billkit-eu/billkit-react/compare/v0.3.0...v1.0.0
[0.3.0]: https://github.com/billkit-eu/billkit-react/compare/v0.2.3...v0.3.0
[0.2.3]: https://github.com/billkit-eu/billkit-react/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/billkit-eu/billkit-react/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/billkit-eu/billkit-react/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/billkit-eu/billkit-react/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/billkit-eu/billkit-react/releases/tag/v0.1.0
