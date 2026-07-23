class CCashError(Exception):
    pass


class NotFoundError(CCashError):
    pass


class InsufficientFundsError(CCashError):
    pass


class ValidationError(CCashError):
    pass


class AuthenticationError(CCashError):
    pass


class AuthorizationError(CCashError):
    pass


class DuplicateTransactionError(CCashError):
    pass


class WalletNotActiveError(CCashError):
    pass


class DailyLimitExceededError(CCashError):
    pass