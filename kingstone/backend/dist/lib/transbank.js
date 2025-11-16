"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.webpayTransaction = void 0;
const transbank_sdk_1 = require("transbank-sdk");
const commerceCode = process.env.WEBPAY_COMMERCE_CODE ?? transbank_sdk_1.IntegrationCommerceCodes.WEBPAY_PLUS;
const apiKey = process.env.WEBPAY_API_KEY ?? transbank_sdk_1.IntegrationApiKeys.WEBPAY;
const environment = (process.env.WEBPAY_ENVIRONMENT ?? process.env.WEBPAY_ENV ?? 'integration').toLowerCase();
function buildTransaction() {
    if (environment === 'production') {
        return transbank_sdk_1.WebpayPlus.Transaction.buildForProduction(commerceCode, apiKey);
    }
    return transbank_sdk_1.WebpayPlus.Transaction.buildForIntegration(commerceCode, apiKey);
}
/**
 * Shared instance to interact with Webpay Plus.
 * Defaults to ambiente de integracion si no se configura explicitamente.
 */
exports.webpayTransaction = buildTransaction();
