import {
  IntegrationApiKeys,
  IntegrationCommerceCodes,
  WebpayPlus,
} from 'transbank-sdk';

const commerceCode =
  process.env.WEBPAY_COMMERCE_CODE ?? IntegrationCommerceCodes.WEBPAY_PLUS;
const apiKey = process.env.WEBPAY_API_KEY ?? IntegrationApiKeys.WEBPAY;
const environment =
  (process.env.WEBPAY_ENVIRONMENT ?? process.env.WEBPAY_ENV ?? 'integration').toLowerCase();

function buildTransaction() {
  if (environment === 'production') {
    return WebpayPlus.Transaction.buildForProduction(commerceCode, apiKey);
  }
  return WebpayPlus.Transaction.buildForIntegration(commerceCode, apiKey);
}

/**
 * Shared instance to interact with Webpay Plus.
 * Defaults to ambiente de integracion si no se configura explicitamente.
 */
export const webpayTransaction = buildTransaction();
