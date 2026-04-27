from __future__ import annotations

import copy
import json
import re
import unittest
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
OPENAPI_PATH = ROOT / "docs" / "openapi.yaml"
SCHEMA_FIXTURE_PATH = (
    ROOT
    / "packages"
    / "schemas"
    / "fixtures"
    / "ingest-connector-api-manifest.schema.json"
)
VALID_FIXTURE_PATH = (
    ROOT
    / "packages"
    / "schemas"
    / "fixtures"
    / "ingest-connector-api-manifest.valid.json"
)
INVALID_FIXTURE_PATH = (
    ROOT
    / "packages"
    / "schemas"
    / "fixtures"
    / "ingest-connector-api-manifest.invalid.json"
)

CONNECTOR_SCHEMA_COMPONENTS = (
    "IngestConnectorManifest",
    "IngestConnectorProfile",
    "IngestConnectorAuthProfile",
    "IngestConnectorPreviewProfile",
    "IngestConnectorSafetyProfile",
    "IngestConnectorCapability",
    "IngestMediaType",
)


class ValidateOpenApiIngestConnectorApiSchemaTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.lines = OPENAPI_PATH.read_text(encoding="utf-8").splitlines()
        cls.fixture_schema = json.loads(SCHEMA_FIXTURE_PATH.read_text(encoding="utf-8"))
        cls.valid_fixture = json.loads(VALID_FIXTURE_PATH.read_text(encoding="utf-8"))
        cls.invalid_fixture = json.loads(INVALID_FIXTURE_PATH.read_text(encoding="utf-8"))
        cls.components = {
            name: _parse_yaml_subset(_require_block(cls.lines, name, 4))
            for name in CONNECTOR_SCHEMA_COMPONENTS
        }
        cls.response_schema = _connector_response_schema(cls.lines)
        cls.openapi_schema = _resolve_refs(cls.response_schema, cls.components)

    def test_connector_route_uses_manifest_schema(self) -> None:
        self.assertEqual(
            {"$ref": "#/components/schemas/IngestConnectorManifest"},
            self.response_schema,
        )

    def test_openapi_manifest_shape_matches_exported_schema_fixture(self) -> None:
        _assert_object_contract(
            self,
            self.openapi_schema,
            self.fixture_schema,
            "manifest",
        )
        _assert_const_property(
            self,
            self.openapi_schema,
            self.fixture_schema,
            "schemaVersion",
            "manifest.schemaVersion",
        )
        _assert_const_property(
            self,
            self.openapi_schema,
            self.fixture_schema,
            "localOnly",
            "manifest.localOnly",
        )

        openapi_connectors = self.openapi_schema["properties"]["connectors"]
        fixture_connectors = self.fixture_schema["properties"]["connectors"]
        _assert_array_contract(
            self,
            openapi_connectors,
            fixture_connectors,
            "manifest.connectors",
            compare_unique=False,
        )

        openapi_profile = openapi_connectors["items"]
        fixture_profile = fixture_connectors["items"]
        _assert_object_contract(self, openapi_profile, fixture_profile, "connector profile")
        _assert_const_property(
            self,
            openapi_profile,
            fixture_profile,
            "transport",
            "connector.transport",
        )
        for field in ("capabilities", "mediaTypes"):
            with self.subTest(array=field):
                _assert_array_contract(
                    self,
                    openapi_profile["properties"][field],
                    fixture_profile["properties"][field],
                    f"connector.{field}",
                    compare_unique=True,
                )
                self.assertEqual(
                    set(fixture_profile["properties"][field]["items"]["enum"]),
                    set(openapi_profile["properties"][field]["items"]["enum"]),
                )

    def test_auth_preview_and_safety_shapes_match_exported_schema_fixture(self) -> None:
        openapi_profile = self.openapi_schema["properties"]["connectors"]["items"]
        fixture_profile = self.fixture_schema["properties"]["connectors"]["items"]

        for field in ("auth", "preview", "safety"):
            with self.subTest(field=field):
                _assert_object_contract(
                    self,
                    openapi_profile["properties"][field],
                    fixture_profile["properties"][field],
                    f"connector.{field}",
                )

        openapi_auth = openapi_profile["properties"]["auth"]
        fixture_auth = fixture_profile["properties"]["auth"]
        _assert_const_property(self, openapi_auth, fixture_auth, "mode", "auth.mode")
        _assert_const_property(self, openapi_auth, fixture_auth, "required", "auth.required")

        openapi_preview = openapi_profile["properties"]["preview"]
        fixture_preview = fixture_profile["properties"]["preview"]
        _assert_const_property(self, openapi_preview, fixture_preview, "dryRun", "preview.dryRun")
        for field in ("maxItems", "maxTextBytes"):
            with self.subTest(preview_limit=field):
                self.assertEqual(
                    fixture_preview["properties"][field]["type"],
                    openapi_preview["properties"][field]["type"],
                )
                self.assertEqual(
                    fixture_preview["properties"][field]["minimum"],
                    openapi_preview["properties"][field]["minimum"],
                )

        openapi_safety = openapi_profile["properties"]["safety"]
        fixture_safety = fixture_profile["properties"]["safety"]
        for field in ("localOnly", "networkAccess", "durableWrites"):
            with self.subTest(safety_boolean=field):
                _assert_const_property(self, openapi_safety, fixture_safety, field, f"safety.{field}")
        self.assertEqual(
            fixture_safety["properties"]["untrustedByDefault"]["type"],
            openapi_safety["properties"]["untrustedByDefault"]["type"],
        )

    def test_auth_and_safety_do_not_allow_unexpected_permissions(self) -> None:
        profile = self.openapi_schema["properties"]["connectors"]["items"]
        auth = profile["properties"]["auth"]
        safety = profile["properties"]["safety"]

        self.assertEqual({"mode", "required"}, set(auth["properties"]))
        self.assertEqual("none", auth["properties"]["mode"]["const"])
        self.assertIs(auth["properties"]["required"]["const"], False)
        self.assertIs(auth["additionalProperties"], False)

        self.assertEqual(
            {"localOnly", "networkAccess", "durableWrites", "untrustedByDefault"},
            set(safety["properties"]),
        )
        self.assertIs(safety["properties"]["localOnly"]["const"], True)
        self.assertIs(safety["properties"]["networkAccess"]["const"], False)
        self.assertIs(safety["properties"]["durableWrites"]["const"], False)
        self.assertIs(safety["additionalProperties"], False)

    def test_manifest_fixtures_validate_against_openapi_schema_shape(self) -> None:
        self.assertEqual([], _validation_errors(self.valid_fixture, self.openapi_schema))

        invalid_errors = _validation_errors(self.invalid_fixture, self.openapi_schema)
        self.assertTrue(invalid_errors)
        self.assertTrue(any("schemaVersion" in error for error in invalid_errors))
        self.assertTrue(any("auth.mode" in error for error in invalid_errors))
        self.assertTrue(any("safety.networkAccess" in error for error in invalid_errors))
        self.assertTrue(any("safety.durableWrites" in error for error in invalid_errors))

    def test_openapi_schema_rejects_permission_and_capability_escalations(self) -> None:
        escalations: tuple[tuple[str, tuple[str | int, ...], Any], ...] = (
            ("api key auth mode", ("connectors", 0, "auth", "mode"), "api-key"),
            ("required auth", ("connectors", 0, "auth", "required"), True),
            ("network access", ("connectors", 0, "safety", "networkAccess"), True),
            ("durable writes", ("connectors", 0, "safety", "durableWrites"), True),
            ("remote capability", ("connectors", 0, "capabilities"), ["network.fetch"]),
            ("unsupported media type", ("connectors", 0, "mediaTypes"), ["application/octet-stream"]),
        )
        for name, path, value in escalations:
            with self.subTest(escalation=name):
                manifest = copy.deepcopy(self.valid_fixture)
                _set_path(manifest, path, value)
                self.assertTrue(_validation_errors(manifest, self.openapi_schema))


