// @ts-check
import { DiscountApplicationStrategy } from "../generated/api";

/**
 * @typedef {import("../generated/api").InputQuery} InputQuery
 * @typedef {import("../generated/api").FunctionResult} FunctionResult
 * @typedef {import("../generated/api").InputQuery["cart"]["lines"]} CartLines
 * @typedef {{id: string}} ProductVariant
 */

/**
 * @type {FunctionResult}
 */
const EMPTY_DISCOUNT = {
  discountApplicationStrategy: DiscountApplicationStrategy.First,
  discounts: [],
};

export default /**
 * @param {InputQuery} input
 * @returns {FunctionResult}
 */
(input) => {
  // const configuration = JSON.parse(
  //   input?.discountNode?.metafield?.value ?? "{}"
  // );

  // upsell has not been applied to the cart
  if (input.cart.isUpsellPromo?.value !== 'true') {
    console.error('Cart does not have an upsell promo.');
    return EMPTY_DISCOUNT;
  }

  const getMerchandiseWithId = /**
    * @param {CartLines} lines
    * @param {string} id
    */
   (lines, id) =>
    lines
      .filter((line) => line.merchandise.__typename == 'ProductVariant' && line.merchandise.id == id)
      .map((line) => /** @type {ProductVariant} */ (line.merchandise))[0];

  const offeredProduct = getMerchandiseWithId(input.cart.lines, 'gid://shopify/ProductVariant/44983224303906');
  const freeProduct = getMerchandiseWithId(input.cart.lines, 'gid://shopify/ProductVariant/44983223451938');

  // required products are not in the cart
  if (!offeredProduct || !freeProduct) {
    console.error('Cart does not contain required products');
    return EMPTY_DISCOUNT;
  }

  return {
    discountApplicationStrategy: DiscountApplicationStrategy.Maximum,
    discounts: [
      {
        value: {
          percentage: {
            value: 100
          }
        },
        targets: [
          {
            productVariant: {
              id: freeProduct.id
            }
          }
        ],
        message: `Free Gift`
      }
    ]
  };
};