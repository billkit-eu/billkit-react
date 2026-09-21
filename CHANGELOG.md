# Changelog

All notable changes to the BillKit React SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This package is a thin binding layer over `@billkit-eu/js`, which it takes as a
peer dependency. Behaviour changes usually land there and are recorded in that
package's changelog.

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
  which is the API most teams are migrating from — but with **no
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

[Unreleased]: https://github.com/billkit-eu/billkit-react/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/billkit-eu/billkit-react/releases/tag/v0.1.0
