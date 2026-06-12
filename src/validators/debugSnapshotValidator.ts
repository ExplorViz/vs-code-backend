import {
  ExtensionDebugSnapshotData,
  ExtensionRuntimeOwnerGroup,
  ExtensionRuntimeVariableValue,
  ExtensionVariableSnapshotEntry,
  MatchConfidence,
} from "../types";

export function isExtensionDebugSnapshotData(
  value: unknown
): value is ExtensionDebugSnapshotData {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const snapshotData = value as Partial<ExtensionDebugSnapshotData>;

  return (
    typeof snapshotData.landscapeToken === "string" &&
    snapshotData.landscapeToken.length > 0 &&
    typeof snapshotData.debugRunId === "string" &&
    snapshotData.debugRunId.length > 0 &&
    typeof snapshotData.repositoryName === "string" &&
    snapshotData.repositoryName.length > 0 &&
    typeof snapshotData.commitHash === "string" &&
    snapshotData.commitHash.length > 0 &&
    typeof snapshotData.epochNano === "number" &&
    Number.isFinite(snapshotData.epochNano) &&
    Array.isArray(snapshotData.variables) &&
    snapshotData.variables.every(isExtensionVariableSnapshotEntry)
  );
}

function isExtensionVariableSnapshotEntry(
  value: unknown
): value is ExtensionVariableSnapshotEntry {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const entry = value as Partial<ExtensionVariableSnapshotEntry>;

  return (
    typeof entry.id === "string" &&
    entry.id.length > 0 &&
    typeof entry.name === "string" &&
    entry.name.length > 0 &&
    typeof entry.definitionUri === "string" &&
    entry.definitionUri.length > 0 &&

    typeof entry.sourcePath === "string" &&
    entry.sourcePath.length > 0 &&
    typeof entry.fileName === "string" &&
    entry.fileName.length > 0 &&
    typeof entry.packageName === "string" &&
    entry.packageName.length > 0 &&
    typeof entry.className === "string" &&
    entry.className.length > 0 &&

    isExtensionRuntimeOwnerGroup(entry.ownerGroup)
  );
}

function isExtensionRuntimeOwnerGroup(
  value: unknown
): value is ExtensionRuntimeOwnerGroup {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const ownerGroup = value as Partial<ExtensionRuntimeOwnerGroup>;

  return (
    typeof ownerGroup.ownerType === "string" &&
    ownerGroup.ownerType.length > 0 &&
    Array.isArray(ownerGroup.values) &&
    ownerGroup.values.every(isExtensionRuntimeVariableValue)
  );
}

function isExtensionRuntimeVariableValue(
  value: unknown
): value is ExtensionRuntimeVariableValue {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const runtimeValue = value as Partial<ExtensionRuntimeVariableValue>;

  return (
    typeof runtimeValue.value === "string" &&
    typeof runtimeValue.type === "string" &&
    runtimeValue.type.length > 0 &&
    (
      runtimeValue.objectReference === undefined ||
      typeof runtimeValue.objectReference === "string"
    ) &&
    (
      runtimeValue.matchConfidence === undefined ||
      isMatchConfidence(runtimeValue.matchConfidence)
    ) &&
    (
      runtimeValue.runtimePath === undefined ||
      typeof runtimeValue.runtimePath === "string"
    )
  );
}

function isMatchConfidence(value: unknown): value is MatchConfidence {
  return (
    value === "declaration-location" ||
    value === "owner-type" ||
    value === "known-subtype" ||
    value === "name-only"
  );
}