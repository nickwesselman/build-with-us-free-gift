import React, { useEffect, useState } from "react";
import {
  render,
  Divider,
  Image,
  Banner,
  Heading,
  Button,
  InlineLayout,
  BlockStack,
  Text,
  SkeletonText,
  SkeletonImage,
  useCartLines,
  useApplyCartLinesChange,
  useApplyAttributeChange,
  useExtensionApi,
} from "@shopify/checkout-ui-extensions-react";

// Set up the entry point for the extension
render("Checkout::Dynamic::Render", () => <App />);

// The function that will render the app
function App() {
  // Use `query` for fetching product data from the Storefront API, and use `i18n` to format
  // currencies, numbers, and translate strings
  const { query, i18n } = useExtensionApi();
  // Get a reference to the functions that will apply changes to the cart from the imported hooks
  const applyCartLinesChange = useApplyCartLinesChange();
  const applyAttributeChange = useApplyAttributeChange();
  // Set up the states
  const [offeredProduct, setOfferedProduct] = useState(null);
  const [freeProduct, setFreeProduct] = useState(null);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [showError, setShowError] = useState(false);

  // On initial load, fetch the product variants
  useEffect(() => {
    // Set the loading state to show some UI if you're waiting
    setLoading(true);

    // Use `query` api method to send graphql queries to the Storefront API
    query(
      `fragment VariantFields on ProductVariant {
        id
        title
        image {
          url
        }
        price {
          amount
        }
      }
      
      query($offeredProductId: ID!, $freeProductId: ID!) {
        offeredProduct: node(id: $offeredProductId) {
          ... VariantFields
        }
        freeProduct: node(id: $freeProductId) {
          ... VariantFields
        }
      }`,
      {
        variables: {
          offeredProductId: "gid://shopify/ProductVariant/44983224303906",
          freeProductId: "gid://shopify/ProductVariant/44983223451938"
        },
      },
    )
    .then(({data}) => {
      setOfferedProduct(data.offeredProduct);
      setFreeProduct(data.freeProduct);
    })
    .catch((error) => console.error(error))
    .finally(() => setLoading(false));
  }, []);

  // If an offer is added and an error occurs, then show some error feedback using a banner
  useEffect(() => {
    if (showError) {
      const timer = setTimeout(() => setShowError(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [showError]);

  // Access the current cart lines and subscribe to changes
  const lines = useCartLines();

  // Show a loading UI if you're waiting for product variant data
  // Use Skeleton components to keep placement from shifting when content loads
  if (loading) {
    return (
      <BlockStack spacing="loose">
        <Divider />
        <Heading level={2}>Add to your cart to get a free gift!</Heading>
        <BlockStack spacing="loose">
          <InlineLayout
            spacing="base"
            columns={[64, "fill", "auto"]}
            blockAlignment="center"
          >
            <SkeletonImage aspectRatio={1} />
            <BlockStack spacing="none">
              <SkeletonText inlineSize="large" />
              <SkeletonText inlineSize="small" />
            </BlockStack>
            <Button kind="secondary" disabled={true}>
              Add
            </Button>
          </InlineLayout>
        </BlockStack>
      </BlockStack>
    );
  }
  // If product variants can't be loaded, then show nothing
  if (!loading && (offeredProduct == null || freeProduct == null)) {
    return null;
  }

  // Get the IDs of all product variants in the cart
  const cartLineProductVariantIds = lines.map((item) => item.merchandise.id);
  
  // If offered product is in the cart, then don't show the offer
  if (cartLineProductVariantIds.includes(offeredProduct.id)) {
    return null;
  }

  // Localize the currency for international merchants and customers
  const renderPrice = i18n.formatCurrency(offeredProduct.price.amount);

  // Use the first product image or a placeholder if the product has no images
  const imageUrl = offeredProduct.image?.url
    ?? "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_medium.png?format=webp&v=1530129081";

  return (
    <BlockStack spacing="loose">
      <Divider />
      <Heading level={2}>Add to your cart to get a free gift!</Heading>
      <BlockStack spacing="loose">
        <InlineLayout
          spacing="base"
          // Use the `columns` property to set the width of the columns
          // Image: column should be 64px wide
          // BlockStack: column, which contains the title and price, should "fill" all available space
          // Button: column should "auto" size based on the intrinsic width of the elements
          columns={[64, "fill", "auto"]}
          blockAlignment="center"
        >
          <Image
            border="base"
            borderWidth="base"
            borderRadius="loose"
            source={imageUrl}
            description={offeredProduct.title}
            aspectRatio={1}
          />
          <BlockStack spacing="none">
            <Text size="medium" emphasis="strong">
              {offeredProduct.title}
            </Text>
            <Text appearance="subdued">{renderPrice}</Text>
          </BlockStack>
          <Button
            kind="secondary"
            loading={adding}
            accessibilityLabel={`Add ${offeredProduct.title} to cart`}
            onPress={async () => {
              setAdding(true);
              // Apply the cart lines change
              const results = await Promise.all([
                await applyCartLinesChange({
                  type: "addCartLine",
                  merchandiseId: offeredProduct.id,
                  quantity: 1,
                }),
                await applyCartLinesChange({
                  type: "addCartLine",
                  merchandiseId: freeProduct.id,
                  quantity: 1,
                }),
                await applyAttributeChange({
                  type: "updateAttribute",
                  key: "__IsUpsellPromo",
                  value: "true"
                }),
              ]);
              setAdding(false);
              const errors = results
                .filter((result) => result.type === "error")
                .map((result) => result.message);
              if (errors) {
                // An error occurred adding the cart line
                // Verify that you're using a valid product variant ID
                // For example, 'gid://shopify/ProductVariant/123'
                setShowError(true);
                errors.forEach(console.error);
              }
            }}
          >
            Add
          </Button>
        </InlineLayout>
      </BlockStack>
      {showError && (
        <Banner status="critical">
          There was an issue adding this product. Please try again.
        </Banner>
      )}
    </BlockStack>
  );
}
