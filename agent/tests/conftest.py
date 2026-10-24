"""agent/tests never reach Elastic: ledger.py loads the repo .env, so the real ELASTICSEARCH_URL would be in
the environment during a test run. Every test gets a transport that refuses to connect; test_escalations
installs its own MockTransport on top. The `status` reply then ends with "escalations: not connected"."""

import httpx
import pytest

from agent import reads


def _refuse(request):
    raise httpx.ConnectError("tests never reach Elastic")


@pytest.fixture(autouse=True)
def no_elastic_network():
    reads._escalations_transport = httpx.MockTransport(_refuse)
    yield
    reads._escalations_transport = None
