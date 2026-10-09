import { mountOneShotPaymentElement, type OneShotSuccessEvent } from "@billkit-eu/js";
import { forwardRef, useImperativeHandle } from "react";
import {
  type BillKitElementRef,
  checkoutElementRef,
  type ElementPropsBase,
  useElement,
} from "./useElement";

/**
 * Props of `<OneShotPaymentElement/>`: the same as `<CheckoutElement/>`,
 * except `clientSecret` comes from `POST /v1/checkout/one_shot` with
 * `ui_mode: "embedded"` and `onSuccess` receives `oneShotPaymentId`.
 */
export type OneShotPaymentElementProps = ElementPropsBase<OneShotSuccessEvent>;

/**
 * A one-off payment form (no subscription, no saved mandate), as a React
 * component. Same SSR-safe mounting, ref and remount rules as
 * {@link CheckoutElement}.
 *
 * ```tsx
 * <BillKitProvider>
 *   <OneShotPaymentElement
 *     clientSecret={clientSecret}
 *     onSuccess={({ oneShotPaymentId }) => router.push(`/thanks?p=${oneShotPaymentId}`)}
 *     onError={({ code, message }) => toast(message)}
 *   />
 * </BillKitProvider>
 * ```
 *
 * A decline is final for one one-shot: `onError({ code: "payment_declined" })`
 * leaves a panel with no retry, so create a new one-shot (and pass its new
 * `clientSecret`, which remounts the element) to let the buyer try again.
 */
export const OneShotPaymentElement = forwardRef<BillKitElementRef, OneShotPaymentElementProps>(
  function OneShotPaymentElement(props, ref) {
    const { isClient, containerRef, handleRef } = useElement<OneShotSuccessEvent>(
      mountOneShotPaymentElement,
      props,
    );
    useImperativeHandle(ref, () => checkoutElementRef(handleRef), []);
    if (!isClient) return null;
    return <div ref={containerRef} className={props.className} style={props.style} />;
  },
);
