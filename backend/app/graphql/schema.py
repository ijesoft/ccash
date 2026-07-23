import strawberry

from app.domains.auth.graphql import AuthMutations, AuthQueries
from app.domains.notifications.graphql import NotificationMutations, NotificationQueries
from app.domains.transactions.graphql import TransactionMutations, TransactionQueries
from app.domains.wallets.graphql import WalletMutations, WalletQueries


@strawberry.type
class Query(AuthQueries, NotificationQueries, TransactionQueries, WalletQueries):
    pass


@strawberry.type
class Mutation(AuthMutations, NotificationMutations, TransactionMutations, WalletMutations):
    pass


@strawberry.type
class Subscription:
    pass


schema = strawberry.Schema(query=Query, mutation=Mutation, subscription=Subscription)