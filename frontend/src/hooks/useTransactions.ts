import { useQuery } from "@apollo/client";
import { GET_TRANSACTIONS } from "../graphql/queries/wallet";
import type { TransactionConnection } from "../types";

export function useTransactions(limit = 20, offset = 0, txType?: string, status?: string) {
  const { data, loading, error, fetchMore, refetch } = useQuery<{ transactions: TransactionConnection }>(
    GET_TRANSACTIONS,
    { variables: { limit, offset, txType, status } }
  );

  return {
    transactions: data?.transactions ?? null,
    loading,
    error,
    fetchMore,
    refetch,
  };
}