def _connector_response_schema(lines: list[str]) -> dict[str, Any]:
    path_block = _parse_yaml_subset(_require_block(lines, "/v1/ingest/connectors", 2))
    return path_block["get"]["responses"]["200"]["content"]["application/json"]["schema"]


def _assert_object_contract(
    test_case: unittest.TestCase,
    openapi_schema: dict[str, Any],
    fixture_schema: dict[str, Any],
    label: str,
) -> None:
    test_case.assertEqual("object", openapi_schema["type"], label)
    test_case.assertEqual(fixture_schema["required"], openapi_schema["required"], label)
    test_case.assertEqual(
        set(fixture_schema["properties"]),
        set(openapi_schema["properties"]),
        label,
    )
    test_case.assertEqual(
        fixture_schema["additionalProperties"],
        openapi_schema["additionalProperties"],
        label,
    )


def _assert_array_contract(
    test_case: unittest.TestCase,
    openapi_schema: dict[str, Any],
    fixture_schema: dict[str, Any],
    label: str,
    *,
    compare_unique: bool,
) -> None:
    test_case.assertEqual("array", openapi_schema["type"], label)
    test_case.assertEqual(fixture_schema["minItems"], openapi_schema["minItems"], label)
    if compare_unique:
        test_case.assertEqual(
            fixture_schema["uniqueItems"],
            openapi_schema.get("uniqueItems"),
            label,
        )


