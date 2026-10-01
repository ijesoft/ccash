from app.core.rbac import Permission, ROLE_PERMISSIONS, has_permission, permissions_for
from app.domains.auth.models import UserRole


def test_super_admin_role_exists_with_all_perms():
    assert UserRole.SUPER_ADMIN.value == "SUPER_ADMIN"
    assert ROLE_PERMISSIONS[UserRole.SUPER_ADMIN] == ROLE_PERMISSIONS[UserRole.ADMIN]
    assert has_permission(UserRole.SUPER_ADMIN, Permission.USERS_READ) is True
    assert has_permission(UserRole.SUPER_ADMIN, Permission.USERS_CHANGE_ROLE) is True
    assert has_permission(UserRole.SUPER_ADMIN, Permission.PLATFORM_STATS) is True
    assert "users:read" in permissions_for(UserRole.SUPER_ADMIN)


async def test_userrole_enum_has_super_admin_in_db(session):
    from sqlalchemy import text

    rows = (
        (
            await session.execute(
                text(
                    "SELECT enumlabel FROM pg_enum JOIN pg_type "
                    "ON pg_enum.enumtypid = pg_type.oid "
                    "WHERE pg_type.typname = 'userrole'"
                )
            )
        )
        .scalars()
        .all()
    )
    assert "SUPER_ADMIN" in rows
    # Model-level lock alongside the DB check
    assert UserRole.SUPER_ADMIN.value == "SUPER_ADMIN"
