import { React, useState } from "react";
import {
    CalloutCard
} from "@shopify/polaris";
import { ResourcePicker } from "@shopify/app-bridge-react";

export function VariantPicker({ title, onSelection }) {
    const [currentProduct, setCurrentProduct] = useState(null);
    const [open, setOpen] = useState(false);

    const selectProduct = (select) => {
        setCurrentProduct(select.selection[0]);
        setOpen(false);
        onSelection(select.selection[0]?.id);
    };

    return (
        <CalloutCard
            title={title}
            illustration={currentProduct?.image?.originalSrc ?? "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_medium.png?format=webp&v=1530129081"}
            primaryAction={{
                content: 'Select variant',
                onAction: () => setOpen(true)
            }}
        >
            {currentProduct?.displayName ?? "You must select a product."}

            <ResourcePicker
                resourceType="ProductVariant"
                selectMultiple={false}
                initialSelectionIds={currentProduct ? [{id: currentProduct.id}] : []}
                onSelection={selectProduct}
                onCancel={() => setOpen(false)}
                open={open}
            />
        </CalloutCard>

    );
}