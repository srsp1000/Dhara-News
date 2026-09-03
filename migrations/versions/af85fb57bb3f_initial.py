"""initial

Revision ID: af85fb57bb3f
Revises: 
Create Date: 2026-09-03 10:28:09.306641

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'af85fb57bb3f'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    import os
    with open(os.path.join(os.path.dirname(__file__), "initial_schema.sql")) as f:
        sql = f.read()
    op.execute(sql)


def downgrade() -> None:
    """Downgrade schema."""
    pass
