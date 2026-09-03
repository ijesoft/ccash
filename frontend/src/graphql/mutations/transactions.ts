import { gql } from "@apollo/client";

export const SEND_MONEY = gql`
  mutation SendMoney($input: SendMoneyInput!) {
    sendMoney(input: $input) {
      id
      type
      status
      direction
      counterparty { walletId name maskedMobile }
      amount { cents }
      fee { cents }
      reference
      receiverWalletId
      description
      createdAt
    }
  }
`;

export const CASH_IN = gql`
  mutation CashIn($input: CashInInput!) {
    cashIn(input: $input) {
      id
      type
      status
      direction
      amount { cents }
      reference
      createdAt
    }
  }
`;

export const CASH_OUT = gql`
  mutation CashOut($input: CashOutInput!) {
    cashOut(input: $input) {
      id
      type
      status
      direction
      amount { cents }
      reference
      createdAt
    }
  }
`;

export const SCAN_QR_PAYMENT = gql`
  mutation ScanQrPayment(
    $payload: String!
    $idempotencyKey: String!
    $amountCents: Int
    $pin: String
    $description: String
  ) {
    scanQrPayment(
      payload: $payload
      idempotencyKey: $idempotencyKey
      amountCents: $amountCents
      pin: $pin
      description: $description
    ) {
      id
      type
      status
      direction
      counterparty { walletId name maskedMobile }
      amount { cents }
      fee { cents }
      reference
      description
      createdAt
    }
  }
`;

