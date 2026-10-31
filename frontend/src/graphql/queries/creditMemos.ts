import { gql } from "@apollo/client";

export const CREDIT_MEMO_FIELDS = gql`
  fragment CreditMemoFields on CreditMemoType {
    id
    reference
    status
    amount { cents }
    reason
    adminNote
    merchant { userId name email maskedMobile }
    customer { userId name email maskedMobile }
    transactionId
    transactionReference
    transactionAmount { cents }
    transactionCreatedAt
    refundTransactionId
    refundTransactionReference
    decidedByEmail
    decidedAt
    cancelledAt
    createdAt
  }
`;

export const CREDIT_MEMOS = gql`
  ${CREDIT_MEMO_FIELDS}
  query CreditMemos($status: String, $search: String, $limit: Int, $offset: Int) {
    creditMemos(status: $status, search: $search, limit: $limit, offset: $offset) {
      items { ...CreditMemoFields }
      pagination { hasNext hasPrevious total }
    }
  }
`;

export const CREDIT_MEMO = gql`
  ${CREDIT_MEMO_FIELDS}
  query CreditMemo($id: String!) {
    creditMemo(id: $id) { ...CreditMemoFields }
  }
`;

export const CREDIT_MEMO_TAGGABLE_TRANSACTIONS = gql`
  query CreditMemoTaggableTransactions($reference: String!, $limit: Int) {
    creditMemoTaggableTransactions(reference: $reference, limit: $limit) {
      id
      reference
      amount { cents }
      createdAt
      customerName
      customerMaskedMobile
      alreadyCreditedCents
      remainingCreditableCents
    }
  }
`;
