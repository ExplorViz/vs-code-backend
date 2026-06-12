export enum IDEApiDest {
  VizDo = "vizDo",
  IDEDo = "ideDo",
}

export enum IDEApiActions {
  Refresh = "refresh",
  SingleClickOnMesh = "singleClickOnMesh",
  DoubleClickOnMesh = "doubleClickOnMesh",
  ClickTimeline = "clickTimeLine",
  GetVizData = "getVizData",
  JumpToLocation = "jumpToLocation",
  JumpToMonitoringClass = "jumpToMonitoringClass",
  DisconnectFrontend = 'disconnectFrontend',
  DisconnectIDE = 'disconnectIDE',
}

export type WatchedVariableId = string;
export type VariableName = string;
export type OwnerType = string;

export type MatchConfidence =
  | "declaration-location"
  | "owner-type"
  | "known-subtype"
  | "name-only";

export type ExtensionRuntimeVariableValue = {
  value: string;
  type: string;

  /**
   * Runtime-local owner object identity, e.g. "DebugClass@41".
   * Only meaningful within the same debug session.
   */
  objectReference?: string;

  matchConfidence?: MatchConfidence;
  runtimePath?: string;
};

export type ExtensionRuntimeOwnerGroup = {
  ownerType: OwnerType;
  values: ExtensionRuntimeVariableValue[];
};

export type ExtensionVariableSnapshotEntry = {
  id: WatchedVariableId;
  name: VariableName;
  definitionUri: string;

  sourcePath: string;
  fileName: string;
  packageName: string;
  className: string;

  ownerGroup: ExtensionRuntimeOwnerGroup;
};

export type ExtensionDebugSnapshotData = {
  landscapeToken: string;
  debugRunId: string;
  repositoryName: string;
  commitHash: string;
  epochNano: number;
  variables: ExtensionVariableSnapshotEntry[];
};

export type TextSelection = {
  documentUri: string;
  startLine: number;
  startCharPos: number;
  endLine: number;
  endCharPos: number;
} | null;

export type RoomJoinPayload = {
  roomId: string;
};

export type UserInfoMap = {
  userId: string;
  userInfoObj: UserInfo;
};

export type UserInfo = {
  userId: string;
  socketId: string;
  room: string;
};

export type UserInfoInitPayload = {
  userId: string;
  isFrontend: boolean;
};

type CommunicationLink = {
  sourceMeshID: string;
  targetMeshID: string;
  meshID: string;
};

export type IDEApiCall = {
  action: IDEApiActions;
  data: OrderTuple[];
  meshId: string;
  occurrenceID: number;
  fqn: string;
  foundationCommunicationLinks: CommunicationLink[];
};

export type ParentOrder = {
  fqn: string;
  childs: ParentOrder[];
  meshId: string;
};

export type OrderTuple = {
  hierarchyModel: ParentOrder;
  meshes: { meshNames: string[]; meshIds: string[] };
};

export type classMethod = {
  name: string;
  fqn: string;
  lineString: string;
  lineNumber: number;
  // meshId: string,
  // fileLocation: string,
};

export type FoundationOccurrences = {
  foundation: string;
  occurrences: number[];
};

export type LocationFind = {
  javaFiles: string[];
  dirs: string[];
  javaFile: string[];
};


// represents a value in of a variable at runtim
export type StateValue = {
  objReference: number; // unique identifier for the scope containing the variable (most often an object)
  value: string;
  type: string;
};

// represents a class with the values of the variables contained in different instances
export type ExtensionClassEntry = {
  className: string;
  values: StateValue[];
};

// represents a vaiable by its name and the classes its contained in
export type ExtensionVariableEntry = {
  varname: string;
  classes: ExtensionClassEntry[];
};

export type FrontendClassEntry = {
  className: string;
  instances: FrontendClassInstanceEntry[];
  methods: FrontendClassInstanceEntry[];
};

export type FrontendClassInstanceEntry = {
  instanceId: number;
  variables : FrontendVariableEntry[];
  methodName? :string;
};

 export type FrontendVariableEntry = {
  id: string;
  name: string;
  type : string;
  value: string;
};

export type DebugSnapshot = {
  timestamp: number;
  classes: FrontendClassEntry[];
};

export function turnVariableEntriesToDebugSnapshot(entries: ExtensionVariableEntry[],  timestamp: number) : DebugSnapshot {
  const classNameToClassMap = new Map<string,FrontendClassEntry>();
  const instanceIdToInstanceMap = new Map<number, FrontendClassInstanceEntry>();
  
  const classArray : FrontendClassEntry[] = [];
  entries.forEach(varEntry =>
    varEntry.classes.forEach(classEntry =>
      classEntry.values.forEach(stateValue => {
        let className = classEntry.className;
        let methodname: string | undefined = undefined;

        if (classEntry.className.endsWith(')') && classEntry.className.includes('(') && classEntry.className.includes('.')) {
          const names = classEntry.className.split('.');
          className = names[0];
          methodname = names[1];
        } 
        let clazz = classNameToClassMap.get(className);

        if (!clazz) {
          clazz = {className: className , instances: [], methods: []};
          classArray.push(clazz);
          classNameToClassMap.set(className, clazz!);
        }
        let instance = instanceIdToInstanceMap.get(stateValue.objReference);

        if (!instance) {
          instance = {instanceId: stateValue.objReference, variables: [], methodName: methodname};
          methodname ? clazz!.methods.push(instance!) : clazz!.instances.push(instance!);
          instanceIdToInstanceMap.set(stateValue.objReference, instance!);
        }
        instance!.variables.push({
          id: generateUuidv4(),
          name: varEntry.varname, 
          type: stateValue.type,
          value: stateValue.value
        });

      })
    )
  );

  return { timestamp, classes: classArray };
}


export function generateUuidv4(): string {
  // https://stackoverflow.com/questions/105034/how-do-i-create-a-guid-uuid
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}