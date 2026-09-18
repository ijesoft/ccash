import { gql } from "@apollo/client";

export const ME = gql`
  query Me {
    me {
      id
      email
      phone
      idNo
      firstName
      middleName
      lastName
      status
      kycLevel
      role
      is2faEnabled
      isVerified
      createdAt
    }
  }
`;