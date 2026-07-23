import uuid
from datetime import datetime

import strawberry


@strawberry.type
class Money:
    amount: float
    cents: int
    currency: str = "PHP"


@strawberry.type
class PaginationInfo:
    has_next: bool
    has_previous: bool
    total: int


@strawberry.input
class PaginationInput:
    limit: int = 20
    offset: int = 0