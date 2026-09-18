import strawberry

from app.domains.admin.graphql import AdminMutations, AdminQueries
from app.domains.auth.graphql import AuthMutations, AuthQueries
from app.domains.merchants.graphql import MerchantMutations, MerchantQueries
from app.domains.notifications.graphql import NotificationMutations, NotificationQueries
from app.domains.transactions.graphql import TransactionMutations, TransactionQueries
from app.domains.users.graphql import KycMutations, KycQueries
from app.domains.wallets.graphql import WalletMutations, WalletQueries


@strawberry.type
class Query(
    AdminQueries,
    AuthQueries,
    KycQueries,
    MerchantQueries,
    NotificationQueries,
    TransactionQueries,
    WalletQueries,
):
    pass


@strawberry.type
class Mutation(
    AdminMutations,
    AuthMutations,
    KycMutations,
    MerchantMutations,
    NotificationMutations,
    TransactionMutations,
    WalletMutations,
):
    pass


schema = strawberry.Schema(query=Query, mutation=Mutation)