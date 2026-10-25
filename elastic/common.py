"""Shared config, headers and a dry-run aware client for the Dispatch Ledger Elastic layer.

Reads ELASTICSEARCH_URL, ELASTIC_API_KEY and KIBANA_URL from the repo root .env
(values already in the environment win). KIBANA_URL is optional: on Elastic Cloud
Serverless it is the Elasticsearch URL with ".es." replaced by ".kb.".

Every network call goes through `Client`. With dry_run=True nothing leaves the
machine; each request is printed (method, URL, headers with the key redacted,
body) and a synthetic response is returned so the callers can run end to end.
"""

from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

import requests

ELASTIC_DIR = Path(__file__).resolve().parent
REPO_ROOT = ELASTIC_DIR.parent
ENV_FILE = REPO_ROOT / ".env"

DEFAULT_INFERENCE_ID = ".jina-embeddings-v5-text-small"
AGENT_ID = "dispatch-investigator"
AGENT_BUILDER_PATH = "/api/agent_builder"
MCP_PATH = f"{AGENT_BUILDER_PATH}/mcp"

# Placeholders used only in dry-run when the real values are not set yet.
PLACEHOLDER_ES_URL = "https://my-project.es.us-east-1.aws.elastic.cloud"
PLACEHOLDER_API_KEY = ""

FORBIDDEN_HINT = (
    "403 from Agent Builder: this API key lacks the feature_agentBuilder.read application privilege. "
    "Create a new API key that carries it (Kibana > Stack Management > API keys > Create, under "
    "Kibana privileges grant Agent Builder read or all; or POST {es_url}/_security/api_key with "
    "role_descriptors.applications = [{{\"application\": \"kibana-.kibana\", "
    "\"privileges\": [\"feature_agentBuilder.read\", \"feature_agentBuilder.all\"], \"resources\": [\"*\"]}}]) "
    "and set ELASTIC_API_KEY to the new encoded key."
)


# ----------------------------------------------------------------------------
# env
# ----------------------------------------------------------------------------


def parse_dotenv(text: str) -> dict[str, str]:
    """Minimal .env parser: KEY=VALUE lines, # comments, optional quotes, optional `export `."""
    out: dict[str, str] = {}
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        if line.startswith("export "):
            line = line[len("export "):]
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        elif " #" in value:
            value = value.split(" #", 1)[0].rstrip()
        if key:
            out[key] = value
    return out


def load_env(env_file: Path | None = None) -> None:
    """Load the repo root .env into os.environ without overriding existing values."""
    env_file = env_file or ENV_FILE
    if not env_file.exists():
        return
    for key, value in parse_dotenv(env_file.read_text(encoding="utf-8")).items():
        os.environ.setdefault(key, value)


def derive_kibana_url(es_url: str, explicit: str | None = None) -> str:
    """KIBANA_URL wins when set; otherwise swap `.es.` for `.kb.` in the Elasticsearch URL.

    Returns "" when the URL is not an Elastic Cloud URL (no `.es.` segment), because
    then the Kibana host cannot be guessed and the caller should ask for KIBANA_URL.
    """
    if explicit:
        return explicit.rstrip("/")
    es_url = (es_url or "").rstrip("/")
    if ".es." not in es_url:
        return ""
    return es_url.replace(".es.", ".kb.", 1)


def redact(api_key: str) -> str:
    if not api_key:
        return "<ELASTIC_API_KEY unset>"
    return "****"   # never any part of the key, not even the tail


@dataclass
class Settings:
    es_url: str
    api_key: str
    kibana_url: str
    inference_id: str = DEFAULT_INFERENCE_ID
    agent_id: str = AGENT_ID

    @classmethod
    def from_env(cls, dry_run: bool = False) -> "Settings":
        load_env()
        es_url = (os.environ.get("ELASTICSEARCH_URL") or "").rstrip("/")
        api_key = os.environ.get("ELASTIC_API_KEY") or ""
        kibana_url = derive_kibana_url(es_url, os.environ.get("KIBANA_URL"))
        missing = [name for name, val in (("ELASTICSEARCH_URL", es_url), ("ELASTIC_API_KEY", api_key)) if not val]
        if missing and not dry_run:
            raise SystemExit(
                f"Missing {', '.join(missing)}. Put them in {ENV_FILE} (see .env.example) or export them. "
                "Use --dry-run to see the requests without credentials."
            )
        if not es_url:
            es_url = PLACEHOLDER_ES_URL
            kibana_url = kibana_url or derive_kibana_url(es_url)
        if not kibana_url:
            if dry_run:
                kibana_url = es_url  # best effort so the dry run still prints something readable
            else:
                raise SystemExit(
                    f"Cannot derive KIBANA_URL from {es_url!r} (no '.es.' segment). Set KIBANA_URL explicitly."
                )
        return cls(
            es_url=es_url,
            api_key=api_key,
            kibana_url=kibana_url,
            inference_id=os.environ.get("EMBEDDING_INFERENCE_ID") or DEFAULT_INFERENCE_ID,
            agent_id=os.environ.get("AGENT_ID") or AGENT_ID,
        )

    def kibana_headers(self) -> dict[str, str]:
        return {
            "Authorization": f"ApiKey {self.api_key}",
            "kbn-xsrf": "true",
            "Content-Type": "application/json",
            "x-elastic-internal-origin": "Kibana",
        }

    def es_headers(self) -> dict[str, str]:
        return {
            "Authorization": f"ApiKey {self.api_key}",
            "Content-Type": "application/json",
        }

    def mcp_headers(self) -> dict[str, str]:
        # MCP clients (Droid, Claude Code) send only Authorization; the rest is harmless.
        return {
            "Authorization": f"ApiKey {self.api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            "kbn-xsrf": "true",
        }


