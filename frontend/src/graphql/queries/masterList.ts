import { gql } from "@apollo/client";

export const GET_MASTER_LIST = gql`
  query MasterListEntries($limit: Int, $offset: Int, $q: String) {
    masterListEntries(limit: $limit, offset: $offset, q: $q) {
      items {
        id
        idNo
        lastName
        firstName
        middleName
        mobileNumber
        email
        status
        createdAt
      }
      total
    }
  }
`;

export const MASTER_LIST_CREATE_ENTRY = gql`
  mutation MasterListCreateEntry($input: MasterListCreateInput!) {
    masterListCreateEntry(input: $input) {
      id
      idNo
      lastName
      firstName
      email
      status
    }
  }
`;

export const MASTER_LIST_UPDATE_ENTRY = gql`
  mutation MasterListUpdateEntry($entryId: String!, $input: MasterListUpdateInput!) {
    masterListUpdateEntry(entryId: $entryId, input: $input) {
      id
      idNo
      lastName
      firstName
      middleName
      mobileNumber
      email
      status
    }
  }
`;
