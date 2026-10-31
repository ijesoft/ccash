import { gql } from "@apollo/client";
import { CREDIT_MEMO_FIELDS } from "../queries/creditMemos";

export const SUBMIT_CREDIT_MEMO = gql`
  ${CREDIT_MEMO_FIELDS}
  mutation SubmitCreditMemo($input: SubmitCreditMemoInput!) {
    submitCreditMemo(input: $input) { ...CreditMemoFields }
  }
`;

export const CANCEL_CREDIT_MEMO = gql`
  ${CREDIT_MEMO_FIELDS}
  mutation CancelCreditMemo($id: String!) {
    cancelCreditMemo(id: $id) { ...CreditMemoFields }
  }
`;

export const APPROVE_CREDIT_MEMO = gql`
  ${CREDIT_MEMO_FIELDS}
  mutation ApproveCreditMemo($id: String!, $note: String, $idempotencyKey: String!) {
    approveCreditMemo(id: $id, note: $note, idempotencyKey: $idempotencyKey) {
      ...CreditMemoFields
    }
  }
`;

export const DECLINE_CREDIT_MEMO = gql`
  ${CREDIT_MEMO_FIELDS}
  mutation DeclineCreditMemo($id: String!, $note: String!) {
    declineCreditMemo(id: $id, note: $note) { ...CreditMemoFields }
  }
`;