def redacted_headers(headers: dict[str, str], api_key: str) -> dict[str, str]:
    out = dict(headers)
    if "Authorization" in out:
        out["Authorization"] = f"ApiKey {redact(api_key)}"
    return out


# ----------------------------------------------------------------------------
# responses
# ----------------------------------------------------------------------------


@dataclass
class DryResponse:
    """Stands in for requests.Response during a dry run."""

    status_code: int = 200
    payload: Any = None
    headers: dict[str, str] = field(default_factory=dict)
    url: str = ""

    @property
    def ok(self) -> bool:
        return self.status_code < 400

    @property
    def text(self) -> str:
        return json.dumps(self.payload) if self.payload is not None else ""

    def json(self) -> Any:
        return self.payload


def _format_body(body: Any, max_chars: int = 4000) -> str:
    if body is None:
        return "(no body)"
    if isinstance(body, str):
        text = body
    else:
        text = json.dumps(body, indent=2, ensure_ascii=False)
    if len(text) > max_chars:
        text = text[:max_chars] + f"\n... ({len(text) - max_chars} more chars)"
    return text


def print_request(method: str, url: str, headers: dict[str, str], body: Any, api_key: str, note: str = "") -> None:
    print(f"--> {method.upper()} {url}" + (f"    [{note}]" if note else ""))
    for k, v in redacted_headers(headers, api_key).items():
        print(f"    {k}: {v}")
    print("    body: " + _format_body(body).replace("\n", "\n          "))


# ----------------------------------------------------------------------------
# client
# ----------------------------------------------------------------------------


