import { useParams } from "react-router-dom";
import { useForm, useField } from "@shopify/react-form";
import { CurrencyCode } from "@shopify/react-i18n";
import { Redirect } from "@shopify/app-bridge/actions";
import { useAppBridge } from "@shopify/app-bridge-react";
import {
  ActiveDatesCard,
  CombinationCard,
  DiscountClass,
  DiscountMethod,
  MethodCard,
  DiscountStatus,
  RequirementType,
  SummaryCard,
  UsageLimitsCard,
  onBreadcrumbAction,
} from "@shopify/discount-app-components";
import {
  Banner,
  AlphaCard,
  Layout,
  Page,
  TextField,
  VerticalStack,
  PageActions,
  Text,
} from "@shopify/polaris";

import { useAuthenticatedFetch } from "../../../hooks";
import { VariantPicker } from "../../../components/VariantPicker";
import metafields, { shopMetafield } from "../../../../metafields";
import { useState } from "react";

const todaysDate = new Date();

export default function DiscountNew() {
  const { functionId } = useParams();
  const app = useAppBridge();
  const redirect = Redirect.create(app);
  const currencyCode = CurrencyCode.Cad;
  const authenticatedFetch = useAuthenticatedFetch();

  const [offeredProductId, setOfferedProductId] = useState(null);
  const [freeProductId, setFreeProductId] = useState(null);

  const {
    fields: {
      discountTitle,
      discountCode,
      discountMethod,
      combinesWith,
      requirementType,
      requirementSubtotal,
      requirementQuantity,
      usageTotalLimit,
      usageOncePerCustomer,
      startDate,
      endDate,
      configuration,
    },
    submit,
    submitting,
    dirty,
    reset,
    submitErrors,
    makeClean,
  } = useForm({
    fields: {
      discountTitle: useField(""),
      discountMethod: useField(DiscountMethod.Code),
      discountCode: useField(""),
      combinesWith: useField({
        orderDiscounts: false,
        productDiscounts: false,
        shippingDiscounts: false,
      }),
      requirementType: useField(RequirementType.None),
      requirementSubtotal: useField("0"),
      requirementQuantity: useField("0"),
      usageTotalLimit: useField(null),
      usageOncePerCustomer: useField(false),
      startDate: useField(todaysDate),
      endDate: useField(null),
    },
    onSubmit: async (form) => {
      if (!offeredProductId || !freeProductId) {
        return { status: "fail", errors: [{
          message: "You must select an offered product and a free product."
        }]};
      }

      if (offeredProductId == freeProductId) {
        return { status: "fail", errors: [{
          message: "Offered product and free product must be different."
        }]};
      }

      const discount = {
        functionId,
        combinesWith: form.combinesWith,
        startsAt: form.startDate,
        endsAt: form.endDate,
        metafields: [
          {
            namespace: metafields.namespace,
            key: metafields.key,
            type: 'json',
            value: JSON.stringify({
              offeredProductId,
              freeProductId,
            }),
          },
        ],
      };

      let shopInfo = await (await authenticatedFetch("/api/shop")).json();
      let shopMetafieldRequest = authenticatedFetch("/api/metafields/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metafields: [
            {
              ownerId: shopInfo.data.shop.id,
              namespace: shopMetafield.namespace,
              key: shopMetafield.key,
              value: JSON.stringify({
                offeredProductId,
                freeProductId
              }),
              type: "json"
            }
          ],
        }),
      });

      let discountRequest;
      if (form.discountMethod === DiscountMethod.Automatic) {
        discountRequest = authenticatedFetch("/api/discounts/automatic", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            discount: {
              ...discount,
              title: form.discountTitle,
            },
          }),
        });
      } else {
        discountRequest = authenticatedFetch("/api/discounts/code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            discount: {
              ...discount,
              title: form.discountCode,
              code: form.discountCode,
            },
          }),
        });
      }

      const responses = await Promise.all([discountRequest, shopMetafieldRequest])
        .then((results) => Promise.all(results.map((res) => res.json())));
      
      // check for any errors or user errors
      const errors = responses.flatMap((res) => res.errors);
      const userErrors = responses.flatMap((res) => res.data?.discountCreate?.userErrors ?? res.data?.metafieldsSet?.userErrors);
      const remoteErrors = (errors || userErrors).filter(Boolean);

      if (remoteErrors?.length > 0) {
        return { status: "fail", errors: remoteErrors };
      }

      redirect.dispatch(Redirect.Action.ADMIN_SECTION, {
        name: Redirect.ResourceType.Discount,
      });

      return { status: "success" };
    },
  });

  const errorBanner =
    submitErrors.length > 0 ? (
      <Layout.Section>
        <Banner status="critical">
          <p>There were some issues with your form submission:</p>
          <ul>
            {submitErrors.map(({ message }, index) => {
              return <li key={`${message}${index}`}>{message}</li>;
            })}
          </ul>
        </Banner>
      </Layout.Section>
    ) : null;

  return (
    <Page
      title="Create Free Gift Offer"
      breadcrumbs={[
        {
          content: "Discounts",
          onAction: () => onBreadcrumbAction(redirect, true),
        },
      ]}
      primaryAction={{
        content: "Save",
        onAction: submit,
        disabled: !dirty,
        loading: submitting,
      }}
    >
      <Layout>
        {errorBanner}
        <Layout.Section>
          <form onSubmit={submit}>
            <MethodCard
              title="Gift"
              discountTitle={discountTitle}
              discountClass={DiscountClass.Product}
              discountCode={discountCode}
              discountMethod={discountMethod}
            />
            <AlphaCard title="Gift">
              <VerticalStack>
                <VariantPicker title="Offered Product" onSelection={setOfferedProductId} />
                <VariantPicker title="Free Product" onSelection={setFreeProductId} />
              </VerticalStack>
            </AlphaCard>
            {discountMethod.value === DiscountMethod.Code && (
              <UsageLimitsCard
                totalUsageLimit={usageTotalLimit}
                oncePerCustomer={usageOncePerCustomer}
              />
            )}
            <CombinationCard
              combinableDiscountTypes={combinesWith}
              discountClass={DiscountClass.Product}
              discountDescriptor={
                discountMethod.value === DiscountMethod.Automatic
                  ? discountTitle.value
                  : discountCode.value
              }
            />
            <ActiveDatesCard
              startDate={startDate}
              endDate={endDate}
              timezoneAbbreviation="EST"
            />
          </form>
        </Layout.Section>
        <Layout.Section secondary>
          <SummaryCard
            header={{
              discountMethod: discountMethod.value,
              discountDescriptor:
                discountMethod.value === DiscountMethod.Automatic
                  ? discountTitle.value
                  : discountCode.value,
              appDiscountType: "VIP",
              isEditing: false,
            }}
            performance={{
              status: DiscountStatus.Scheduled,
              usageCount: 0,
            }}
            minimumRequirements={{
              requirementType: requirementType.value,
              subtotal: requirementSubtotal.value,
              quantity: requirementQuantity.value,
              currencyCode: currencyCode,
            }}
            usageLimits={{
              oncePerCustomer: usageOncePerCustomer.value,
              totalUsageLimit: usageTotalLimit.value,
            }}
            activeDates={{
              startDate: startDate.value,
              endDate: endDate.value,
            }}
          />
        </Layout.Section>
        <Layout.Section>
          <PageActions
            primaryAction={{
              content: "Save discount",
              onAction: submit,
              disabled: !dirty,
              loading: submitting,
            }}
            secondaryActions={[
              {
                content: "Discard",
                onAction: () => onBreadcrumbAction(redirect, true),
              },
            ]}
          />
        </Layout.Section>
      </Layout>
    </Page>
  );
}
