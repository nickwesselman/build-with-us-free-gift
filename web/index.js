// @ts-check
import { join } from "path";
import { readFileSync } from "fs";
import express from "express";
import serveStatic from "serve-static";

import shopify from "./shopify.js";
import productCreator from "./product-creator.js";
import GDPRWebhookHandlers from "./gdpr.js";

import { GraphqlQueryError } from '@shopify/shopify-api';

import metafields from "./metafields.js";

const CREATE_CODE_MUTATION = `
mutation CreateCodeDiscount($discount: DiscountCodeAppInput!) {
  discountCreate: discountCodeAppCreate(codeAppDiscount: $discount) {
    userErrors {
      code
      message
      field
    }
  }
}
`;
const CREATE_AUTOMATIC_MUTATION = `
mutation CreateAutomaticDiscount($discount: DiscountAutomaticAppInput!) {
  discountCreate: discountAutomaticAppCreate(
    automaticAppDiscount: $discount
  ) {
    userErrors {
      code
      message
      field
    }
  }
}
`;
const GET_DISCOUNT_QUERY = `
query GetDiscount($id: ID!) {
  discountNode(id: $id) {
    id
    configurationField: metafield(
      namespace: "${metafields.namespace}"
      key: "${metafields.key}"
    ) {
      id
      value
    }
    discount {
      __typename
      ... on DiscountAutomaticApp {
        title
        discountClass
        combinesWith {
          orderDiscounts
          productDiscounts
          shippingDiscounts
        }
        startsAt
        endsAt
      }
      ... on DiscountCodeApp {
        title
        discountClass
        combinesWith {
          orderDiscounts
          productDiscounts
          shippingDiscounts
        }
        startsAt
        endsAt
        usageLimit
        appliesOncePerCustomer
        codes(first: 1) {
          nodes {
            code
          }
        }
      }
    }
  }
}
`;

const UPDATE_AUTOMATIC_MUTATION = `
mutation UpdateDiscount($id: ID!, $discount: DiscountAutomaticAppInput!) {
  discountUpdate: discountAutomaticAppUpdate(
    id: $id
    automaticAppDiscount: $discount
  ) {
    userErrors {
      code
      message
      field
    }
  }
}
`;

const UPDATE_CODE_MUTATION = `
mutation UpdateDiscount($id: ID!, $discount: DiscountCodeAppInput!) {
  discountUpdate: discountCodeAppUpdate(id: $id, codeAppDiscount: $discount) {
    userErrors {
      code
      message
      field
    }
  }
}
`;

const DELETE_AUTOMATIC_MUTATION = `
mutation DeleteDiscount($id: ID!) {
  discountDelete: discountAutomaticDelete(id: $id) {
    userErrors {
      code
      message
      field
    }
  }
}
`;

const DELETE_CODE_MUTATION = `
mutation DeleteDiscount($id: ID!) {
  discountDelete: discountCodeDelete(id: $id) {
    userErrors {
      code
      message
      field
    }
  }
}
`;

const GET_SHOP_QUERY = `
query {
	shop {
		id
	}
}
`;

const SET_METAFIELDS_MUTATION = `
mutation SetMetafields($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) {
    userErrors {
      field
      message
    }
  }
}
`;

const PORT = parseInt(process.env.BACKEND_PORT || process.env.PORT, 10);

const STATIC_PATH =
  process.env.NODE_ENV === "production"
    ? `${process.cwd()}/frontend/dist`
    : `${process.cwd()}/frontend/`;

const app = express();

// Set up Shopify authentication and webhook handling
app.get(shopify.config.auth.path, shopify.auth.begin());
app.get(
  shopify.config.auth.callbackPath,
  shopify.auth.callback(),
  shopify.redirectToShopifyOrAppRoot()
);
app.post(
  shopify.config.webhooks.path,
  shopify.processWebhooks({ webhookHandlers: GDPRWebhookHandlers })
);

// If you are adding routes outside of the /api path, remember to
// also add a proxy rule for them in web/frontend/vite.config.js

app.use("/api/*", shopify.validateAuthenticatedSession());

app.use(express.json());


const runGraphql = async (req, res, mutation) => {
  const graphqlClient = new shopify.api.clients.Graphql({
    session: res.locals.shopify.session
  });

  try {
    const data = await graphqlClient.query({
      data: {
        query: mutation,
        variables: req.body,
      },
    });

    res.send(data.body);
  } catch (error) {
    // Handle errors thrown by the graphql client
    if (!(error instanceof GraphqlQueryError)) {
      throw error;
    }
    return res.status(500).send({ error: error.response });
  } 
};

app.post("/api/discounts/code", async (req, res) => {
  await runGraphql(req, res, CREATE_CODE_MUTATION);
});

app.post("/api/discounts/automatic", async (req, res) => {
  await runGraphql(req, res, CREATE_AUTOMATIC_MUTATION);
});

function idToGid(resource, id) {
  return `gid://shopify/${resource}/${id}`;
}

app.get("/api/discounts/:discountId", async (req, res) => {
  req.body = {
    id: idToGid("DiscountNode", req.params.discountId),
  };

  await runGraphql(req, res, GET_DISCOUNT_QUERY);
});

app.post("/api/discounts/automatic/:discountId", async (req, res) => {
  req.body.id = idToGid("DiscountAutomaticApp", req.params.discountId);

  await runGraphql(req, res, UPDATE_AUTOMATIC_MUTATION);
});

app.post("/api/discounts/code/:discountId", async (req, res) => {
  req.body.id = idToGid("DiscountCodeApp", req.params.discountId);

  await runGraphql(req, res, UPDATE_CODE_MUTATION);
});

app.delete("/api/discounts/automatic/:discountId", async (req, res) => {
  req.body.id = idToGid("DiscountAutomaticApp", req.params.discountId);

  await runGraphql(req, res, DELETE_AUTOMATIC_MUTATION);
});

app.delete("/api/discounts/code/:discountId", async (req, res) => {
  req.body.id = idToGid("DiscountCodeApp", req.params.discountId);

  await runGraphql(req, res, DELETE_CODE_MUTATION);
});

app.get("/api/shop", async (req, res) => {
  await runGraphql(req, res, GET_SHOP_QUERY);
});

app.post("/api/metafields/set", async (req, res) => {
  await runGraphql(req, res, SET_METAFIELDS_MUTATION);
});

app.get("/api/products/count", async (_req, res) => {
  const countData = await shopify.api.rest.Product.count({
    session: res.locals.shopify.session,
  });
  res.status(200).send(countData);
});

app.get("/api/products/create", async (_req, res) => {
  let status = 200;
  let error = null;

  try {
    await productCreator(res.locals.shopify.session);
  } catch (e) {
    console.log(`Failed to process products/create: ${e.message}`);
    status = 500;
    error = e.message;
  }
  res.status(status).send({ success: status === 200, error });
});

app.use(shopify.cspHeaders());
app.use(serveStatic(STATIC_PATH, { index: false }));

app.use("/*", shopify.ensureInstalledOnShop(), async (_req, res, _next) => {
  return res
    .status(200)
    .set("Content-Type", "text/html")
    .send(readFileSync(join(STATIC_PATH, "index.html")));
});

app.listen(PORT);
