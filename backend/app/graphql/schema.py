import strawberry

from app.domains.auth.graphql import AuthMutations, AuthQueries


@strawberry.type
class Query(AuthQueries):
    pass


@strawberry.type
class Mutation(AuthMutations):
    pass


@strawberry.type
class Subscription:
    pass


schema = strawberry.Schema(query=Query, mutation=Mutation, subscription=Subscription)