def _assert_const_property(
    test_case: unittest.TestCase,
    openapi_schema: dict[str, Any],
    fixture_schema: dict[str, Any],
    field: str,
    label: str,
) -> None:
    test_case.assertEqual(
        fixture_schema["properties"][field]["type"],
        openapi_schema["properties"][field]["type"],
        label,
    )
    test_case.assertEqual(
        fixture_schema["properties"][field]["const"],
        openapi_schema["properties"][field]["const"],
        label,
    )


def _require_block(lines: list[str], key: str, indent: int) -> list[str]:
    block = _find_block(lines, key, indent)
    if block is None:
        raise AssertionError(f"missing block {key!r} at indent {indent}")
    return block


def _find_block(lines: list[str], key: str, indent: int) -> list[str] | None:
    prefix = " " * indent + key + ":"
    for index, line in enumerate(lines):
        if line.startswith(prefix):
            return _collect_block(lines, index, indent)
    return None


def _collect_block(lines: list[str], index: int, indent: int) -> list[str]:
    block: list[str] = []
    for child in lines[index + 1 :]:
        if not child.strip() or child.lstrip().startswith("#"):
            block.append(child)
            continue
        child_indent = len(child) - len(child.lstrip(" "))
        if child_indent <= indent:
            break
        block.append(child)
    return block


def _parse_yaml_subset(lines: list[str]) -> Any:
    meaningful = [
        line.rstrip()
        for line in lines
        if line.strip() and not line.lstrip().startswith("#")
    ]
    if not meaningful:
        return {}
    first_indent = min(_indent(line) for line in meaningful)
    parsed, index = _parse_yaml_node(meaningful, 0, first_indent)
    if index != len(meaningful):
        raise AssertionError(f"unparsed YAML subset lines: {meaningful[index:]}")
    return parsed


def _parse_yaml_node(lines: list[str], index: int, indent: int) -> tuple[Any, int]:
    content = lines[index][indent:]
    if content.startswith("- "):
        return _parse_yaml_list(lines, index, indent)
    return _parse_yaml_mapping(lines, index, indent)


def _parse_yaml_mapping(lines: list[str], index: int, indent: int) -> tuple[dict[str, Any], int]:
    result: dict[str, Any] = {}
    while index < len(lines):
        line = lines[index]
        line_indent = _indent(line)
        if line_indent < indent:
            break
        if line_indent > indent:
            break
        content = line[indent:]
        if content.startswith("- "):
            break
        key, raw_value = _split_yaml_mapping(content)
        index += 1
        if raw_value:
            result[key] = _parse_yaml_scalar(raw_value)
            continue
        if index >= len(lines) or _indent(lines[index]) <= line_indent:
            result[key] = {}
            continue
        child_indent = _indent(lines[index])
        result[key], index = _parse_yaml_node(lines, index, child_indent)
    return result, index


def _parse_yaml_list(lines: list[str], index: int, indent: int) -> tuple[list[Any], int]:
    result: list[Any] = []
    while index < len(lines):
        line = lines[index]
        line_indent = _indent(line)
        if line_indent < indent:
            break
        if line_indent > indent:
            break
        content = line[indent:]
        if not content.startswith("- "):
            break
        raw_item = content[2:].strip()
        index += 1
        if raw_item:
            result.append(_parse_yaml_scalar(raw_item))
            continue
        if index >= len(lines) or _indent(lines[index]) <= line_indent:
            result.append(None)
            continue
        child_indent = _indent(lines[index])
        child, index = _parse_yaml_node(lines, index, child_indent)
        result.append(child)
    return result, index