class Client:
    """Thin wrapper over requests (Kibana, MCP) and the elasticsearch client (indices, bulk).

    dry_run=True prints every request and returns DryResponse objects; nothing is sent.
    """

    def __init__(self, settings: Settings | None = None, dry_run: bool = False, verbose: bool = False):
        self.dry_run = dry_run
        self.verbose = verbose or dry_run
        self.settings = settings or Settings.from_env(dry_run=dry_run)
        self._es = None

    # -- Kibana ---------------------------------------------------------------

    def kibana(
        self,
        method: str,
        path: str,
        json_body: Any = None,
        params: dict[str, Any] | None = None,
        dry_payload: Any = None,
        dry_status: int = 200,
        timeout: int = 120,
        headers: dict[str, str] | None = None,
    ) -> requests.Response | DryResponse:
        url = f"{self.settings.kibana_url}{path}"
        hdrs = headers or self.settings.kibana_headers()
        if self.verbose:
            print_request(method, url if not params else f"{url}?{requests.compat.urlencode(params)}",
                          hdrs, json_body, self.settings.api_key, note="dry-run" if self.dry_run else "")
        if self.dry_run:
            return DryResponse(status_code=dry_status, payload=dry_payload, url=url)
        try:
            resp = requests.request(method, url, headers=hdrs, json=json_body, params=params, timeout=timeout)
        except requests.RequestException as exc:
            raise SystemExit(f"Could not reach Kibana at {url}: {exc}") from exc
        self.explain_failure(resp, path)
        return resp

    def explain_failure(self, resp: requests.Response | DryResponse, path: str) -> None:
        """Print a friendly explanation for the failures people hit on day one. Never raises."""
        if resp.ok:
            return
        code = resp.status_code
        if code == 403 and path.startswith(AGENT_BUILDER_PATH):
            print(FORBIDDEN_HINT.format(es_url=self.settings.es_url), file=sys.stderr)
        elif code == 401:
            print("401 from Kibana: the API key is wrong or expired, or the header is not "
                  "'Authorization: ApiKey <encoded key>' (Bearer does not work).", file=sys.stderr)
        elif code == 404 and path.startswith(AGENT_BUILDER_PATH) and not path.endswith(("/tools", "/agents")):
            pass  # expected on first-run GET before create
        elif code == 404 and path.startswith(AGENT_BUILDER_PATH):
            print("404 for an Agent Builder route: check KIBANA_URL points at the Kibana host "
                  "(.kb., not .es.) and that Agent Builder is enabled on this Serverless project.", file=sys.stderr)
        elif code >= 500:
            print(f"{code} from Kibana: transient on a fresh Serverless project; wait a minute and retry.",
                  file=sys.stderr)

    # -- Elasticsearch -------------------------------------------------------

    def es(self):
        if self._es is None:
            from elasticsearch import Elasticsearch  # imported lazily so tests run without the package loaded

            self._es = Elasticsearch(self.settings.es_url, api_key=self.settings.api_key, request_timeout=120)
        return self._es

    def _es_dry(self, method: str, path: str, body: Any = None, note: str = "") -> None:
        if self.verbose:
            print_request(method, f"{self.settings.es_url}{path}", self.settings.es_headers(), body,
                          self.settings.api_key, note=note or ("dry-run" if self.dry_run else ""))

    def index_exists(self, index: str) -> bool:
        self._es_dry("HEAD", f"/{index}")
        if self.dry_run:
            return False
        return bool(self.es().indices.exists(index=index))

    def create_index(self, index: str, mappings: dict[str, Any], settings: dict[str, Any] | None = None) -> None:
        body: dict[str, Any] = {"mappings": mappings}
        if settings:
            body["settings"] = settings
        self._es_dry("PUT", f"/{index}", body)
        if self.dry_run:
            return
        self.es().indices.create(index=index, mappings=mappings, settings=settings or None)

    def delete_index(self, index: str) -> None:
        self._es_dry("DELETE", f"/{index}")
        if self.dry_run:
            return
        self.es().indices.delete(index=index, ignore_unavailable=True)

    def inference_exists(self, inference_id: str) -> bool:
        self._es_dry("GET", f"/_inference/{inference_id}")
        if self.dry_run:
            return True
        try:
            self.es().inference.get(inference_id=inference_id)
            return True
        except Exception:
            return False

    def bulk(self, index: str, docs: Iterable[dict[str, Any]], chunk_size: int = 200) -> tuple[int, list[Any]]:
        """Bulk index `docs`; each doc may carry `_id`. Returns (ok_count, errors)."""
        docs = list(docs)
        if self.dry_run or self.verbose:
            preview = []
            for d in docs[:3]:
                meta = {"index": {"_index": index, **({"_id": d["_id"]} if "_id" in d else {})}}
                preview.append(json.dumps(meta))
                preview.append(json.dumps({k: v for k, v in d.items() if k != "_id"}, ensure_ascii=False))
            tail = f"\n... {len(docs)} docs total, {chunk_size} per request" if len(docs) > 3 else f"\n({len(docs)} docs)"
            self._es_dry("POST", "/_bulk", "\n".join(preview) + tail)
        if self.dry_run:
            return len(docs), []
        from elasticsearch import helpers

        actions = ({"_index": index, **d} for d in docs)
        ok, errors = helpers.bulk(self.es(), actions, chunk_size=chunk_size, raise_on_error=False,
                                  stats_only=False)
        return ok, list(errors)

    def refresh(self, index: str) -> None:
        self._es_dry("POST", f"/{index}/_refresh")
        if self.dry_run:
            return
        self.es().indices.refresh(index=index)

    def count(self, index: str) -> int | None:
        self._es_dry("GET", f"/{index}/_count")
        if self.dry_run:
            return None
        return int(self.es().count(index=index)["count"])


# ----------------------------------------------------------------------------
# result helpers
# ----------------------------------------------------------------------------


def esql_rows(results: list[Any]) -> list[dict[str, Any]]:
    """Flatten Agent Builder `_execute` results into row dicts (columns zipped with values).

    The response shape is {"results": [{"type": "query"|"tabular_data", "data": {"columns": [...], "values": [...]}}]}.
    Columns may be dicts with a `name` key or plain strings; both are handled.
    """
    rows: list[dict[str, Any]] = []
    for item in results or []:
        if not isinstance(item, dict):
            continue
        data = item.get("data")
        if not isinstance(data, dict):
            continue
        columns = [c.get("name") if isinstance(c, dict) else c for c in data.get("columns") or []]
        for values in data.get("values") or []:
            rows.append(dict(zip(columns, values)))
    return rows


def load_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)
