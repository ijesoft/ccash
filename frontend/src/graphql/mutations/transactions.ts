import { gql } from "@apollo/client";

export const SEND_MONEY = gql`
  mutation SendMoney($input: SendMoneyInput!) {
    sendMoney(input: $input) {
      id
      type
      status
      amount { cents }
      fee { cents }
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
      amount { cents }
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
      amount { cents }
      createdAt
    }
  }
`;