def _split_yaml_mapping(content: str) -> tuple[str, str]:
    key, raw_value = content.split(":", 1)
    return _strip_yaml_quotes(key.strip()), raw_value.strip()


def _parse_yaml_scalar(value: str) -> Any:
    if value == "true":
        return True
    if value == "false":
        return False
    if value == "null":
        return None
    if re.fullmatch(r"-?[0-9]+", value):
        return int(value)
    return _strip_yaml_quotes(value)


def _strip_yaml_quotes(value: str) -> str:
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        return value[1:-1]
    return value


def _indent(line: str) -> int:
    return len(line) - len(line.lstrip(" "))


def _resolve_refs(schema: Any, components: dict[str, Any]) -> Any:
    if isinstance(schema, list):
        return [_resolve_refs(item, components) for item in schema]
    if not isinstance(schema, dict):
        return schema
    ref = schema.get("$ref")
    if ref is not None:
        prefix = "#/components/schemas/"
        if not isinstance(ref, str) or not ref.startswith(prefix):
            raise AssertionError(f"unsupported schema ref: {ref!r}")
        name = ref.removeprefix(prefix)
        resolved = copy.deepcopy(components[name])
        siblings = {key: value for key, value in schema.items() if key != "$ref"}
        if siblings:
            resolved.update(siblings)
        return _resolve_refs(resolved, components)
    return {key: _resolve_refs(value, components) for key, value in schema.items()}


def _validation_errors(instance: Any, schema: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    _validate(instance, schema, "$", errors)
    return errors


def _validate(instance: Any, schema: dict[str, Any], path: str, errors: list[str]) -> None:
    if "const" in schema and instance != schema["const"]:
        errors.append(f"{path}: expected const {schema['const']!r}")
    if "enum" in schema and instance not in schema["enum"]:
        errors.append(f"{path}: expected one of {schema['enum']!r}")

    schema_type = schema.get("type")
    if schema_type == "object":
        if not isinstance(instance, dict):
            errors.append(f"{path}: expected object")
            return
        required = schema.get("required", [])
        for field in required:
            if field not in instance:
                errors.append(f"{path}.{field}: missing required field")
        properties = schema.get("properties", {})
        if schema.get("additionalProperties") is False:
            for field in instance:
                if field not in properties:
                    errors.append(f"{path}.{field}: unexpected property")
        for field, property_schema in properties.items():
            if field in instance:
                _validate(instance[field], property_schema, f"{path}.{field}", errors)
        return

    if schema_type == "array":
        if not isinstance(instance, list):
            errors.append(f"{path}: expected array")
            return
        min_items = schema.get("minItems")
        if min_items is not None and len(instance) < min_items:
            errors.append(f"{path}: expected at least {min_items} items")
        if schema.get("uniqueItems") is True:
            seen: set[str] = set()
            for item in instance:
                marker = json.dumps(item, sort_keys=True, separators=(",", ":"))
                if marker in seen:
                    errors.append(f"{path}: expected unique items")
                    break
                seen.add(marker)
        item_schema = schema.get("items")
        if item_schema is not None:
            for index, item in enumerate(instance):
                _validate(item, item_schema, f"{path}[{index}]", errors)
        return

    if schema_type == "string":
        if not isinstance(instance, str):
            errors.append(f"{path}: expected string")
            return
        min_length = schema.get("minLength")
        if min_length is not None and len(instance) < min_length:
            errors.append(f"{path}: expected minLength {min_length}")
        pattern = schema.get("pattern")
        if pattern is not None and re.search(pattern, instance) is None:
            errors.append(f"{path}: expected pattern {pattern!r}")
        return

    if schema_type == "boolean":
        if not isinstance(instance, bool):
            errors.append(f"{path}: expected boolean")
        return

    if schema_type == "integer":
        if not isinstance(instance, int) or isinstance(instance, bool):
            errors.append(f"{path}: expected integer")
            return
        minimum = schema.get("minimum")
        if minimum is not None and instance < minimum:
            errors.append(f"{path}: expected minimum {minimum}")


def _set_path(document: dict[str, Any], path: tuple[str | int, ...], value: Any) -> None:
    target: Any = document
    for part in path[:-1]:
        target = target[part]
    target[path[-1]] = value


if __name__ == "__main__":
    unittest.main()
