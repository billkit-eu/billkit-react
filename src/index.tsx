/**
 * `@billkit-eu/react`: React bindings for BillKit's embedded checkout.
 *
 * `@stripe/react-stripe-js`-shaped: wrap your tree in
 * `<BillKitProvider>` and drop in `<CheckoutElement/>` (or
 * `<OneShotPaymentElement/>` for a one-off payment). SSR-safe: the
 * elements render `null` on the server and mount the js.billkit.eu
 * iframe after hydration.
 *
 * @packageDocumentation
 */

export {
  BillKitProvider,
  type BillKitContextValue,
  type BillKitProviderProps,
  useBillKit,
} from "./BillKitProvider";
export { CheckoutElement, type CheckoutElementProps } from "./CheckoutElement";
export {
  OneShotPaymentElement,
  type OneShotPaymentElementProps,
} from "./OneShotPaymentElement";
export {
  PaymentMethodElement,
  type PaymentMethodElementProps,
} from "./PaymentMethodElement";
export type {
  BillKitElementRef,
  ElementPropsBase,
  ReactElementProps,
  ThemeableElementRef,
} from "./useElement";
// Re-export the loader's shared types so consumers import from one place.
export type {
  BillKitElementError,
  BillKitElementHandle,
  BillKitElementLogger,
  BillKitThemeTokens,
  ChangeEvent,
  ElementLogContext,
  OneShotSuccessEvent,
  SuccessEvent,
} from "@billkit-eu/js";
