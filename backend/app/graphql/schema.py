import strawberry

from app.domains.auth.graphql import AuthMutations, AuthQueries
from app.domains.wallets.graphql import WalletMutations, WalletQueries


@strawberry.type
class Query(AuthQueries, WalletQueries):
    pass


@strawberry.type
class Mutation(AuthMutations, WalletMutations):
    pass


@strawberry.type
class Subscription:
    pass


schema = strawberry.Schema(query=Query, mutation=Mutation, subscription=Subscription)