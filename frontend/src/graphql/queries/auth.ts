import { gql } from "@apollo/client";

export const ME = gql`
  query Me {
    me {
      id
      email
      phone
      firstName
      lastName
      status
      kycLevel
      is2faEnabled
      isVerified
      createdAt
    }
  }
`;