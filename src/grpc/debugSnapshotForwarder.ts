import path from "path";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import logger from "../logger";
import {
  ExtensionDebugSnapshotData,
  ExtensionVariableSnapshotEntry,
} from "../types";

const protoPath = path.resolve(__dirname, "../../proto/debug_snapshot.proto");

const packageDefinition = protoLoader.loadSync(protoPath, {
  keepCase: false,
  longs: Number,
  enums: String,
  defaults: true,
  oneofs: true,
});

const loadedPackage = grpc.loadPackageDefinition(packageDefinition) as any;

const DebugSnapshotService = loadedPackage.DebugSnapshotService;

if (!DebugSnapshotService) {
  throw new Error("Could not load DebugSnapshotService from debug_snapshot.proto");
}

const grpcTarget =
  process.env.DEBUG_SNAPSHOT_SERVICE_GRPC_TARGET ?? "localhost:9000";

const client = new DebugSnapshotService(
  grpcTarget,
  grpc.credentials.createInsecure()
);

export async function forwardDebugSnapshotViaGrpc(
  snapshotData: ExtensionDebugSnapshotData
): Promise<boolean> {
  return new Promise((resolve) => {
    const grpcPayload = {
      landscapeToken: snapshotData.landscapeToken,
      debugRunId: snapshotData.debugRunId,
      repositoryName: snapshotData.repositoryName,
      commitHash: snapshotData.commitHash,
      epochNano: snapshotData.epochNano,
      variables: snapshotData.variables.map(toGrpcVariableSnapshotEntry),
    };

    console.log("gRPC payload:", JSON.stringify(grpcPayload, null, 2));

    client.saveCurrentState(
      grpcPayload,
      (error: grpc.ServiceError | null) => {
        if (error) {
          logger.debug("gRPC SaveCurrentState failed:", {
            code: error.code,
            details: error.details,
            message: error.message,
            metadata: error.metadata?.getMap?.(),
          });

          console.error("gRPC SaveCurrentState failed:", {
            code: error.code,
            details: error.details,
            message: error.message,
            metadata: error.metadata?.getMap?.(),
          });

          resolve(false);
          return;
        }

        resolve(true);
      }
    );
  });
}

function toGrpcVariableSnapshotEntry(entry: ExtensionVariableSnapshotEntry) {
  return {
    id: entry.id,
    name: entry.name,
    definitionUri: entry.definitionUri,

    sourcePath: entry.sourcePath,
    fileName: entry.fileName,
    packageName: entry.packageName,
    className: entry.className,

    ownerGroup: {
      ownerType: entry.ownerGroup.ownerType,
      values: entry.ownerGroup.values.map((value) => ({
        value: value.value,
        type: value.type,
        objectReference: value.objectReference ?? "",
        matchConfidence: value.matchConfidence ?? "",
        runtimePath: value.runtimePath ?? "",
      })),
    },
  };
}