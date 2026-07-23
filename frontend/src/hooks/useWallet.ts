import { useQuery } from "@apollo/client";
import { GET_WALLET } from "../graphql/queries/wallet";
import type { Wallet } from "../types";

export function useWallet() {
  const { data, loading, error, refetch } = useQuery<{ wallet: Wallet }>(GET_WALLET);
  return {
    wallet: data?.wallet ?? null,
    loading,
    error,
    refetch,
  };
}