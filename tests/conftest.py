import pytest
from httpx import AsyncClient, ASGITransport
from api.main import app

@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as c:
        yield c

@pytest.fixture(autouse=True)
def mock_db_pool(monkeypatch):
    class MockPool:
        async def acquire(self):
            class MockConn:
                async def __aenter__(self): return self
                async def __aexit__(self, exc_type, exc, tb): pass
                async def execute(self, *args, **kwargs): pass
            return MockConn()
        async def fetch(self, *args, **kwargs): return []
        async def fetchrow(self, *args, **kwargs): return None
        async def execute(self, *args, **kwargs): pass
    monkeypatch.setattr("api.main.pg_pool", MockPool())
