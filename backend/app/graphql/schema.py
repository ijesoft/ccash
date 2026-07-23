import strawberry

from app.domains.admin.graphql import AdminMutations, AdminQueries
from app.domains.auth.graphql import AuthMutations, AuthQueries
from app.domains.notifications.graphql import NotificationMutations, NotificationQueries
from app.domains.transactions.graphql import TransactionMutations, TransactionQueries
from app.domains.users.graphql import KycMutations, KycQueries
from app.domains.wallets.graphql import WalletMutations, WalletQueries


@strawberry.type
class Query(AdminQueries, AuthQueries, KycQueries, NotificationQueries, TransactionQueries, WalletQueries):
    pass


@strawberry.type
class Mutation(AdminMutations, AuthMutations, KycMutations, NotificationMutations, TransactionMutations, WalletMutations):
    pass


@strawberry.type
class Subscription:
    pass


schema = strawberry.Schema(query=Query, mutation=Mutation, subscription=Subscription)