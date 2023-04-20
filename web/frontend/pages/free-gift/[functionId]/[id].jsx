import { useState } from "react";
import { useForm, useField } from "@shopify/react-form";
import { useParams } from "react-router-dom";
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
  Layout,
  Page,
  TextField,
  Stack,
  PageActions,
  Spinner,
  Modal,
  TextContainer,
  AlphaCard,
  VerticalStack,
} from "@shopify/polaris";

import { VariantPicker } from "../../../components/VariantPicker";
import metafields, { shopMetafield } from "../../../../metafields";
import { useAuthenticatedFetch, useDiscount } from "../../../hooks";

const todaysDate = new Date();

export default function DiscountNew() {
  const app = useAppBridge();
  const redirect = Redirect.create(app);
  const currencyCode = CurrencyCode.Cad;
  const authenticatedFetch = useAuthenticatedFetch();
  const { id } = useParams();
  const { discount, isLoading } = useDiscount(id);
  const [deleteModalActive, setDeleteModalActive] = useState(false);
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
      discountTitle: useField(discount?.title || ""),
      discountMethod: useField(discount?.method || DiscountMethod.Code),
      discountCode: useField(discount?.code || ""),
      combinesWith: useField(
        discount?.combinesWith || {
          orderDiscounts: false,
          productDiscounts: false,
          shippingDiscounts: false,
        }
      ),
      requirementType: useField(RequirementType.None),
      requirementSubtotal: useField("0"),
      requirementQuantity: useField("0"),
      usageTotalLimit: useField(discount?.usageLimit || null),
      usageOncePerCustomer: useField(discount?.appliesOncePerCustomer || false),
      startDate: useField(discount?.startsAt || todaysDate),
      endDate: useField(discount?.endsAt || null),
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

      const updatedDiscount = {
        combinesWith: form.combinesWith,
        startsAt: form.startDate,
        endsAt: form.endDate,
        metafields: [
          {
            id: discount.configurationId, // metafield id is required for update
            namespace: metafields.namespace,
            key: metafields.key,
            type: "json",
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

      let uri = `/api/discounts/`;
      if (form.discountMethod === DiscountMethod.Code) {
        uri += "code/";

        updatedDiscount.usageLimit = parseInt(form.usageTotalLimit);
        updatedDiscount.appliesOncePerCustomer = form.usageOncePerCustomer;
        updatedDiscount.code = form.discountCode;
        updatedDiscount.title = form.discountCode;
      } else {
        uri += "automatic/";

        updatedDiscount.title = form.discountTitle;
      }

      let discountRequest = authenticatedFetch(uri + id, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discount: updatedDiscount }),
      });

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

  const handleDeleteDiscount = async () => {
    // TODO: Clear the shop metafield as well
    await authenticatedFetch(
      `/api/discounts/${
        discountMethod.value === DiscountMethod.Automatic ? "automatic" : "code"
      }/${discount.id}`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      }
    );

    redirect.dispatch(Redirect.Action.ADMIN_SECTION, {
      name: Redirect.ResourceType.Discount,
    });
  };

  const toggleDeleteModalActive = () => {
    setDeleteModalActive((deleteModalActive) => !deleteModalActive);
  };

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
      title="Edit VIP discount"
      breadcrumbs={[
        {
          content: "Discounts",
          onAction: () => onBreadcrumbAction(redirect, true),
        },
      ]}
      primaryAction={{
        content: "Save",
        onAction: submit,
        loading: submitting,
      }}
    >
      {isLoading && (
        <Layout>
          <Stack distribution="center">
            <Spinner size="large" />
          </Stack>
        </Layout>
      )}

      {!isLoading && (
        <Layout>
          {errorBanner}
          <Layout.Section>
            <form onSubmit={submit}>
              <MethodCard
                title="Free Gift"
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
                loading: submitting,
              }}
              secondaryActions={[
                {
                  content: "Delete",
                  destructive: true,
                  onAction: toggleDeleteModalActive,
                },
              ]}
            />
          </Layout.Section>

          <Modal
            small
            open={deleteModalActive}
            onClose={toggleDeleteModalActive}
            title="Delete discount"
            primaryAction={{
              content: "Delete",
              destructive: true,
              onAction: handleDeleteDiscount,
            }}
            secondaryActions={[
              {
                content: "Cancel",
                onAction: toggleDeleteModalActive,
              },
            ]}
          >
            <Modal.Section>
              <TextContainer>
                <p>Are you sure you want to delete this discount?</p>
              </TextContainer>
            </Modal.Section>
          </Modal>
        </Layout>
      )}
    </Page>
  );
}
