import { gql } from "@apollo/client";

export const ME = gql`
  query Me {
    me {
      id
      email
      phone
      status
      kycLevel
      is2faEnabled
      isVerified
      createdAt
    }
  }
`;