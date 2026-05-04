// Brighty Business API domain types. Field shapes mirror the OpenAPI 3.1.0
// spec served at https://apidocs.brighty.app/openapi.json. Optional fields
// are typed as `T | undefined` to keep strict + exactOptionalPropertyTypes
// ergonomic for tool handlers that forward partial server responses.

export interface Money {
  amount: string;
  currency: string;
}

export type CustomerAccountType = "CURRENT" | "SAVING";
// Back-compat alias retained for older imports; new code should use CustomerAccountType.
export type AccountType = CustomerAccountType;

export interface Account {
  id: string;
  balance: Money;
  holderId: string;
  ownerId: string;
  openedAt: string;
  type: CustomerAccountType;
  name?: string;
}

export type AccountAddressDesignation = "UNIVERSAL" | "SALARY" | "PERSONAL" | "VOID";

export interface AccountAddress {
  accountId: string;
  currency: string;
  type?: string;
  designation?: AccountAddressDesignation;
  iban?: string;
  bic?: string;
  bankName?: string;
  bankAddress?: string;
  accountNumber?: string;
  routingNumber?: string;
  swiftCode?: string;
  beneficiaryName?: string;
  beneficiaryAddress?: string;
  reference?: string;
  network?: string;
  address?: string;
  memo?: string;
}

export type PayoutState = "CREATED" | "STARTED" | "COMPLETED";

export interface Payout {
  id: string;
  createdAt: string;
  state: PayoutState;
  paidTransfers: number;
  totalTransfers: number;
  name?: string;
  description?: string;
  paidAmount?: Money;
  totalAmount?: Money;
  startedAt?: string;
  completedAt?: string;
}

export interface GetPayoutsResponse {
  payouts: Payout[];
  nextPage?: string;
}

export type PayoutTransferType = "Crypto" | "Fiat" | "Internal";

export interface PayoutTransferDetailed {
  type: PayoutTransferType;
  id?: string;
  sourceAccountId?: string;
  amount?: Money;
  reference?: string;
  comment?: string;
  receiverUsername?: string;
  beneficiaryId?: string;
  state?: string;
  createdAt?: string;
  [key: string]: unknown;
}

export interface GetPayoutResponse {
  payout: Payout;
  transfers: PayoutTransferDetailed[];
}

export interface TransferPostponedResponse {
  id: string;
  createdAt: string;
}

export type TransferNetworkId =
  | "SEPA"
  | "SWIFT"
  | "FASTER_PAYMENTS"
  | "ACH"
  | "BTC"
  | "ETH"
  | "TRX"
  | string;

export interface FiatBeneficiary {
  kind: "FIAT";
  beneficiaryName: string;
  iban?: string;
  accountNumber?: string;
  bic?: string;
  swiftCode?: string;
  routingNumber?: string;
  bankName?: string;
  beneficiaryAddress?: string;
  isBusinessRecipient?: boolean;
}

export interface CryptoBeneficiary {
  kind: "CRYPTO";
  beneficiaryName?: string;
  accountNumber: string;
  transferNetworkId: TransferNetworkId;
  memo?: string;
  isBusinessRecipient?: boolean;
}

export type Beneficiary = FiatBeneficiary | CryptoBeneficiary;

export type CardState = "ISSUED" | "CREATED" | "ACTIVE" | "ACTIVATING" | "FROZEN" | "TERMINATED";
// Back-compat alias
export type CardStatus = CardState;

export type CardType = "DEBIT" | "CREDIT" | "PREPAID";

export type CardNetwork = "VISA" | "MASTERCARD";

export type FormFactor = "VIRTUAL" | "PLASTIC" | "METAL";
// Back-compat alias for older callers using `kind`.
export type CardKind = FormFactor;

export interface CardDesign {
  id: string;
  name?: string;
  formFactor?: FormFactor;
  imageUrl?: string;
  available?: boolean;
}

export type CardLimitsName = "UNLIMITED" | "MONTHLY";

export interface CardLimits {
  name: CardLimitsName;
  limit?: Money;
}

export interface Card {
  id: string;
  name: string;
  type: CardType;
  network: CardNetwork;
  formFactor: FormFactor;
  status: CardState;
  cardOwnerId: string;
  cardHolderId: string;
  cardHolderName: string;
  cardDesign: CardDesign;
  createdAt: string;
  bin?: string;
  lastFour?: string;
  availableAmount?: Money;
  limitAmount?: Money;
  activatedAt?: string;
  issuedAt?: string;
  expirationDate?: string;
  statusReason?: string;
  spendingLimit?: unknown;
  spendingStrategy?: unknown;
  securityPolicy?: unknown;
}

export interface CardOrderFee {
  description?: string;
  amount: Money;
}

export interface CardOrderIntent {
  hash: string;
  amount: Money;
  fees: Record<string, unknown>;
  holderNameValidity?: unknown;
  remainingLimits?: unknown;
}

export interface CardOrderResponse {
  card: Card;
}

export interface CardProductCondition {
  id?: string;
  code?: string;
  formFactor?: FormFactor;
  cardType?: CardType;
  cardIssuer?: string;
  freeLimit?: number;
  totalLimit?: number;
  issueFee?: Money;
  deliveryFee?: Money;
  usage?: unknown;
}

export interface CardProduct {
  conditions: CardProductCondition[];
}

export interface CardProductResponse {
  product: CardProduct;
}
// Back-compat alias for older callers using VirtualCardProduct.
export type VirtualCardProduct = CardProduct;

export type MembershipRole = "MEMBER" | "VIEWER" | "PAYER" | "ADMIN" | "OWNER";
// Back-compat alias retained for older imports.
export type MemberRole = MembershipRole;

export interface MembershipState {
  memberId: string;
  role: MembershipRole;
  state: string;
}
// Back-compat name; AddMembers returns this list.
export type AddMembersResponse = MembershipState[];

export interface Member {
  contact?: unknown;
  customer?: unknown;
  legalData?: unknown;
  membership: MembershipState;
}

export interface MemberData {
  email: string;
  role: MembershipRole;
  birthInfo?: unknown;
  legalName?: unknown;
  nationality?: string;
}

export type TransferSide = "SELL" | "BUY";

export interface OwnTransferIntentRequest {
  amount: Money;
  side: TransferSide;
  sourceCurrency: string;
  targetCurrency: string;
}

export interface Quote {
  sourceAmount: Money;
  targetAmount: Money;
  fx?: unknown;
}

export interface TransferIntentFee {
  description?: string;
  amount: Money;
}

export interface OwnTransferIntent {
  amount: Money;
  quote: Quote;
  fees: TransferIntentFee[];
  deliveryInfo: { estimatedDeliveryDate: string };
  hash: string;
}
// Back-compat alias for older imports.
export type TransferIntent = OwnTransferIntent;

export interface OwnTransferCreated {
  transactionId: string;
  transactionState: string;
  createdAt: string;
}
// Back-compat alias for older imports.
export type OwnTransfer = OwnTransferCreated;

export interface ListAccountsResponse {
  accounts: Account[];
}

export interface ListAccountAddressesResponse {
  addresses: AccountAddress[];
}

export interface ListMembersResponse {
  members: Member[];
}

export interface ListCardsResponse {
  cards: Card[];
}

export interface ListCardDesignsResponse {
  cardDesigns: CardDesign[];
}

// Brighty's universal error envelope. Every 4xx/5xx body looks like this —
// see https://apidocs.brighty.app/docs/api/schemas/apierror. There is no
// top-level `message` field; human text lives in `description`.
export interface ApiError {
  errorCode: number;
  name: string;
  description: string;
  params?: Record<string, unknown>;
}
