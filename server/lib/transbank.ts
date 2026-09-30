import tbk from "transbank-sdk";
const { WebpayPlus, Options, Environment, IntegrationCommerceCodes, IntegrationApiKeys } = tbk as any;

function getOptions(): any {
  const env = process.env.TBK_ENVIRONMENT;
  if (env === "Production") {
    const commerceCode = process.env.TBK_COMMERCE_CODE;
    const apiKeySecret = process.env.TBK_API_KEY_SECRET;
    if (!commerceCode || !apiKeySecret) {
      throw new Error("TBK_COMMERCE_CODE y TBK_API_KEY_SECRET son requeridos en producción");
    }
    return new Options(commerceCode, apiKeySecret, Environment.Production);
  }
  return new Options(
    IntegrationCommerceCodes.WEBPAY_PLUS,
    IntegrationApiKeys.WEBPAY,
    Environment.Integration
  );
}

export interface WebpayCreateResult {
  token: string;
  url: string;
}

export async function webpayCreate(
  buyOrder: string,
  sessionId: string,
  amount: number,
  returnUrl: string
): Promise<WebpayCreateResult> {
  const options = getOptions();
  const tx = new WebpayPlus.Transaction(options);
  const response = await tx.create(buyOrder, sessionId, amount, returnUrl);
  return {
    token: response.token,
    url: response.url,
  };
}

export interface WebpayCommitResult {
  amount: number;
  status: string;
  buyOrder: string;
  sessionId: string;
  cardNumber: string;
  accountingDate: string;
  transactionDate: string;
  authorizationCode: string;
  paymentTypeCode: string;
  responseCode: number;
  installmentsNumber: number;
  installmentsAmount: number;
}

export async function webpayCommit(token: string): Promise<WebpayCommitResult> {
  const options = getOptions();
  const tx = new WebpayPlus.Transaction(options);
  const response = await tx.commit(token);
  return {
    amount: response.amount,
    status: response.status,
    buyOrder: response.buy_order,
    sessionId: response.session_id,
    cardNumber: response.card_detail?.card_number ?? "",
    accountingDate: response.accounting_date,
    transactionDate: response.transaction_date,
    authorizationCode: response.authorization_code,
    paymentTypeCode: response.payment_type_code,
    responseCode: response.response_code,
    installmentsNumber: response.installments_number ?? 1,
    installmentsAmount: response.installments_amount ?? 0,
  };
}

export async function webpayRefund(token: string, amount: number) {
  const options = getOptions();
  const tx = new WebpayPlus.Transaction(options);
  return tx.refund(token, amount);
}

export async function webpayStatus(token: string) {
  const options = getOptions();
  const tx = new WebpayPlus.Transaction(options);
  return tx.status(token);
}

export function isProduction() {
  return process.env.TBK_ENVIRONMENT === "Production";
}
