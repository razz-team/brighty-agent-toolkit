// Brighty domain types. Field shapes mirror the Brighty REST API as exposed
// by api.brighty.app. Optional fields are typed as `T | undefined` to keep
// strict + exactOptionalPropertyTypes ergonomic for tool handlers that
// forward partial server responses.

export interface Money {
  amount: string;
  currency: string;
}

export type AccountType = "CURRENT" | "SAVING";

export type AccountStatus = "ACTIVE" | "TERMINATED" | "PENDING" | "BLOCKED";

export interface Account {
  id: string;
  name?: string;
  type: AccountType;
  currency: string;
  balance: Money;
  availableBalance?: Money;
  status: AccountStatus;
  isPrimary?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface AccountAddress {
  accountId: string;
  currency: string;
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

export type PayoutStatus = "DRAFT" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

export type PayoutTransferStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED";

export type PayoutTransferKind = "INTERNAL" | "EXTERNAL";

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

export interface PayoutTransfer {
  id: string;
  payoutId: string;
  kind: PayoutTransferKind;
  status: PayoutTransferStatus;
  sourceAccountId: string;
  amount: Money;
  reference?: string;
  recipientAccountId?: string;
  recipientTag?: string;
  beneficiary?: Beneficiary;
  idempotencyKey?: string;
  failureReason?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Payout {
  id: string;
  name?: string;
  status: PayoutStatus;
  totalsByCurrency?: Money[];
  transfersCount?: number;
  transfers?: PayoutTransfer[];
  createdAt: string;
  updatedAt?: string;
  startedAt?: string;
  completedAt?: string;
}

export type CardStatus = "ACTIVE" | "FROZEN" | "TERMINATED" | "PENDING" | "ORDERED";

export type CardKind = "VIRTUAL" | "PHYSICAL";

export interface CardLimits {
  daily?: Money;
  monthly?: Money;
}

export interface Card {
  id: string;
  kind: CardKind;
  status: CardStatus;
  accountId: string;
  currency: string;
  last4?: string;
  expirationMonth?: number;
  expirationYear?: number;
  designId?: string;
  cardholderName?: string;
  limits?: CardLimits;
  createdAt: string;
  updatedAt?: string;
}

export interface CardDesign {
  id: string;
  name: string;
  kind: CardKind;
  imageUrl?: string;
  available: boolean;
}

export interface VirtualCardProduct {
  id: string;
  currency: string;
  monthlyFee?: Money;
  issuanceFee?: Money;
  designs?: CardDesign[];
}

export interface CardOrderFee {
  description?: string;
  amount: Money;
}

export interface CardOrderIntent {
  hash: string;
  kind: CardKind;
  accountId: string;
  currency?: string;
  designId?: string;
  cardholderName?: string;
  limits?: CardLimits;
  fees?: CardOrderFee[];
  product?: VirtualCardProduct;
  expiresAt?: string;
}

export type MemberRole = "OWNER" | "ADMIN" | "ACCOUNTANT" | "EMPLOYEE";

export type MemberStatus = "ACTIVE" | "INVITED" | "REMOVED";

export interface Member {
  id: string;
  email: string;
  name?: string;
  role: MemberRole;
  status: MemberStatus;
  invitedAt?: string;
  joinedAt?: string;
}

export interface MemberInvitation {
  email: string;
  role: MemberRole;
  name?: string;
}

export interface TransferIntentFee {
  description?: string;
  amount: Money;
}

export interface TransferIntent {
  hash: string;
  sourceAccountId: string;
  destinationAccountId?: string;
  destinationCurrency?: string;
  fromAmount: Money;
  toAmount: Money;
  rate?: string;
  fees?: TransferIntentFee[];
  expiresAt?: string;
}

export type OwnTransferStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

export interface OwnTransfer {
  id: string;
  hash?: string;
  sourceAccountId: string;
  destinationAccountId: string;
  fromAmount: Money;
  toAmount: Money;
  rate?: string;
  fees?: TransferIntentFee[];
  status: OwnTransferStatus;
  idempotencyKey?: string;
  createdAt: string;
  completedAt?: string;
}

export interface ApiError {
  name?: string;
  message?: string;
  description?: string;
  status?: number;
  code?: string;
}

export interface PaginationCursor {
  next?: string;
  prev?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total?: number;
  cursor?: PaginationCursor;
  hasMore?: boolean;
}
