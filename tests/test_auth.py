import pytest

@pytest.mark.asyncio
async def test_require_own_user_blocks_unauthorized(client):
    response = await client.get("/api/annotations/test_user")
    # Should be 401 because no auth header
    assert response.status_code == 401

@pytest.mark.asyncio
async def test_auth(client):
    pass
