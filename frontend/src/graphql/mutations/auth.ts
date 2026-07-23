import { gql } from "@apollo/client";

export const REGISTER = gql`
  mutation Register($email: String!, $phone: String!, $password: String!) {
    register(email: $email, phone: $phone, password: $password) {
      id
      email
      status
    }
  }
`;

export const VERIFY_OTP = gql`
  mutation VerifyOtp($email: String!, $code: String!) {
    verifyOtp(email: $email, code: $code)
  }
`;

export const LOGIN = gql`
  mutation Login($email: String!, $password: String!, $otpCode: String) {
    login(email: $email, password: $password, otpCode: $otpCode) {
      accessToken
      refreshToken
      user {
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
  }
`;

export const REFRESH_TOKEN = gql`
  mutation RefreshToken($refreshToken: String!) {
    refreshToken(refreshToken: $refreshToken) {
      accessToken
      refreshToken
    }
  }
`;

export const LOGOUT = gql`
  mutation Logout($refreshToken: String!) {
    logout(refreshToken: $refreshToken)
  }
`;

export const SETUP_2FA = gql`
  mutation Setup2fa {
    setup2fa {
      secret
      uri
    }
  }
`;

export const ENABLE_2FA = gql`
  mutation Enable2fa($secret: String!, $code: String!) {
    enable2fa(secret: $secret, code: $code)
  }
`;